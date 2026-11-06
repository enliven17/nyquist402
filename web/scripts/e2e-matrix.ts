// Real testnet load check through the product API (server/app.ts), never run automatically.
// From web: npx tsx scripts/e2e-matrix.ts [payments=100] [buyers=12]
// Each payment runs one scenario end to end and checks the onchain result. Buyers are fresh
// testnet accounts funded by friendbot that buy Circle test USDC on the testnet DEX.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { loadServerEnvironment } from "../server/env.ts";
loadServerEnvironment();
const { app } = await import("../server/app.ts");
const { ProtectedEscrowClient } = await import("../lib/protected/client.ts");
const { hashText } = await import("../lib/protected/codec.ts");
const { USDC_ISSUER } = await import("../lib/usdc.ts");
import type { DemoConfig, PaymentState, PaymentTerms, ProtectedAction } from "../lib/protected/types.ts";

const PAYMENTS = Number(process.argv[2] ?? 100), BUYERS = Number(process.argv[3] ?? 12);
const USDC = new Asset("USDC", USDC_ISSUER);
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const u = (usdc: number) => String(Math.round(usdc * 1e7));

async function api(body: Record<string, unknown>, token?: string) {
  const res = await app.fetch(new Request("http://localhost/api/protected", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }));
  const json = await res.json() as Record<string, unknown>;
  if (!json.ok) throw new Error(String(json.error));
  return json;
}
const config = (await (await app.fetch(new Request("http://localhost/api/protected"))).json() as { config: DemoConfig }).config;
const client = new ProtectedEscrowClient(config);
const [defaultArb, arbA, arbB] = config.arbiters;
assert.ok(config.version === 2 && arbA && arbB, "needs the protected escrow and three demo arbiters");

// --- buyers -------------------------------------------------------------------------------
const dir = process.env.DEMO_DATA_DIR ?? ".nyquist-data"; mkdirSync(dir, { recursive: true });
const keyFile = `${dir}/matrix-buyers.json`;
const secrets: string[] = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, "utf8")) : [];
while (secrets.length < BUYERS) secrets.push(Keypair.random().secret());
writeFileSync(keyFile, JSON.stringify(secrets), { mode: 0o600 });
const buyers = secrets.slice(0, BUYERS).map(s => Keypair.fromSecret(s));

async function fundBuyer(kp: Keypair) {
  let account = await horizon.loadAccount(kp.publicKey()).catch(() => null);
  if (!account) {
    await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    account = await horizon.loadAccount(kp.publicKey());
  }
  const usdc = account.balances.find(b => "asset_code" in b && b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER);
  if (usdc && Number(usdc.balance) >= 40) return;
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: Networks.TESTNET });
  if (!usdc) tx.addOperation(Operation.changeTrust({ asset: USDC }));
  tx.addOperation(Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: "200", destination: kp.publicKey(), destAsset: USDC, destAmount: "80", path: [] }));
  const built = tx.setTimeout(60).build(); built.sign(kp);
  await horizon.submitTransaction(built);
}
async function signIn(kp: Keypair) {
  const ch = await api({ operation: "auth_challenge", address: kp.publicKey() });
  const tx = TransactionBuilder.fromXDR(ch.xdr as string, Networks.TESTNET); tx.sign(kp);
  return (await api({ operation: "auth_verify", id: ch.id, xdr: tx.toXDR() })).token as string;
}

// --- one payment, as the demo page does it ---------------------------------------------------
type Ctx = { kp: Keypair; token: string; paymentId: string; capability: string; terms: PaymentTerms; txs: number };
async function open(kp: Keypair, token: string, buyerArbiter: string | null, fallbackSellerBps = 5000): Promise<Ctx> {
  const agreement = `matrix ${Date.now()} ${Math.random()}`;
  // The API allows five quotes per buyer per minute; back off if a buyer hits it.
  let q: Record<string, unknown> | undefined;
  for (let i = 0; !q; i++) {
    try { q = await api({ operation: "quote", payer: kp.publicKey(), agreement, agreementHash: await hashText(agreement), buyerArbiter, fallbackSellerBps }, token); }
    catch (e) { if (i < 6 && /Too many quote/.test(String(e))) await sleep(15000); else throw e; }
  }
  const ctx: Ctx = { kp, token, paymentId: q.paymentId as string, capability: q.capability as string, terms: q.terms as PaymentTerms, txs: 0 };
  await send(ctx, { type: "authorize", terms: ctx.terms });
  return ctx;
}
async function send(ctx: Ctx, action: ProtectedAction) {
  const { prepared } = await api({ operation: "prepare", source: ctx.kp.publicKey(), action, capability: ctx.capability }) as { prepared: Parameters<typeof client.submit>[0] };
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET); tx.sign(ctx.kp);
  await api({ operation: "track", paymentId: ctx.paymentId, xdr: tx.toXDR() }, ctx.token);
  const done = await client.submit(prepared, tx.toXDR());
  ctx.txs++; return done;
}
async function fails(ctx: Ctx, action: ProtectedAction, why: RegExp | string) {
  try { await send(ctx, action); } catch (e) { if (typeof why === "string" || why.test(String(e))) return; throw new Error(`expected ${why}, got ${e}`); }
  throw new Error(`${action.type} should have failed (${why})`);
}
const claim = async (ctx: Ctx, amount: number) => {
  const id = Number((await send(ctx, { type: "claim", paymentId: ctx.paymentId, amount: u(amount), delivery: await hashText(`delivery ${amount}`) })).value);
  return { id, c: await client.claimState(ctx.paymentId, id) };
};
const accept = (ctx: Ctx, id: number, commitment: string) => send(ctx, { type: "accept", paymentId: ctx.paymentId, claimId: id, commitment });
const dispute = async (ctx: Ctx, id: number, party: string) => send(ctx, { type: "dispute", paymentId: ctx.paymentId, claimId: id, party, evidence: await hashText(`dispute ${party}`) });
const evidence = async (ctx: Ctx, id: number, party: string) => send(ctx, { type: "submit_evidence", paymentId: ctx.paymentId, claimId: id, party, evidence: await hashText(`evidence ${party}`) });
const until = async (t: number) => { while (now() < t + 6) await sleep(2000); };
async function rule(ctx: Ctx, id: number, sellerAmount: number) {
  for (let i = 0; ; i++) {
    try { return await api({ operation: "arbitrate", paymentId: ctx.paymentId, claimId: id, sellerAmount: u(sellerAmount), capability: ctx.capability }, ctx.token); }
    catch (e) { if (i < 4 && /ResponsePending|#\d+|busy|timeout/i.test(String(e))) await sleep(4000); else throw e; }
  }
}
async function closeOut(ctx: Ctx) { await send(ctx, { type: "void_unclaimed", paymentId: ctx.paymentId }); }
async function expect(ctx: Ctx, paid: number, returned: number) {
  const s: PaymentState = await client.state(ctx.paymentId);
  assert.equal(s.paid_to_seller, u(paid), "paid to seller");
  assert.equal(s.returned_to_buyer, u(returned), "returned to buyer");
  assert.equal(s.reserved, "0"); assert.equal(s.available, "0");
}

const scenarios: Record<string, (kp: Keypair, token: string) => Promise<Ctx>> = {
  async accept(kp, token) {
    const ctx = await open(kp, token, null);
    const { id, c } = await claim(ctx, 3);
    await fails(ctx, { type: "accept", paymentId: ctx.paymentId, claimId: id, commitment: "00".repeat(32) }, "stale commitment");
    await accept(ctx, id, c.commitment);
    await fails(ctx, { type: "accept", paymentId: ctx.paymentId, claimId: id, commitment: c.commitment }, "double accept");
    await closeOut(ctx); await expect(ctx, 3, 7); return ctx;
  },
  async twoClaims(kp, token) {
    const ctx = await open(kp, token, null);
    const a = await claim(ctx, 2); await accept(ctx, a.id, a.c.commitment);
    const b = await claim(ctx, 5); await accept(ctx, b.id, b.c.commitment);
    await fails(ctx, { type: "claim", paymentId: ctx.paymentId, amount: u(4), delivery: await hashText("over budget") }, "over budget");
    await closeOut(ctx); await expect(ctx, 7, 3); return ctx;
  },
  async reviewExpiry(kp, token) {
    const ctx = await open(kp, token, null);
    const { id, c } = await claim(ctx, 4);
    await fails(ctx, { type: "settle", paymentId: ctx.paymentId, claimId: id }, "review pending");
    await until(c.review_until);
    await send(ctx, { type: "settle", paymentId: ctx.paymentId, claimId: id });
    await closeOut(ctx); await expect(ctx, 4, 6); return ctx;
  },
  async defaultRules(kp, token) {
    const ctx = await open(kp, token, null);
    const { id } = await claim(ctx, 4);
    await dispute(ctx, id, ctx.terms.payer); await evidence(ctx, id, ctx.terms.seller);
    await until((await client.claimState(ctx.paymentId, id)).response_until);
    await assert.rejects(rule(ctx, id, 5), /exceeds/);
    await rule(ctx, id, 2);
    await closeOut(ctx); await expect(ctx, 2, 8); return ctx;
  },
  async arbiterA(kp, token) {
    const ctx = await open(kp, token, arbA.address);
    assert.equal(ctx.terms.seller_arbiter, arbA.address);
    const { id } = await claim(ctx, 3);
    await dispute(ctx, id, ctx.terms.payer);
    assert.equal(await client.arbiter(ctx.paymentId, id), arbA.address);
    await until((await client.claimState(ctx.paymentId, id)).response_until);
    await rule(ctx, id, 1.5);
    await closeOut(ctx); await expect(ctx, 1.5, 8.5); return ctx;
  },
  async arbiterB(kp, token) {
    const ctx = await open(kp, token, arbB.address);
    const { id } = await claim(ctx, 5);
    await dispute(ctx, id, ctx.terms.payer); await evidence(ctx, id, ctx.terms.seller);
    await until((await client.claimState(ctx.paymentId, id)).response_until);
    await rule(ctx, id, 0);
    await closeOut(ctx); await expect(ctx, 0, 10); return ctx;
  },
  async fallback(kp, token) {
    const ctx = await open(kp, token, null, 7000);
    const { id } = await claim(ctx, 4);
    await dispute(ctx, id, ctx.terms.payer);
    const c = await client.claimState(ctx.paymentId, id);
    await fails(ctx, { type: "finalize_fallback", paymentId: ctx.paymentId, claimId: id }, "fallback not ready");
    await until(c.fallback_at);
    await send(ctx, { type: "finalize_fallback", paymentId: ctx.paymentId, claimId: id });
    await closeOut(ctx); await expect(ctx, 2.8, 7.2); return ctx;
  },
  async reclaim(kp, token) {
    const ctx = await open(kp, token, null);
    const { id, c } = await claim(ctx, 3); await accept(ctx, id, c.commitment);
    await fails(ctx, { type: "reclaim", paymentId: ctx.paymentId }, "session open");
    await until(ctx.terms.delivery_deadline);
    await fails(ctx, { type: "claim", paymentId: ctx.paymentId, amount: u(1), delivery: await hashText("late") }, "session closed");
    await send(ctx, { type: "reclaim", paymentId: ctx.paymentId });
    await expect(ctx, 3, 7); return ctx;
  },
  async sellerDisputes(kp, token) {
    const ctx = await open(kp, token, null);
    const { id } = await claim(ctx, 6);
    await dispute(ctx, id, ctx.terms.seller); await evidence(ctx, id, ctx.terms.payer);
    await until((await client.claimState(ctx.paymentId, id)).response_until);
    await rule(ctx, id, 6);
    await closeOut(ctx); await expect(ctx, 6, 4); return ctx;
  },
};
const mix: [keyof typeof scenarios, number][] = [
  ["accept", 15], ["twoClaims", 10], ["reviewExpiry", 12], ["defaultRules", 12], ["arbiterA", 12],
  ["arbiterB", 8], ["fallback", 11], ["reclaim", 10], ["sellerDisputes", 10],
];
// Round-robin across scenarios so every buyer sees a mix and long waits overlap.
const counts = mix.map(([name, n]) => [name, Math.round(n * PAYMENTS / 100)] as const);
const queue: (keyof typeof scenarios)[] = [];
for (let round = 0; queue.length < counts.reduce((a, [, n]) => a + n, 0); round++)
  for (const [name, n] of counts) if (round < n) queue.push(name);

console.log(`escrow ${config.contractId} · ${queue.length} payments · ${BUYERS} buyers`);
for (const kp of buyers) await fundBuyer(kp);
const results: { name: string; ok: boolean; txs: number; ms: number; error?: string; paymentId?: string }[] = [];
let next = 0;
await Promise.all(buyers.map(async kp => {
  while (next < queue.length) {
    const name = queue[next++], started = Date.now();
    let ctx: Ctx | undefined;
    try {
      ctx = await scenarios[name](kp, await signIn(kp)); // sessions last 30 minutes
      results.push({ name, ok: true, txs: ctx.txs, ms: Date.now() - started, paymentId: ctx.paymentId });
    } catch (e) {
      results.push({ name, ok: false, txs: ctx?.txs ?? 0, ms: Date.now() - started, error: String(e).slice(0, 300) }); if (process.env.MATRIX_DEBUG) console.log((e as Error).stack);
    }
    const r = results.at(-1)!;
    console.log(`${String(results.length).padStart(3)} ${r.ok ? "ok  " : "FAIL"} ${name.padEnd(15)} ${Math.round(r.ms / 1000)}s ${r.paymentId ?? r.error}`);
  }
}));

const by = Object.fromEntries(mix.map(([n]) => [n, results.filter(r => r.name === n)]));
console.log("\nscenario         pass/total  onchain txs");
for (const [n, rs] of Object.entries(by)) console.log(`${n.padEnd(16)} ${rs.filter(r => r.ok).length}/${rs.length}`.padEnd(29) + rs.reduce((a, r) => a + r.txs, 0));
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} payments passed · ${results.reduce((a, r) => a + r.txs, 0)} onchain transactions`);
writeFileSync(`${dir}/matrix-result.json`, JSON.stringify(results, null, 2));
process.exit(passed === results.length ? 0 : 1);
