import assert from "node:assert/strict";
import { test } from "node:test";
import { Address, Keypair, Networks, scValToNative, StrKey } from "@stellar/stellar-sdk";
import * as codec from "../lib/protected/codec.ts";

import { keys, contract, terms } from "./fixtures/terms.ts";

test("encoding preserves i128 precision and optional arbiters", () => {
  assert.equal(typeof codec.termsToScVal, "function", "protected terms codec is missing");
  const decoded = scValToNative(codec.termsToScVal({ ...terms, max_amount: "170141183460469231731687303715884105727", buyer_arbiter: null }));
  assert.equal(decoded.max_amount, 170141183460469231731687303715884105727n);
  assert.equal(decoded.buyer_arbiter, null);
  assert.equal(decoded.seller_arbiter, keys[2]);
});

test("payment identity binds network, contract and every signed term", async () => {
  assert.equal(typeof codec.computePaymentId, "function", "protected identity is missing");
  const original = await codec.computePaymentId(terms, contract, Networks.TESTNET);
  for (const changed of [{ ...terms, fallback_seller_bps: 5000 }, { ...terms, review_seconds: 121 }, { ...terms, agreement: "09".repeat(32) }]) {
    assert.notEqual(await codec.computePaymentId(changed, contract, Networks.TESTNET), original);
  }
  assert.notEqual(await codec.computePaymentId(terms, contract, Networks.PUBLIC), original);
  assert.notEqual(await codec.computePaymentId(terms, Address.contract(Buffer.alloc(32, 9)).toString(), Networks.TESTNET), original);
});

test("policy validation rejects hidden identity and economic changes", () => {
  assert.equal(typeof codec.validateTerms, "function", "policy validation is missing");
  assert.doesNotThrow(() => codec.validateTerms(terms, { contractId: contract, defaultArbiter: keys[3], now: 1800000000 }));
  for (const bad of [
    { ...terms, fallback_seller_bps: 10001 }, { ...terms, max_amount: "0" },
    { ...terms, max_amount: "170141183460469231731687303715884105728" },
    { ...terms, fund_by: terms.delivery_deadline }, { ...terms, response_seconds: 0 },
    { ...terms, default_arbiter: keys[2] }, { ...terms, seller: terms.payer },
    { ...terms, buyer_arbiter: terms.payer, seller_arbiter: terms.payer },
    { ...terms, review_seconds: Number.MAX_SAFE_INTEGER },
  ]) assert.throws(() => codec.validateTerms(bad, { contractId: contract, defaultArbiter: keys[3], now: 1800000000 }));
  assert.throws(() => codec.validateTerms(terms, { contractId: contract, defaultArbiter: keys[3], now: terms.fund_by }));
});

test("typed actions reject unsupported capture and bind exact claim revision", () => {
  assert.equal(typeof codec.actionToCall, "function", "protected action builder is missing");
  assert.throws(() => codec.actionToCall({ type: "capture", paymentId: "aa".repeat(32) } as never));
  const call = codec.actionToCall({ type: "rule", paymentId: "aa".repeat(32), claimId: 2, sellerAmount: "30000000", revision: 7 });
  assert.equal(call.method, "rule");
  assert.deepEqual(call.args.map(scValToNative), [Buffer.alloc(32, 0xaa), 2, 30000000n, 7]);
  assert.throws(() => codec.actionToCall({ type: "claim", paymentId: "aa".repeat(32), amount: "-1", delivery: "bb".repeat(32) }));
});

test("terms XDR and payment ID match the independently produced Rust vector", async () => {
  const { readFileSync } = await import("node:fs");
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/protected-encoding.json", import.meta.url), "utf8"));
  assert.equal(codec.termsToScVal(terms).toXDR("hex"), fixture.termsXdrHex);
  assert.equal(await codec.computePaymentId(terms, contract, Networks.TESTNET), fixture.paymentId);
});
