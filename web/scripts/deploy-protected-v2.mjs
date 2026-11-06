// Explicit testnet-only deployment. Persist exact signed transactions before broadcast.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {createHash,randomBytes} from "node:crypto";
import {Address,BASE_FEE,Contract,Keypair,Networks,Operation,rpc,scValToNative,TransactionBuilder,StrKey} from "@stellar/stellar-sdk";
import {loadServerEnvironment} from "../server/env.ts";
loadServerEnvironment();
const envPath=existsSync(".env.local")?".env.local":".env";
const mode=process.argv[2];
if(!["upload","deploy","inspect"].includes(mode)) throw new Error("Choose upload, deploy or inspect");
const network=Networks.TESTNET,server=new rpc.Server("https://soroban-testnet.stellar.org");
const signer=Keypair.fromSecret(process.env.DEMO_FACILITATOR_SECRET??"");
const defaultArbiter=Keypair.fromSecret((process.env.DEMO_ARBITER_SECRETS??"").split(",")[0].trim()).publicKey();
const wasm=readFileSync("../target/wasm32v1-none/release/protected_escrow_v2.wasm");
const wasmHash=createHash("sha256").update(wasm).digest("hex");
const directory=resolve(process.env.DEMO_DATA_DIR??".nyquist-data");mkdirSync(directory,{recursive:true});
const path=resolve(directory,"deployment-v2.json");
const journal=existsSync(path)?JSON.parse(readFileSync(path,"utf8")):{network,wasmHash,defaultArbiter,source:signer.publicKey(),salt:randomBytes(32).toString("hex"),previousContract:process.env.DEMO_PROTECTED_ESCROW,steps:{}};
if(journal.network!==network || journal.wasmHash!==wasmHash || journal.defaultArbiter!==defaultArbiter || journal.source!==signer.publicKey()) throw new Error("Deployment journal differs from current build/configuration; inspect it before a new deployment");
const save=()=>writeFileSync(path,JSON.stringify(journal,null,2),{mode:0o600});save();
async function step(name,operation) {
  let record=journal.steps[name],tx;
  if(record) {
    const state=await server.getTransaction(record.hash);
    if(state.status==="SUCCESS") return state.returnValue;
    if(state.status==="FAILED") throw new Error(name+" failed onchain: "+record.hash);
    tx=TransactionBuilder.fromXDR(record.xdr,network);
    if(Number(tx.timeBounds.maxTime)<=Date.now()/1000) throw new Error("Unknown expired transaction; reconcile before retry: "+record.hash);
  } else {
    const raw=new TransactionBuilder(await server.getAccount(signer.publicKey()),{fee:BASE_FEE,networkPassphrase:network})
      .setTimeout(300).addOperation(operation).build();
    tx=await server.prepareTransaction(raw);tx.sign(signer);
    record={hash:tx.hash().toString("hex"),xdr:tx.toXDR()};journal.steps[name]=record;save();
  }
  console.log(name+" transaction: "+record.hash);
  const sent=await server.sendTransaction(tx);
  if(sent.status==="ERROR") throw new Error(name+" rejected: "+(sent.errorResult?.toXDR("base64")??sent.status));
  const result=await server.pollTransaction(record.hash,{attempts:30,sleepStrategy:()=>1000});
  if(result.status!=="SUCCESS") throw new Error("Unconfirmed "+name+": "+record.hash+" "+result.status);
  record.confirmed=true;save();return result.returnValue;
}
async function read(contract,method) {
  const tx=new TransactionBuilder(await server.getAccount(signer.publicKey()),{fee:BASE_FEE,networkPassphrase:network})
    .setTimeout(60).addOperation(new Contract(contract).call(method)).build();
  const sim=await server.simulateTransaction(tx);
  if(!rpc.Api.isSimulationSuccess(sim)||!sim.result) throw new Error("Read failed: "+method);
  return scValToNative(sim.result.retval);
}
if(mode==="upload") {
  await step("upload",Operation.uploadContractWasm({wasm}));
  console.log("Uploaded protected escrow Wasm: "+wasmHash);
} else if(mode==="deploy") {
  if(!journal.steps.upload) throw new Error("Upload first");
  const uploaded=await server.getTransaction(journal.steps.upload.hash);
  if(uploaded.status!=="SUCCESS") throw new Error("Upload is not confirmed");
  const value=await step("deploy",Operation.createCustomContract({address:Address.fromString(signer.publicKey()),wasmHash:Buffer.from(wasmHash,"hex"),salt:Buffer.from(journal.salt,"hex"),constructorArgs:[Address.fromString(defaultArbiter).toScVal()]}));
  const contract=scValToNative(value);
  if(!StrKey.isValidContract(contract)) throw new Error("Deployment returned an invalid contract address");
  if(Number(await read(contract,"version"))!==2 || await read(contract,"default_arbiter")!==defaultArbiter) throw new Error("Deployed contract verification failed");
  const deployedWasm=await server.getContractWasmByContractId(contract);
  if(createHash("sha256").update(deployedWasm).digest("hex")!==wasmHash) throw new Error("Deployed code hash differs from the tested Wasm");
  journal.contract=contract;journal.verified=true;save();
  let env=readFileSync(envPath,"utf8");
  for(const [key,value] of [["DEMO_PROTECTED_ESCROW",contract],["DEMO_PROTECTED_VERSION","2"]]) {
    const pattern=new RegExp("^"+key+"=.*$","m");
    env=pattern.test(env)?env.replace(pattern,key+"="+value):env.trimEnd()+"\n"+key+"="+value+"\n";
  }
  writeFileSync(envPath,env,{mode:0o600});
  console.log("Verified and configured protected escrow: "+contract);
  console.log("Wasm hash: "+wasmHash);
} else console.log(JSON.stringify({network:"Stellar Testnet",wasmHash,contract:journal.contract,verified:journal.verified,transactions:Object.fromEntries(Object.entries(journal.steps).map(([k,v])=>[k,{hash:v.hash,confirmed:v.confirmed}]))}));
