import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Address,Networks,scValToNative,nativeToScVal,xdr} from "@stellar/stellar-sdk";
import {terms,contract,keys} from "./fixtures/terms.ts";
import {termsToScVal,computePaymentId,fundingTotal,validateTerms,quoteScope} from "../lib/protected/codec.ts";
import type {PaymentTerms} from "../lib/protected/types.ts";
const v2:PaymentTerms={...terms,fees:{
  protocol_reserve:"1000000",arbitration_reserve:"2000000",protocol_bps:100,
  protocol_recipient:Address.account(Buffer.alloc(32,9)).toString(),
  custom_fee:"100",default_fee:"200",case_fee_cap:"300",custom_quote:"09".repeat(32),default_quote:"0a".repeat(32),
}};
test("v2 canonical terms and identity match the independent Rust implementation",async()=>{
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/protected-v2-encoding.json",import.meta.url),"utf8"));
  assert.equal(termsToScVal(v2).toXDR("hex"),fixture.termsXdrHex);
  assert.equal(await computePaymentId(v2,contract,Networks.TESTNET),fixture.paymentId);
  assert.notEqual(await computePaymentId(v2,contract,Networks.TESTNET),await computePaymentId(terms,contract,Networks.TESTNET));
  assert.equal(fundingTotal(v2),"103000000");
  const decoded=scValToNative(termsToScVal(v2));
  assert.equal(decoded.protocol_reserve,1000000n);
  assert.equal(decoded.fees,undefined);
});
test("quote scope binds economic policy and uniqueness while clearing only quote IDs",async()=>{
  const scope=await quoteScope(v2,contract,Networks.TESTNET);
  const fee=v2.fees!;
  assert.equal(await quoteScope({...v2,fees:{...fee,custom_quote:null,default_quote:null}},contract,Networks.TESTNET),scope);
  for(const changed of [
    {...v2,fees:{...fee,case_fee_cap:"301"}},
    {...v2,salt:"0b".repeat(32)},
    {...v2,fees:{...fee,protocol_bps:99}},
  ]) assert.notEqual(await quoteScope(changed,contract,Networks.TESTNET),scope);
  assert.notEqual(await quoteScope(v2,contract,Networks.PUBLIC),scope);
});
test("v2 validation rejects underfunded protocol reserves and hidden arbitration charges",()=>{
  const policy={contractId:contract,defaultArbiter:keys[3],now:1800000000};
  assert.doesNotThrow(()=>validateTerms(v2,policy));
  for(const fees of [
    {...v2.fees!,protocol_reserve:"999999"},
    {...v2.fees!,case_fee_cap:"100"},
    {...v2.fees!,default_quote:null},
    {...v2.fees!,protocol_bps:10001},
  ]) assert.throws(()=>validateTerms({...v2,fees},policy));
});


test("payer authorization covers the exact principal plus reserves and rejects extra token movements",async()=>{
  const {assertAuthorization}=await import("../lib/protected/client.ts");
  const {actionToCall,addr}=await import("../lib/protected/codec.ts");
  const action={type:"authorize",terms:v2} as const, call=actionToCall(action);
  const invocation=(target:string,method:string,args:xdr.ScVal[],subs:xdr.SorobanAuthorizedInvocation[]=[])=>new xdr.SorobanAuthorizedInvocation({
    function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:Address.fromString(target).toScAddress(),functionName:method,args})),subInvocations:subs,
  });
  const entry=(total:string)=>new xdr.SorobanAuthorizationEntry({
    credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address:Address.fromString(v2.payer).toScAddress(),nonce:xdr.Int64.fromString("1"),signatureExpirationLedger:100,signature:xdr.ScVal.scvVoid(),
    })),
    rootInvocation:invocation(contract,call.method,call.args,[invocation(v2.token,"transfer",[addr(v2.payer),addr(contract),nativeToScVal(BigInt(total),{type:"i128"})])]),
  });
  assert.doesNotThrow(()=>assertAuthorization(entry("103000000"),contract,action,v2.payer));
  assert.throws(()=>assertAuthorization(entry("100000000"),contract,action,v2.payer),/invocation/);
  assert.throws(()=>assertAuthorization(entry("104000000"),contract,action,v2.payer),/invocation/);
});
