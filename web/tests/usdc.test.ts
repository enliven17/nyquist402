import test from "node:test";
import assert from "node:assert/strict";
import {Asset,Networks} from "@stellar/stellar-sdk";
import {USDC_ASSET,USDC_CONTRACT,USDC_DECIMALS,USDC_FAUCET,USDC_ISSUER} from "../lib/usdc.ts";
import {parseAmount,formatAmount} from "../lib/protected/flow.ts";
test("official Circle Stellar testnet USDC uses seven decimals and a network-bound SAC",()=>{
  assert.equal(USDC_ISSUER,"GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
  assert.equal(USDC_ASSET.code,"USDC");assert.equal(USDC_DECIMALS,7);
  assert.equal(USDC_CONTRACT,new Asset("USDC",USDC_ISSUER).contractId(Networks.TESTNET));
  assert.notEqual(USDC_CONTRACT,USDC_ASSET.contractId(Networks.PUBLIC));
  assert.equal(USDC_FAUCET,"https://faucet.circle.com/");
  assert.equal(parseAmount("3.0000001"),"30000001");
  assert.equal(formatAmount("30000001"),"3.0000001");
});
