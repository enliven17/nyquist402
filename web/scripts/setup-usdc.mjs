// Prepare existing demo recipients for Circle USDC. Dry-run unless --apply is passed.
// Existing keys are preserved. No issuer, mint, token deployment or faucet automation.
import {loadServerEnvironment} from "../server/env.ts";
import {Asset,BASE_FEE,Horizon,Keypair,Networks,Operation,TransactionBuilder} from "@stellar/stellar-sdk";
loadServerEnvironment();
const asset=new Asset("USDC","GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const horizon=new Horizon.Server("https://horizon-testnet.stellar.org");
const secrets=[process.env.DEMO_AGENT_SECRET,process.env.DEMO_MERCHANT_SECRET,process.env.DEMO_FACILITATOR_SECRET,...(process.env.DEMO_ARBITER_SECRETS??"").split(",")].map(x=>x?.trim()).filter(Boolean);
const seen=new Set();
for(const secret of secrets) {
  const signer=Keypair.fromSecret(secret),address=signer.publicKey();
  if(seen.has(address)) continue; seen.add(address);
  const account=await horizon.loadAccount(address);
  if(account.balances.some(b=>"asset_code" in b && b.asset_code==="USDC" && b.asset_issuer===asset.getIssuer())) {
    console.log(address+": USDC trustline ready");continue;
  }
  if(!process.argv.includes("--apply")) {console.log(address+": missing USDC trustline (run with --apply to add)");continue;}
  const tx=new TransactionBuilder(account,{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).setTimeout(60).addOperation(Operation.changeTrust({asset})).build();
  tx.sign(signer);const result=await horizon.submitTransaction(tx);console.log(address+": trustline added "+result.hash);
}
console.log("USDC SAC: "+asset.contractId(Networks.TESTNET));
console.log("Get test USDC manually at https://faucet.circle.com/; choose Stellar Testnet.");
