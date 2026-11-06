import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import * as store from "../server/store.ts";

test("private history, evidence revisions and pending hashes survive reopening without duplicates",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"nyquist-service-"));
  process.env.DEMO_DATA_DIR=directory;
  try {
    await store.rememberPayment("contract","payment","buyer","seller","exact agreement");
    await store.rememberPayment("contract","payment","buyer","seller","must not replace original");
    assert.equal((await store.history("contract","buyer")).length,1);
    assert.equal((await store.history("other-contract","buyer")).length,0);
    assert.equal((await store.history("contract","outsider")).length,0);
    const first=await store.storeBody("contract","payment","buyer","evidence",0,"first statement");
    const second=await store.storeBody("contract","payment","buyer","evidence",0,"revised statement");
    assert.notEqual(first.hash,second.hash);
    await store.track("tx","contract","payment","buyer","accept");
    await store.track("tx","contract","payment","buyer","accept");
    assert.equal((await store.activity("contract","payment")).length,1);
    const reopened=new DatabaseSync(join(directory,"payments.sqlite"));
    assert.equal((reopened.prepare("SELECT COUNT(*) AS n FROM bodies").get() as {n:number}).n,2);
    assert.equal((reopened.prepare("SELECT agreement FROM payments").get() as {agreement:string}).agreement,"exact agreement");
    reopened.close();
  } finally {store.db().close();rmSync(directory,{recursive:true,force:true});}
});
