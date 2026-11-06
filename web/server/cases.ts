import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { assertHash, integer, computePaymentId, jsonNative } from "../lib/protected/codec.ts";
import { protectedClient } from "../lib/protected/demo.ts";
import { verifyCapability } from "../lib/protected/capability.ts";
import * as store from "./store.ts";

export async function caseAccess(account: string, paymentId: unknown, claimId: unknown, capability?: unknown, client = protectedClient()) {
  assertHash(paymentId);
  const terms = await client.terms(paymentId);
  const claim = integer(claimId,0,0xffffffff);
  const arbiter = account === terms.payer || account === terms.seller ? null : await client.arbiter(paymentId,claim);
  const allowed = account === terms.payer || account === terms.seller || account === arbiter;
  if (!allowed) throw new Error("Only this payment's parties and current arbiter can access case material");
  // Demo seller delegation is deliberately payment-scoped and still needs a buyer session.
  const sellerControl = account === terms.seller || (account === terms.payer && typeof capability === "string" && (() => {
    verifyCapability(capability,{network: Networks.TESTNET,contractId:client.contractId,paymentId},process.env.DEMO_SESSION_SECRET ?? ""); return true;
  })());
  return { client,terms,claim,sellerControl };
}
export async function material(account: string, body: Record<string,unknown>) {
  const {client,terms,claim,sellerControl} = await caseAccess(account,body.paymentId,body.claimId,body.capability);
  if (body.operation === "case_read") {
    const state = await client.claimState(body.paymentId as string,claim);
    const records = store.bodies(client.contractId,body.paymentId as string,claim);
    return { records, commitments: { delivery: state.delivery,buyer: state.buyer_evidence,seller: state.seller_evidence,revision:state.revision } };
  }
  const party = body.party;
  if (party !== account && !(party === terms.seller && sellerControl)) throw new Error("Cannot submit material for another participant");
  if (party !== terms.payer && party !== terms.seller) throw new Error("Arbiters cannot alter participant evidence");
  if (body.kind === "delivery" && party !== terms.seller) throw new Error("Only the seller records delivery");
  return store.storeBody(client.contractId,body.paymentId as string,party as string,String(body.kind),claim,body.body as string);
}
export async function trackTransaction(account: string, body: Record<string,unknown>) {
  assertHash(body.paymentId);
  if (typeof body.xdr !== "string" || body.xdr.length > 20000) throw new Error("Invalid signed transaction");
  const tx = TransactionBuilder.fromXDR(body.xdr,Networks.TESTNET);
  if (!(tx instanceof Transaction) || tx.source !== account || !tx.signatures.some(s=>Keypair.fromPublicKey(account).verify(tx.hash(),s.signature()))) throw new Error("Signed wallet transaction required");
  const client = protectedClient();
  const op = tx.operations[0];
  if (tx.operations.length !== 1 || op.type !== "invokeHostFunction" || op.func.switch().name !== "hostFunctionTypeInvokeContract") throw new Error("Protected call required");
  const invoke = op.func.invokeContract();
  const { Address } = await import("@stellar/stellar-sdk");
  if (Address.fromScAddress(invoke.contractAddress()).toString() !== client.contractId) throw new Error("Wrong deployment");
  const action = invoke.functionName().toString();
  if (!["authorize","claim","accept","dispute","submit_evidence","rule","settle","finalize_fallback","reclaim","void_unclaimed"].includes(action)) throw new Error("Unsupported action");
  const {scValToNative}=await import("@stellar/stellar-sdk");
  if (action === "authorize") {
    const raw=jsonNative(scValToNative(invoke.args()[0])) as import("../lib/protected/types.ts").PaymentTerms & Record<string,unknown>;
    if ("protocol_reserve" in raw) {
      raw.fees=Object.fromEntries(["protocol_reserve","arbitration_reserve","protocol_bps","protocol_recipient","custom_fee","default_fee","case_fee_cap","custom_quote","default_quote"].map(key=>[key,raw[key]])) as typeof raw.fees;
      for(const key of Object.keys(raw.fees!)) delete raw[key];
      raw.fees!.protocol_bps=Number(raw.fees!.protocol_bps);
    }
    // jsonNative renders u64 as strings; PaymentTerms carries them as numbers.
    for(const key of ["fund_by","delivery_deadline","review_seconds","response_seconds","arbiter_seconds","default_seconds","fallback_seller_bps"] as const) raw[key]=Number(raw[key]);
    if (await computePaymentId(raw,client.contractId,Networks.TESTNET)!==body.paymentId) throw new Error("Funding does not match the payment ID");
  } else {
    const id=jsonNative(scValToNative(invoke.args()[0]));
    if (id!==body.paymentId) throw new Error("Transaction does not match this payment");
    const terms=await client.terms(body.paymentId);
    const arbiter=action==="rule"?await client.arbiter(body.paymentId,Number(scValToNative(invoke.args()[1]))):null;
    if (![terms.payer,terms.seller,arbiter].includes(account)) throw new Error("Not a payment participant");
  }
  const hash = tx.hash().toString("hex");
  store.track(hash,client.contractId,body.paymentId,account,action);
  return { tx:hash };
}
