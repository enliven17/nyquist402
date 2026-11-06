import { usdcStatus } from "../../server/usdc.ts";
import { rememberPayment,track } from "../../server/store.ts";
import { USDC_CONTRACT } from "../usdc.ts";
import { resolveProtectedDeployment } from "../deployment.ts";
import { randomBytes } from "node:crypto";
import { authorizeEntry, Keypair, Networks, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { ProtectedEscrowClient } from "./client.ts";
import { assertAddress, assertHash, computePaymentId, integer, termsToScVal, selectedArbiter, hashText, quoteScope, quoteId, bytes, validateTerms } from "./codec.ts";
import { issueCapability, parseRequest, verifyCapability } from "./capability.ts";
import { authorizeDemoAction } from "./policy.ts";
import { operatedArbiters, publicRoster } from "./arbiters.ts";
import { sellerArbiterFor } from "./flow.ts";
import type { DemoConfig, PaymentTerms } from "./types.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured. Set it in web/.env (or web/.env.local), then restart the server.`);
  return value;
}
export function protectedClient(): ProtectedEscrowClient {
  return new ProtectedEscrowClient({ ...resolveProtectedDeployment(process.env), networkPassphrase: Networks.TESTNET, rpcUrl: "https://soroban-testnet.stellar.org" });
}
export async function config(): Promise<DemoConfig> {
  const client = protectedClient();
  const seller = Keypair.fromSecret(env("DEMO_MERCHANT_SECRET")).publicKey();
  const token = USDC_CONTRACT; assertAddress(token, true);
  const sellerArbiter = process.env.DEMO_SELLER_ARBITER || null;
  if (sellerArbiter) assertAddress(sellerArbiter);
  const defaultArbiter = await client.defaultArbiter();
  const { version } = resolveProtectedDeployment(process.env);
  if (Number(await client.read("version")) !== version) throw new Error("Configured escrow does not support the required protected payment schema");
  const fees = {
    protocol_reserve: process.env.DEMO_PROTOCOL_RESERVE ?? "0",
    arbitration_reserve: process.env.DEMO_ARBITRATION_RESERVE ?? "0",
    protocol_bps: Number(process.env.DEMO_PROTOCOL_BPS ?? 0),protocol_recipient:process.env.DEMO_PROTOCOL_RECIPIENT || seller,
    custom_fee:process.env.DEMO_CUSTOM_FEE ?? "0",default_fee:process.env.DEMO_DEFAULT_FEE ?? "0",case_fee_cap:process.env.DEMO_CASE_FEE_CAP ?? "0",custom_quote:null,default_quote:null,
  };
  const recipients=new Set([seller]);
  if (fees && fees.protocol_bps>0) recipients.add(fees.protocol_recipient);
  if (fees && BigInt(fees.default_fee)>0n) recipients.add(defaultArbiter);
  if (fees && BigInt(fees.custom_fee)>0n) for(const arbiter of publicRoster(operatedArbiters(defaultArbiter))) recipients.add(arbiter.address);
  const statuses=await Promise.all([...recipients].map(async address=>({address,...await usdcStatus(address)})));
  const missingRecipients=statuses.filter(status=>!status.trustline).map(status=>status.address);
  return {
    readiness:{ready:missingRecipients.length===0,missingRecipients},
    contractId: client.contractId, networkPassphrase: Networks.TESTNET, rpcUrl: "https://soroban-testnet.stellar.org",
    token, seller, sellerArbiter, defaultArbiter, version, fees, arbiters: publicRoster(operatedArbiters(defaultArbiter)),
    preset: { budget: "100000000", session: 360, review: 120, response: 60, custom: 90, default: 90 },
  };
}
export async function quote(request: Record<string, unknown>) {
  const c = await config();
  if (c.readiness && !c.readiness.ready) throw new Error("Demo recipient USDC trustlines are not configured. The operator must complete scripts/setup-usdc.mjs before funding.");
  const payer = request.payer;
  if (typeof payer !== "string" || !StrKey.isValidEd25519PublicKey(payer)) throw new Error("A buyer account is required");
  const agreement = request.agreementHash; assertHash(agreement);
  if(typeof request.agreement!=="string" || Buffer.byteLength(request.agreement)>10000 || !request.agreement.trim() || await hashText(request.agreement)!==agreement) throw new Error("Agreement body must match its signed commitment");
  const preferred = request.buyerArbiter ?? null;
  if (preferred !== null) assertAddress(preferred);
  if (preferred !== null && c.arbiters.length && !c.arbiters.some(a => a.address === preferred)) throw new Error("Choose an arbiter from the demo roster");
  const fallback = integer(request.fallbackSellerBps, 0, 10000);
  const now = Math.floor(Date.now() / 1000);
  const terms: PaymentTerms = {
    ...(c.fees ? {fees:{...c.fees,custom_fee:!preferred || preferred === c.defaultArbiter ? "0":c.fees.custom_fee}}:{}),
    payer, seller: c.seller, token: c.token, agreement, max_amount: c.preset.budget,
    fund_by: now + 120, delivery_deadline: now + c.preset.session,
    buyer_arbiter: preferred, seller_arbiter: sellerArbiterFor(preferred, c), default_arbiter: c.defaultArbiter,
    review_seconds: c.preset.review, response_seconds: c.preset.response,
    arbiter_seconds: c.preset.custom, default_seconds: c.preset.default,
    fallback_seller_bps: fallback, salt: randomBytes(32).toString("hex"),
  };
  if (terms.fees) {
    const client = protectedClient();
    const scope = await quoteScope(terms,c.contractId,c.networkPassphrase);
    const roster = operatedArbiters(c.defaultArbiter);
    const register = async (address:string,fee:string) => {
      if (fee === "0") return null;
      const arbiter = roster.find(a=>a.address===address);
      if (!arbiter) throw new Error("A paid demo arbiter must be explicitly configured");
      const feeQuote = {scope,arbiter:address,fee,valid_until:terms.fund_by,salt:randomBytes(32).toString("hex")};
      const prepared=await client.prepare(address,{type:"register_quote",quote:feeQuote});
      const tx=TransactionBuilder.fromXDR(prepared.xdr,Networks.TESTNET);tx.sign(arbiter.keypair);
      await client.submit(prepared,tx.toXDR());
      return quoteId(feeQuote);
    };
    terms.fees.default_quote=await register(c.defaultArbiter,terms.fees.default_fee);
    terms.fees.custom_quote=await register(selectedArbiter(terms),terms.fees.custom_fee);
  }
  validateTerms(terms, { contractId: c.contractId, defaultArbiter: c.defaultArbiter, now });
  const paymentId = await computePaymentId(terms, c.contractId, c.networkPassphrase);
  const remoteId = await protectedClient().read("payment_hash", [termsToScVal(terms)]);
  if (remoteId !== paymentId) throw new Error("Protected deployment identity is incompatible with this SDK");
  const capability = issueCapability({ network: c.networkPassphrase, contractId: c.contractId, paymentId }, env("DEMO_SESSION_SECRET"));
  await rememberPayment(c.contractId,paymentId,payer,c.seller,typeof request.agreement === "string" ? request.agreement : "Obtain the original agreement from the parties.");
  return { protocol: "nyquist402:protected:v2", terms, paymentId, capability };
}
export async function prepare(request: Record<string, unknown>) {
  const source = request.source;
  if (typeof source !== "string" || !StrKey.isValidEd25519PublicKey(source)) throw new Error("Connected fee-paying wallet required");
  const action = parseRequest(request.action);
  if (action.type === "register_quote") throw new Error("Arbiter quote registration uses its own signing client");
  const client = protectedClient();
  const seller = Keypair.fromSecret(env("DEMO_MERCHANT_SECRET"));
  const terms = action.type === "authorize" ? action.terms : await client.terms(action.paymentId);
  if (terms.seller !== seller.publicKey() || (action.type === "authorize" && terms.token !== USDC_CONTRACT)) throw new Error("Payment is outside this demo seller/token");
  const paymentId = action.type === "authorize" ? await computePaymentId(terms, client.contractId, client.networkPassphrase) : action.paymentId;
  const scope = { network: client.networkPassphrase, contractId: client.contractId, paymentId };
  const current = action.type === "rule" ? await client.arbiter(paymentId, action.claimId) : undefined;
  const delegate = authorizeDemoAction(action, source, terms, request.capability, scope, env("DEMO_SESSION_SECRET"), current);
  return client.prepare(source, action, delegate ? async (address, entry, until) => {
    if (address !== seller.publicKey()) throw new Error("Server cannot sign buyer or arbiter authorizations");
    return authorizeEntry(entry, seller, until, Networks.TESTNET);
  } : undefined);
}
export async function snapshot(paymentId: string, offset = 0) {
  assertHash(paymentId); integer(offset, 0, 0xffffffff);
  const client = protectedClient();
  const [terms, state] = await Promise.all([client.terms(paymentId), client.state(paymentId)]);
  const end = Math.min(offset + 20, state.next_claim_id);
  const claims = await Promise.all(Array.from({ length: Math.max(0, end - offset) }, async (_, i) => {
    const id = offset + i;
    const [claim, arbiter] = await Promise.all([client.claimState(paymentId, id), client.arbiter(paymentId, id)]);
    return { id, claim, arbiter };
  }));
  return { paymentId, terms, state, claims, nextOffset: end < state.next_claim_id ? end : null };
}

/**
 * Submits a ruling from a demo-operated arbiter. Only the arbiter currently holding the case can
 * rule, and only within the contract's ruling window; the contract enforces both again.
 */
export async function arbitrate(request: Record<string, unknown>) {
  const paymentId = request.paymentId; assertHash(paymentId);
  const claimId = integer(request.claimId, 0, 0xffffffff);
  const sellerAmount = request.sellerAmount;
  if (typeof sellerAmount !== "string" || !/^(0|[1-9][0-9]{0,30})$/.test(sellerAmount)) throw new Error("Invalid seller award");
  const client = protectedClient();
  const terms = await client.terms(paymentId);
  if (request.account !== terms.payer && request.account !== terms.seller) throw new Error("Demo ruling controls require a payment party sign-in");
  verifyCapability(request.capability, {network:client.networkPassphrase,contractId:client.contractId,paymentId},env("DEMO_SESSION_SECRET"));
  if (terms.seller !== Keypair.fromSecret(env("DEMO_MERCHANT_SECRET")).publicKey()) throw new Error("Payment is outside this demo seller/token");
  const [claim, current] = await Promise.all([client.claimState(paymentId, claimId), client.arbiter(paymentId, claimId)]);
  if (BigInt(sellerAmount) > BigInt(claim.amount)) throw new Error("Award exceeds the claim");
  const arbiter = operatedArbiters(await client.defaultArbiter()).find(a => a.address === current);
  if (!arbiter) throw new Error("The current arbiter is not operated by this demo; its own wallet must rule");
  return { ...(await serial(arbiter.address, async () => {
    const prepared = await client.prepare(arbiter.address, { type: "rule", paymentId, claimId, sellerAmount, revision: claim.revision });
    const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
    tx.sign(arbiter.keypair);
    await track(tx.hash().toString("hex"),client.contractId,paymentId,arbiter.address,"rule");
    return client.submit(prepared, tx.toXDR());
  })), arbiter: arbiter.name };
}

// One in-flight transaction per server-held signer, so concurrent rulings never reuse a sequence number.
// ponytail: in-process lock; a multi-instance deployment needs a shared lock or channel accounts.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, next);
  return next;
}
