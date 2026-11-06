// Creates testnet accounts and Circle USDC trustlines, then writes web/.env.local.
// Usage: node scripts/setup-demo.mjs
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolveProtectedDeployment } from "../lib/deployment.ts";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const envPath = new URL("../.env.local", import.meta.url);
if (existsSync(envPath) || existsSync(new URL("../.env", import.meta.url))) throw new Error("Demo configuration already exists in .env or .env.local. Keep its funded account keys and update that file instead of recreating them.");

const HORIZON = "https://horizon-testnet.stellar.org";
const deployment = resolveProtectedDeployment(process.env);


async function friendbot(address) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (res.ok) return;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`friendbot failed for ${address}`);
}

const [agent, merchant, facilitator] = [0, 1, 2].map(() => Keypair.random());
await Promise.all([agent, merchant, facilitator].map(k => friendbot(k.publicKey())));
const asset = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const horizon = new Horizon.Server(HORIZON);
for (const account of [agent, merchant, facilitator]) {
  const tx = new TransactionBuilder(await horizon.loadAccount(account.publicKey()), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .setTimeout(60).addOperation(Operation.changeTrust({ asset })).build();
  tx.sign(account);
  await horizon.submitTransaction(tx);
}
const env = [
  `DEMO_AGENT_SECRET=${agent.secret()}`,
  `DEMO_MERCHANT_SECRET=${merchant.secret()}`,
  `DEMO_FACILITATOR_SECRET=${facilitator.secret()}`,
  `DEMO_TOKEN=${asset.contractId(Networks.TESTNET)}`,
  `DEMO_SESSION_SECRET=${randomBytes(32).toString("hex")}`,
  `DEMO_PROTECTED_ESCROW=${deployment.contractId}`,
  `DEMO_PROTECTED_VERSION=${deployment.version}`,
  `DEMO_SELLER_ARBITER=${process.env.DEMO_SELLER_ARBITER ?? ""}`,
  "",
].join("\n");
writeFileSync(envPath, env, { mode: 0o600, flag: "wx" });
console.log(`Official testnet USDC ${asset.contractId(Networks.TESTNET)}. Wrote .env.local. Get USDC at https://faucet.circle.com/ (Stellar Testnet).`);
