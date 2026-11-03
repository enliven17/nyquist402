// Creates funded testnet accounts and a demo token, then writes web/.env.local.
// Usage: node scripts/setup-demo.mjs
import { writeFileSync } from "node:fs";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const HORIZON = "https://horizon-testnet.stellar.org";
const RPC = "https://soroban-testnet.stellar.org";
const AGENT_FUNDING = "1000";

async function friendbot(address) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (res.ok) return;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`friendbot failed for ${address}`);
}

const [issuer, agent, merchant, facilitator] = [0, 1, 2, 3].map(() => Keypair.random());
await Promise.all([issuer, agent, merchant, facilitator].map(k => friendbot(k.publicKey())));

const asset = new Asset("DEMOUSD", issuer.publicKey());
const horizon = new Horizon.Server(HORIZON);
const issuerAccount = await horizon.loadAccount(issuer.publicKey());
const classic = new TransactionBuilder(issuerAccount, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .setTimeout(60)
  .addOperation(Operation.changeTrust({ asset, source: agent.publicKey() }))
  .addOperation(Operation.changeTrust({ asset, source: merchant.publicKey() }))
  .addOperation(Operation.payment({ destination: agent.publicKey(), asset, amount: AGENT_FUNDING }))
  .build();
classic.sign(issuer, agent, merchant);
await horizon.submitTransaction(classic);

const server = new rpc.Server(RPC);
const sacTx = new TransactionBuilder(await server.getAccount(issuer.publicKey()), {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .setTimeout(60)
  .addOperation(Operation.createStellarAssetContract({ asset }))
  .build();
const prepared = await server.prepareTransaction(sacTx);
prepared.sign(issuer);
const sent = await server.sendTransaction(prepared);
const result = await server.pollTransaction(sent.hash, { attempts: 30 });
if (result.status !== "SUCCESS") throw new Error(`SAC deploy failed: ${result.status}`);

const env = [
  `DEMO_AGENT_SECRET=${agent.secret()}`,
  `DEMO_MERCHANT_SECRET=${merchant.secret()}`,
  `DEMO_FACILITATOR_SECRET=${facilitator.secret()}`,
  `DEMO_TOKEN=${asset.contractId(Networks.TESTNET)}`,
  "",
].join("\n");
writeFileSync(new URL("../.env.local", import.meta.url), env);
console.log(`Demo token ${asset.contractId(Networks.TESTNET)}. Wrote .env.local.`);
