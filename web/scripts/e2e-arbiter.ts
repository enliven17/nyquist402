// Real testnet check of buyer-chosen, demo-operated arbiters. Never run automatically.
// From web: node --conditions=react-server --env-file=.env.local --experimental-strip-types scripts/e2e-arbiter.ts
import assert from "node:assert/strict";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { arbitrate, config, prepare, protectedClient, quote } from "../lib/protected/demo.ts";
import { hashText } from "../lib/protected/codec.ts";
import type { ProtectedAction } from "../lib/protected/types.ts";

const buyer = Keypair.fromSecret(process.env.DEMO_AGENT_SECRET!);
const client = protectedClient();
const c = await config();
const chosen = c.arbiters.find(a => !a.isDefault);
assert.ok(chosen, "DEMO_ARBITER_SECRETS needs at least one non-default arbiter");

const offer = await quote({
  payer: buyer.publicKey(),
  agreementHash: await hashText("e2e: buyer-chosen arbiter"),
  buyerArbiter: chosen.address,
  fallbackSellerBps: 5000,
});
assert.equal(offer.terms.seller_arbiter, chosen.address, "seller did not agree to the buyer's arbiter");

async function send(label: string, action: ProtectedAction) {
  const prepared = await prepare({ source: buyer.publicKey(), action, capability: offer.capability });
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
  tx.sign(buyer);
  const { tx: hash } = await client.submit(prepared, tx.toXDR());
  console.log(`${label}: ${hash}`);
}

const paymentId = offer.paymentId;
await send("authorize", { type: "authorize", terms: offer.terms });
await send("claim", { type: "claim", paymentId, amount: "30000000", delivery: await hashText("3.00 of work") });
await send("dispute", { type: "dispute", paymentId, claimId: 0, party: buyer.publicKey(), evidence: await hashText("incomplete") });
assert.equal(await client.arbiter(paymentId, 0), chosen.address, "case is not held by the chosen arbiter");

const claim = await client.claimState(paymentId, 0);
const wait = (claim.response_until + 8) * 1000 - Date.now();
console.log(`waiting ${Math.round(wait / 1000)}s for the evidence window to close`);
await new Promise(r => setTimeout(r, Math.max(0, wait)));

const ruled = await arbitrate({ paymentId, claimId: 0, sellerAmount: "15000000" });
console.log(`${ruled.arbiter} ruled: ${ruled.tx}`);
const settled = await client.claimState(paymentId, 0);
assert.equal(settled.status, "Settled");
assert.equal(settled.seller_award, "15000000");
console.log("ok: chosen arbiter ruled 1.50 to the seller, 1.50 back to the buyer");
