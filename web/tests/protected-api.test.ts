import assert from "node:assert/strict";
import { test } from "node:test";
import * as cap from "../lib/protected/capability.ts";
import * as history from "../lib/protected/history.ts";
const scope = { network: "Test SDF Network ; September 2015", contractId: "C".repeat(56), paymentId: "aa".repeat(32) };
const secret = "test-only-secret-with-at-least-32-bytes";

test("seller capability rejects tampering and cross-payment/contract replay", () => {
  assert.equal(typeof cap.issueCapability, "function", "seller capability signing is missing");
  const token = cap.issueCapability(scope, secret);
  assert.doesNotThrow(() => cap.verifyCapability(token, scope, secret));
  assert.throws(() => cap.verifyCapability(token, { ...scope, paymentId: "bb".repeat(32) }, secret));
  assert.throws(() => cap.verifyCapability(token, { ...scope, contractId: "D".repeat(56) }, secret));
  assert.throws(() => cap.verifyCapability(token, { ...scope, network: "public" }, secret));
  assert.throws(() => cap.verifyCapability(`${token.slice(0, -6)}abcdef`, scope, secret));
  assert.throws(() => cap.verifyCapability(token, scope, `${secret}changed`));
  assert.throws(() => cap.issueCapability(scope, "short"));
});

test("request parser cannot turn seller delegation into an arbitrary signature", () => {
  assert.equal(typeof cap.parseRequest, "function", "protected request validation is missing");
  assert.throws(() => cap.parseRequest({ type: "invoke", method: "refund", xdr: "whatever" }));
  assert.throws(() => cap.parseRequest({ type: "rule", paymentId: scope.paymentId, claimId: -1, sellerAmount: "0", revision: 0 }));
  assert.throws(() => cap.parseRequest({ type: "claim", paymentId: scope.paymentId, amount: "1", delivery: "bad" }));
  const request = cap.parseRequest({ type: "settle", paymentId: scope.paymentId, claimId: 0 });
  assert.deepEqual(request, { type: "settle", paymentId: scope.paymentId, claimId: 0 });
});

test("recovery history is scoped to network/contract/payer and survives corrupt storage", () => {
  assert.equal(typeof history.historyKey, "function", "protected recovery is missing");
  const key = history.historyKey("network", "contract", "payer");
  assert.notEqual(key, history.historyKey("other", "contract", "payer"));
  assert.notEqual(key, history.historyKey("network", "different", "payer"));
  assert.notEqual(key, history.historyKey("network", "contract", "someone"));
  assert.deepEqual(history.readHistory("invalid json"), []);
  assert.deepEqual(history.readHistory('{"paymentId":"bad"}'), []);
  const records = [{ paymentId: scope.paymentId, agreement: "test agreement", capability: "scoped-token" }];
  assert.deepEqual(history.readHistory(JSON.stringify(records)), records);
  assert.deepEqual(history.readHistory('[{"paymentId":"bad"}]'), []);
});

import { Keypair, Networks, Address } from "@stellar/stellar-sdk";
import { authorizeDemoAction } from "../lib/protected/policy.ts";
const buyer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const seller = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const arbiter = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const policyContract = Address.contract(Buffer.alloc(32, 5)).toString();
const realScope = { network: Networks.TESTNET, contractId: policyContract, paymentId: "aa".repeat(32) };
const parties = { payer: buyer, seller };

test("server signs only payment-scoped seller actions, never buyer or arbiter authority", () => {
  const token = cap.issueCapability(realScope, secret);
  assert.equal(typeof authorizeDemoAction, "function", "seller policy boundary missing");
  assert.equal(authorizeDemoAction({ type: "claim", paymentId: realScope.paymentId, amount: "1", delivery: "bb".repeat(32) }, buyer, parties, token, realScope, secret), true);
  assert.throws(() => authorizeDemoAction({ type: "claim", paymentId: realScope.paymentId, amount: "1", delivery: "bb".repeat(32) }, buyer, parties, undefined, realScope, secret));
  assert.throws(() => authorizeDemoAction({ type: "dispute", paymentId: realScope.paymentId, claimId: 0, party: buyer, evidence: "bb".repeat(32) }, arbiter, parties, token, realScope, secret));
  assert.equal(authorizeDemoAction({ type: "accept", paymentId: realScope.paymentId, claimId: 0, commitment: "bb".repeat(32) }, buyer, parties, token, realScope, secret), false);
  assert.throws(() => authorizeDemoAction({ type: "reclaim", paymentId: realScope.paymentId }, arbiter, parties, token, realScope, secret));
  assert.equal(authorizeDemoAction({ type: "rule", paymentId: realScope.paymentId, claimId: 0, sellerAmount: "0", revision: 0 }, arbiter, parties, token, realScope, secret, arbiter), false);
  assert.throws(() => authorizeDemoAction({ type: "rule", paymentId: realScope.paymentId, claimId: 0, sellerAmount: "0", revision: 0 }, buyer, parties, token, realScope, secret, arbiter));
  assert.equal(authorizeDemoAction({ type: "settle", paymentId: realScope.paymentId, claimId: 0 }, arbiter, parties, undefined, realScope, secret), false);
});

import { readProtectedRequest } from "../lib/protected/request.ts";
test("request body limit applies while streaming before JSON parsing", async () => {
  assert.equal(typeof readProtectedRequest, "function", "bounded request parsing missing");
  await assert.rejects(readProtectedRequest(new Request("https://demo.test/api/protected", { method: "POST", body: "x".repeat(16001) })), /large/i);
  await assert.rejects(readProtectedRequest(new Request("https://demo.test/api/protected", { method: "POST", body: "null" })), /invalid/i);
  await assert.rejects(readProtectedRequest(new Request("https://demo.test/api/protected", { method: "POST", body: "[]" })), /invalid/i);
  const valid = await readProtectedRequest(new Request("https://demo.test/api/protected", { method: "POST", body: '{"operation":"quote"}' }));
  assert.deepEqual(valid, { operation: "quote" });
});
