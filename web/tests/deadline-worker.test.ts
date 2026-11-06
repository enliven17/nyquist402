import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {Account,Contract,Keypair,Networks,TransactionBuilder,nativeToScVal} from "@stellar/stellar-sdk";
import {deadlineTick} from "../server/worker.ts";
import * as store from "../server/store.ts";
import {bytes} from "../lib/protected/codec.ts";
import {contract} from "./fixtures/terms.ts";
import type {ProtectedEscrowClient} from "../lib/protected/client.ts";

test("interrupted deadline jobs reuse the original signed transaction and never create a second payout intent",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"nyquist-worker-"));
  process.env.DEMO_DATA_DIR=directory;process.env.DEMO_WORKER_ENABLED="true";
  process.env.DEMO_FACILITATOR_SECRET=Keypair.random().secret();
  const paymentId="aa".repeat(32);
  let prepared=0,submitted=0,resent=0,status="NOT_FOUND";
  const client={
    contractId:contract,
    state:async()=>({next_claim_id:1}),
    claimState:async()=>({status:"Review",review_until:0}),
    server:{
      getTransaction:async()=>({status}),
      sendTransaction:async(tx:{hash():Buffer})=>{
        resent++;
        const row=store.db().prepare("SELECT tx FROM worker_jobs").get() as {tx:string};
        assert.equal(tx.hash().toString("hex"),row.tx);
        return {status:"PENDING"};
      },
    },
    prepare:async(source:string)=>{
      prepared++;
      const tx=new TransactionBuilder(new Account(source,"0"),{fee:"100",networkPassphrase:Networks.TESTNET})
        .setTimeout(120).addOperation(new Contract(contract).call("settle",bytes(paymentId),nativeToScVal(0,{type:"u32"}))).build();
      return {xdr:tx.toXDR()};
    },
    submit:async()=>{submitted++;throw new Error("confirmation interrupted");},
  } as unknown as ProtectedEscrowClient;
  try{
    store.rememberPayment(contract,paymentId,"buyer","seller","agreement");
    await deadlineTick(client);
    assert.equal(prepared,1);assert.equal(submitted,1);
    assert.equal((store.db().prepare("SELECT COUNT(*) AS n FROM worker_jobs").get() as {n:number}).n,1);
    await deadlineTick(client);
    assert.equal(prepared,1);assert.equal(submitted,1);assert.equal(resent,1);
    status="SUCCESS";
    await deadlineTick(client);await deadlineTick(client);
    assert.equal(prepared,1);assert.equal(submitted,1);
    assert.equal((store.db().prepare("SELECT status FROM worker_jobs").get() as {status:string}).status,"success");
    assert.equal(store.activity(contract,paymentId).length,1);
  }finally{store.db().close();rmSync(directory,{recursive:true,force:true});}
});
