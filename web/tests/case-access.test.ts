import test from "node:test";
import assert from "node:assert/strict";
import {Networks} from "@stellar/stellar-sdk";
import {caseAccess} from "../server/cases.ts";
import {issueCapability} from "../lib/protected/capability.ts";
import type {ProtectedEscrowClient} from "../lib/protected/client.ts";
const id="aa".repeat(32),secret="local-test-only-secret-".repeat(3);
process.env.DEMO_SESSION_SECRET=secret;
const mock={contractId:"contract",terms:async()=>({payer:"buyer",seller:"seller"}),arbiter:async()=>"current-arbiter"} as unknown as ProtectedEscrowClient;
test("case material requires onchain membership; public IDs and former arbiters grant no access",async()=>{
  await assert.rejects(caseAccess("outsider",id,0,undefined,mock),/Only this payment/);
  await assert.rejects(caseAccess("previous-arbiter",id,0,undefined,mock),/Only this payment/);
  assert.equal((await caseAccess("current-arbiter",id,0,undefined,mock)).sellerControl,false);
  assert.equal((await caseAccess("buyer",id,0,undefined,mock)).sellerControl,false);
  assert.equal((await caseAccess("seller",id,0,undefined,mock)).sellerControl,true);
});
test("demonstration seller controls require the exact payment capability and a party session",async()=>{
  const cap=issueCapability({network:Networks.TESTNET,contractId:"contract",paymentId:id},secret);
  assert.equal((await caseAccess("buyer",id,0,cap,mock)).sellerControl,true);
  await assert.rejects(caseAccess("outsider",id,0,cap,mock),/Only this payment/);
  await assert.rejects(caseAccess("buyer","bb".repeat(32),0,cap,mock),/Invalid seller/);
});
