import test from "node:test";
import assert from "node:assert/strict";
import {Keypair,Networks,TransactionBuilder} from "@stellar/stellar-sdk";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {challenge,authenticate,accountFromRequest} from "../server/auth.ts";

process.env.DEMO_DATA_DIR=mkdtempSync(join(tmpdir(),"nyquist-auth-"));

process.env.DEMO_SESSION_SECRET="test-only-session-key-".repeat(3);
const load=(address:string)=>Promise.resolve({signers:[{type:"ed25519_public_key",key:address,weight:1}],thresholds:{med_threshold:1}} as never);
test("private service sign-in rejects other wallets, changed envelopes and replay",async()=>{
  const buyer=Keypair.random(),other=Keypair.random();
  const c=await challenge(buyer.publicKey()),wrong=TransactionBuilder.fromXDR(c.xdr,Networks.TESTNET);
  wrong.sign(other);
  await assert.rejects(authenticate(c.id,wrong.toXDR(),load),/signature/);
  const tx=TransactionBuilder.fromXDR(c.xdr,Networks.TESTNET);tx.sign(buyer);
  const signed=await authenticate(c.id,tx.toXDR(),load);
  assert.equal(accountFromRequest(new Request("https://demo.test",{headers:{Authorization:"Bearer "+signed.token}})),buyer.publicKey());
  await assert.rejects(authenticate(c.id,tx.toXDR(),load),/already used/);
  assert.throws(()=>accountFromRequest(new Request("https://demo.test",{headers:{Authorization:"Bearer "+signed.token.slice(0,-5)+"aaaaa"}})),/Invalid/);
  assert.throws(()=>accountFromRequest(new Request("https://demo.test")),/Sign in/);
});
test("a disabled or insufficient master key cannot authenticate an onchain account",async()=>{
  const buyer=Keypair.random(),c=await challenge(buyer.publicKey()),tx=TransactionBuilder.fromXDR(c.xdr,Networks.TESTNET);tx.sign(buyer);
  const revoked=()=>Promise.resolve({signers:[{type:"ed25519_public_key",key:buyer.publicKey(),weight:0}],thresholds:{med_threshold:1}} as never);
  await assert.rejects(authenticate(c.id,tx.toXDR(),revoked),/master key/);
});
