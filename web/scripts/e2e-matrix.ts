// Real testnet load check through the product API (server/app.ts), never run automatically.
// From web: npx tsx scripts/e2e-matrix.ts [payments=100] [buyers=12]
// Each payment runs one scenario end to end and checks the onchain result. Buyers are fresh
// testnet accounts funded by friendbot that buy Circle test USDC on the testnet DEX.
// The hosted equivalent runs one scenario on a schedule: convex/tester.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";
import { loadServerEnvironment } from "../server/env.ts";
import type { DemoConfig } from "../lib/protected/types.ts";
loadServerEnvironment();
const { app } = await import("../server/app.ts");
const { connect, fundBuyer } = await import("../lib/scenarios.ts");
type Result = import("../lib/scenarios.ts").Result;

const PAYMENTS = Number(process.argv[2] ?? 100), BUYERS = Number(process.argv[3] ?? 12);
async function api(body: Record<string, unknown>, token?: string) {
  const res = await app.fetch(new Request("http://localhost/api/protected", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }));
  const json = await res.json() as Record<string, unknown>;
  if (!json.ok) throw new Error(String(json.error));
  return json;
}
const { config, run } = await connect(api, async () => (await (await app.fetch(new Request("http://localhost/api/protected"))).json() as { config: DemoConfig }).config);

const dir = process.env.DEMO_DATA_DIR ?? ".nyquist-data"; mkdirSync(dir, { recursive: true });
const keyFile = `${dir}/matrix-buyers.json`;
const secrets: string[] = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, "utf8")) : [];
while (secrets.length < BUYERS) secrets.push(Keypair.random().secret());
writeFileSync(keyFile, JSON.stringify(secrets), { mode: 0o600 });
const buyers = secrets.slice(0, BUYERS).map(s => Keypair.fromSecret(s));

type Name = Parameters<typeof run>[0];
const mix: [Name, number][] = [
  ["accept", 15], ["twoClaims", 10], ["reviewExpiry", 12], ["defaultRules", 12], ["arbiterA", 12],
  ["arbiterB", 8], ["fallback", 11], ["reclaim", 10], ["sellerDisputes", 10],
];
// Round-robin across scenarios so every buyer sees a mix and long waits overlap.
const counts = mix.map(([name, n]) => [name, Math.round(n * PAYMENTS / 100)] as const);
const queue: Name[] = [];
for (let round = 0; queue.length < counts.reduce((a, [, n]) => a + n, 0); round++)
  for (const [name, n] of counts) if (round < n) queue.push(name);

console.log(`escrow ${config.contractId} · ${queue.length} payments · ${BUYERS} buyers`);
for (const kp of buyers) await fundBuyer(kp);
const results: Result[] = [];
let next = 0;
await Promise.all(buyers.map(async kp => {
  while (next < queue.length) {
    const r = await run(queue[next++], kp);
    results.push(r);
    console.log(`${String(results.length).padStart(3)} ${r.ok ? "ok  " : "FAIL"} ${r.name.padEnd(15)} ${Math.round(r.ms / 1000)}s ${r.ok ? r.paymentId : r.error}`);
  }
}));

console.log("\nscenario         pass/total  onchain txs");
for (const [n] of mix) {
  const rs = results.filter(r => r.name === n);
  console.log(`${n.padEnd(16)} ${rs.filter(r => r.ok).length}/${rs.length}`.padEnd(29) + rs.reduce((a, r) => a + r.txs, 0));
}
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} payments passed · ${results.reduce((a, r) => a + r.txs, 0)} onchain transactions`);
writeFileSync(`${dir}/matrix-result.json`, JSON.stringify(results, null, 2));
process.exit(passed === results.length ? 0 : 1);
