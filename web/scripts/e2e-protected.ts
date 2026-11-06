// Real testnet check, never run automatically. Existing agent and seller need official Circle USDC trustlines.
// From web: node --experimental-strip-types scripts/e2e-protected.ts [--reclaim]
import { USDC_CONTRACT } from "../lib/usdc.ts";
import { resolveProtectedDeployment } from "../lib/deployment.ts";
import { loadServerEnvironment } from "../server/env.ts";
import assert from "node:assert/strict";
import { authorizeEntry, Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";
import { ProtectedEscrowClient, computePaymentId, hashText } from "../lib/protected/index.ts";
import type { PaymentTerms, ProtectedAction } from "../lib/protected/types.ts";
loadServerEnvironment();
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} required`); return value; };
const buyer = Keypair.fromSecret(required("DEMO_AGENT_SECRET"));
const seller = Keypair.fromSecret(required("DEMO_MERCHANT_SECRET"));
const client = new ProtectedEscrowClient({ ...resolveProtectedDeployment(process.env), rpcUrl: "https://soroban-testnet.stellar.org", networkPassphrase: Networks.TESTNET });
const now = Math.floor(Date.now() / 1000);

const terms: PaymentTerms = {
  payer: buyer.publicKey(), seller: seller.publicKey(), token: USDC_CONTRACT,
  agreement: await hashText("Integration test: $10/$3 paid/$4 disputed/$3 unused"), max_amount: "100000000",
  fund_by: now + 120, delivery_deadline: now + 180, buyer_arbiter: null, seller_arbiter: null,
  default_arbiter: await client.defaultArbiter(), review_seconds: 120, response_seconds: 60,
  arbiter_seconds: 60, default_seconds: 60, fallback_seller_bps: 5000, salt: randomBytes(32).toString("hex"),
};
terms.fees={
  protocol_reserve:"0",arbitration_reserve:"0",protocol_bps:0,protocol_recipient:seller.publicKey(),
  custom_fee:"0",default_fee:"0",case_fee_cap:"0",custom_quote:null,default_quote:null,
};
const paymentId = await computePaymentId(terms, client.contractId, Networks.TESTNET);
console.log(`Recovery payment ID: ${paymentId}`);
async function send(signer: Keypair, action: ProtectedAction) {
  const prepared = await client.prepare(signer.publicKey(), action, async (address, entry, until) => {
    const key = [buyer, seller].find(k => k.publicKey() === address);
    if (!key) throw new Error(`Unexpected signer ${address}`);
    return authorizeEntry(entry, key, until, Networks.TESTNET);
  });
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
  assert.ok(tx instanceof Transaction); tx.sign(signer);
  const done = await client.submit(prepared, tx.toXDR());
  console.log(`${action.type}: ${done.tx}`); return done;
}
await send(buyer, { type: "authorize", terms });
const first = await send(seller, { type: "claim", paymentId, amount: "30000000", delivery: await hashText("first result") });
assert.equal(first.value, 0);
const c = await client.claimState(paymentId, 0);
await send(buyer, { type: "accept", paymentId, claimId: 0, commitment: c.commitment });
await send(seller, { type: "claim", paymentId, amount: "40000000", delivery: await hashText("second result") });
await send(buyer, { type: "dispute", paymentId, claimId: 1, party: buyer.publicKey(), evidence: await hashText("buyer disputes second result") });
await send(seller, { type: "submit_evidence", paymentId, claimId: 1, party: seller.publicKey(), evidence: await hashText("seller responds") });
let state = await client.state(paymentId);
assert.equal(state.paid_to_seller, "30000000"); assert.equal(state.reserved, "40000000"); assert.equal(state.available, "30000000");
// New client instance proves payment/claim recovery does not require the old server's Maps.
const recovered = new ProtectedEscrowClient({ contractId: client.contractId, rpcUrl: "https://soroban-testnet.stellar.org", networkPassphrase: Networks.TESTNET });
assert.equal((await recovered.claimState(paymentId, 1)).status, "Disputed");
if (process.argv.includes("--reclaim")) {
  while (Date.now() / 1000 < terms.delivery_deadline + 5) await new Promise(resolve => setTimeout(resolve, 1000));
  await send(buyer, { type: "reclaim", paymentId });
  state = await recovered.state(paymentId);
  assert.equal(state.available, "0"); assert.equal(state.returned_to_buyer, "30000000"); assert.equal(state.reserved, "40000000");
}
console.log("Protected integration passed. Claim 1 remains disputed; use the arbiter or wait for its signed fallback. Save the recovery ID.");
