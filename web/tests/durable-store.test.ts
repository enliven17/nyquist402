import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import * as store from "../server/store.ts";

test("private history, evidence revisions and pending hashes survive reopening without duplicates",()=>{
  const directory=mkdtempSync(join(tmpdir(),"nyquist-service-"));
  process.env.DEMO_DATA_DIR=directory;
  try {
    store.rememberPayment("contract","payment","buyer","seller","exact agreement");
    store.rememberPayment("contract","payment","buyer","seller","must not replace original");
    assert.equal(store.history("contract","buyer").length,1);
    assert.equal(store.history("other-contract","buyer").length,0);
    assert.equal(store.history("contract","outsider").length,0);
    const first=store.storeBody("contract","payment","buyer","evidence",0,"first statement");
    const second=store.storeBody("contract","payment","buyer","evidence",0,"revised statement");
    assert.notEqual(first.hash,second.hash);
    store.track("tx","contract","payment","buyer","accept");
    store.track("tx","contract","payment","buyer","accept");
    assert.equal(store.activity("contract","payment").length,1);
    const reopened=new DatabaseSync(join(directory,"payments.sqlite"));
    assert.equal((reopened.prepare("SELECT COUNT(*) AS n FROM bodies").get() as {n:number}).n,2);
    assert.equal((reopened.prepare("SELECT agreement FROM payments").get() as {agreement:string}).agreement,"exact agreement");
    reopened.close();
  } finally {store.db().close();rmSync(directory,{recursive:true,force:true});}
});
