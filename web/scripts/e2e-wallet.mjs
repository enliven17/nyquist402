// End-to-end check of the wallet demo against a running dev server, with a fresh keypair standing
// in for the browser wallet. Usage: node scripts/e2e-wallet.mjs [baseUrl] [--reclaim]
import assert from "node:assert/strict";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { x402Client } from "@x402/core/client";
import { AuthCaptureStellarScheme } from "@x402/stellar/auth-capture/client";

const base = process.argv.find(a => a.startsWith("http")) ?? "http://localhost:3402";
const withReclaim = process.argv.includes("--reclaim");
const kp = Keypair.random();
const address = kp.publicKey();

const post = async body => (await fetch(`${base}/api/demo`, { method: "POST", body: JSON.stringify(body) })).json();
const status = async hash =>
  (await fetch(`${base}/api/demo?payer=${address}${hash ? `&paymentHash=${hash}` : ""}`)).json();
const signTx = xdr => {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  tx.sign(kp);
  return tx.toXDR();
};
async function signed(body) {
  const step = await post(body);
  assert.ok(step.ok, step.error);
  if (!step.xdr) return step;
  const done = await post({ action: "submit", xdr: signTx(step.xdr) });
  assert.ok(done.ok, done.error);
  return done;
}
async function pay() {
  const { quoteId, paymentRequired } = await post({ action: "quote" });
  const client = new x402Client()
    .setSpendControls(false)
    .register("stellar:testnet", new AuthCaptureStellarScheme({ address, ...basicNodeSigner(kp, Networks.TESTNET) }));
  const step = await post({ action: "pay", quoteId, payload: await client.createPaymentPayload(paymentRequired) });
  assert.ok(step.ok, step.error);
  return step;
}

await signed({ action: "faucet", address });
assert.equal((await status()).balances.agent, "100000000");
console.log("faucet: 10.00 DEMOUSD");

const first = await pay();
let s = await status(first.paymentHash);
assert.equal(s.balances.agent, "90000000");
assert.equal(s.state.capturable, "10000000");
console.log("pay: 1.00 held in escrow");

assert.ok((await post({ action: "capture", paymentHash: first.paymentHash, amount: "6000000", voidRemainder: true })).ok);
assert.ok((await post({ action: "refund", paymentHash: first.paymentHash, amount: "2000000" })).ok);
s = await status(first.paymentHash);
assert.equal(s.balances.agent, "96000000");
console.log("capture 0.60 + refund 0.20: payer at 9.60");

const early = await post({ action: "reclaim", address, paymentHash: first.paymentHash });
assert.equal(early.ok, false);
console.log(`reclaim before deadline rejected: ${early.error.slice(0, 60)}`);

if (withReclaim) {
  const second = await pay();
  const wait = second.captureDeadline * 1000 - Date.now() + 15_000;
  console.log(`waiting ${Math.round(wait / 1000)}s for the capture window to close`);
  await new Promise(r => setTimeout(r, wait));
  await signed({ action: "reclaim", address, paymentHash: second.paymentHash });
  s = await status(second.paymentHash);
  assert.equal(s.balances.agent, "96000000");
  assert.equal(s.state.capturable, "0");
  console.log("reclaim after deadline: hold returned to payer");
}
console.log("ok");
