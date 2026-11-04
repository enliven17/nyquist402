import assert from "node:assert/strict";
import { test } from "node:test";
import { claimActions, formatAmount, parseAmount, validateQuote } from "../lib/protected/flow.ts";
import { computePaymentId } from "../lib/protected/codec.ts";
import { terms, contract } from "./fixtures/terms.ts";
import { Networks } from "@stellar/stellar-sdk";
const review = { status: "Review", review_until: 200, response_until: 0, fallback_at: 0 } as never;

test("UI uses exact onchain review/response/fallback boundaries", () => {
  assert.equal(typeof claimActions, "function", "deadline availability missing");
  assert.deepEqual(claimActions(review, 199), { accept: true, dispute: true, evidence: false, settle: false, rule: false, fallback: false });
  assert.deepEqual(claimActions(review, 200), { accept: true, dispute: false, evidence: false, settle: true, rule: false, fallback: false });
  const disputed = { status: "Disputed", review_until: 200, response_until: 250, fallback_at: 400 } as never;
  assert.equal(claimActions(disputed, 249).evidence, true);
  assert.equal(claimActions(disputed, 250).rule, true);
  assert.equal(claimActions(disputed, 400).rule, false);
  assert.equal(claimActions(disputed, 400).fallback, true);
  assert.equal(claimActions({ ...disputed as object, status: "Settled" } as never, 500).fallback, false);
});

test("token inputs preserve seven decimals without floating-point rounding", () => {
  assert.equal(typeof parseAmount, "function", "exact token parsing missing");
  assert.equal(parseAmount("3.1234567"), "31234567");
  assert.equal(formatAmount("31234567"), "3.1234567");
  assert.equal(parseAmount("17014118346046923173168730371588.4105727"), "170141183460469231731687303715884105727");
  assert.throws(() => parseAmount("0.00000001"));
  assert.throws(() => parseAmount("-1"));
});

test("quote validation rejects downgraded protocol, wrong payer and changed fallback", async () => {
  const input = { payer: terms.payer, agreementHash: terms.agreement, buyerArbiter: terms.buyer_arbiter, fallbackSellerBps: terms.fallback_seller_bps };
  const config = { contractId: contract, networkPassphrase: Networks.TESTNET, token: terms.token, seller: terms.seller, defaultArbiter: terms.default_arbiter, sellerArbiter: terms.seller_arbiter, preset: { budget: terms.max_amount, session: 360, review: 120, response: 60, custom: 90, default: 90 } } as never;
  const quote = { protocol: "nyquist402:protected:v1", terms, paymentId: await computePaymentId(terms, contract, Networks.TESTNET), capability: "test" };
  assert.equal(typeof validateQuote, "function", "protected offer validation missing");
  await assert.doesNotReject(validateQuote(quote, config, input, 1800000000));
  await assert.rejects(validateQuote({ ...quote, protocol: "auth-capture" }, config, input, 1800000000));
  await assert.rejects(validateQuote(quote, config, { ...input, fallbackSellerBps: 5000 }, 1800000000));
  await assert.rejects(validateQuote(quote, config, { ...input, payer: terms.seller }, 1800000000));
});

import * as flow from "../lib/protected/flow.ts";
test("fallback decimal percentages become exact basis points", () => {
  assert.equal(typeof flow.parsePercentBps, "function", "exact percentage parsing missing");
  for (const [input, expected] of [["0.29", 29], ["0.57", 57], ["1.13", 113], ["50", 5000], ["100.00", 10000], ["0", 0]] as const) assert.equal(flow.parsePercentBps(input), expected);
  for (const invalid of ["", "100.01", "-1", "0.001", "Infinity", "1e2"]) assert.throws(() => flow.parsePercentBps(invalid));
});
