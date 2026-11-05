import { randomBytes } from "node:crypto";
import { authorizeEntry, Keypair, Networks, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { ProtectedEscrowClient } from "./client.ts";
import { assertAddress, assertHash, CAPABILITY, computePaymentId, integer, termsToScVal, validateTerms } from "./codec.ts";
import { issueCapability, parseRequest } from "./capability.ts";
import { authorizeDemoAction } from "./policy.ts";
import { operatedArbiters, publicRoster } from "./arbiters.ts";
import { sellerArbiterFor } from "./flow.ts";
import type { DemoConfig, PaymentTerms } from "./types.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured. See web/.env.example and the protected SDK README.`);
  return value;
}
export function protectedClient(): ProtectedEscrowClient {
  return new ProtectedEscrowClient({ contractId: env("DEMO_PROTECTED_ESCROW"), networkPassphrase: Networks.TESTNET, rpcUrl: "https://soroban-testnet.stellar.org" });
}
export async function config(): Promise<DemoConfig> {
  const client = protectedClient();
  const seller = Keypair.fromSecret(env("DEMO_MERCHANT_SECRET")).publicKey();
  const token = env("DEMO_TOKEN"); assertAddress(token, true);
  const sellerArbiter = process.env.DEMO_SELLER_ARBITER || null;
  if (sellerArbiter) assertAddress(sellerArbiter);
  const defaultArbiter = await client.defaultArbiter();
  return {
    contractId: client.contractId, networkPassphrase: Networks.TESTNET, rpcUrl: "https://soroban-testnet.stellar.org",
    token, seller, sellerArbiter, defaultArbiter, arbiters: publicRoster(operatedArbiters(defaultArbiter)),
    preset: { budget: "100000000", session: 360, review: 120, response: 60, custom: 90, default: 90 },
  };
}
export async function quote(request: Record<string, unknown>) {
  const c = await config();
  const payer = request.payer;
  if (typeof payer !== "string" || !StrKey.isValidEd25519PublicKey(payer)) throw new Error("A buyer account is required");
  const agreement = request.agreementHash; assertHash(agreement);
  const preferred = request.buyerArbiter ?? null;
  if (preferred !== null) assertAddress(preferred);
  if (preferred !== null && c.arbiters.length && !c.arbiters.some(a => a.address === preferred)) throw new Error("Choose an arbiter from the demo roster");
  const fallback = integer(request.fallbackSellerBps, 0, 10000);
  const now = Math.floor(Date.now() / 1000);
  const terms: PaymentTerms = {
    payer, seller: c.seller, token: c.token, agreement, max_amount: c.preset.budget,
    fund_by: now + 120, delivery_deadline: now + c.preset.session,
    buyer_arbiter: preferred, seller_arbiter: sellerArbiterFor(preferred, c), default_arbiter: c.defaultArbiter,
    review_seconds: c.preset.review, response_seconds: c.preset.response,
    arbiter_seconds: c.preset.custom, default_seconds: c.preset.default,
    fallback_seller_bps: fallback, salt: randomBytes(32).toString("hex"),
  };
  validateTerms(terms, { contractId: c.contractId, defaultArbiter: c.defaultArbiter, now });
  const paymentId = await computePaymentId(terms, c.contractId, c.networkPassphrase);
  const remoteId = await protectedClient().read("payment_hash", [termsToScVal(terms)]);
  if (remoteId !== paymentId) throw new Error("Protected deployment identity is incompatible with this SDK");
  const capability = issueCapability({ network: c.networkPassphrase, contractId: c.contractId, paymentId }, env("DEMO_SESSION_SECRET"));
  return { protocol: CAPABILITY, terms, paymentId, capability };
}
export async function prepare(request: Record<string, unknown>) {
  const source = request.source;
  if (typeof source !== "string" || !StrKey.isValidEd25519PublicKey(source)) throw new Error("Connected fee-paying wallet required");
  const action = parseRequest(request.action);
  const client = protectedClient();
  const seller = Keypair.fromSecret(env("DEMO_MERCHANT_SECRET"));
  const terms = action.type === "authorize" ? action.terms : await client.terms(action.paymentId);
  if (terms.seller !== seller.publicKey() || terms.token !== env("DEMO_TOKEN")) throw new Error("Payment is outside this demo seller/token");
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
  if (terms.seller !== Keypair.fromSecret(env("DEMO_MERCHANT_SECRET")).publicKey() || terms.token !== env("DEMO_TOKEN")) throw new Error("Payment is outside this demo seller/token");
  const [claim, current] = await Promise.all([client.claimState(paymentId, claimId), client.arbiter(paymentId, claimId)]);
  if (BigInt(sellerAmount) > BigInt(claim.amount)) throw new Error("Award exceeds the claim");
  const arbiter = operatedArbiters(await client.defaultArbiter()).find(a => a.address === current);
  if (!arbiter) throw new Error("The current arbiter is not operated by this demo; its own wallet must rule");
  const prepared = await client.prepare(arbiter.address, { type: "rule", paymentId, claimId, sellerAmount, revision: claim.revision });
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
  tx.sign(arbiter.keypair);
  return { ...(await client.submit(prepared, tx.toXDR())), arbiter: arbiter.name };
}
