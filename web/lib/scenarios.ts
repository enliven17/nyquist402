// Real testnet payment scenarios driven through the product API, as the demo page drives it.
// Shared by scripts/e2e-matrix.ts (in-process API) and convex/tester.ts (the hosted API on a schedule).
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { ProtectedEscrowClient } from "./protected/client.ts";
import { hashText } from "./protected/codec.ts";
import { USDC_ISSUER } from "./usdc.ts";
import type { DemoConfig, PaymentState, PaymentTerms, ProtectedAction } from "./protected/types.ts";

export type Api = (body: Record<string, unknown>, token?: string) => Promise<Record<string, unknown>>;
type Ctx = { kp: Keypair; token: string; paymentId: string; capability: string; terms: PaymentTerms; txs: number };
export type Result = { name: string; ok: boolean; txs: number; ms: number; error?: string; paymentId?: string };

const USDC = new Asset("USDC", USDC_ISSUER);
const HORIZON = "https://horizon-testnet.stellar.org";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const u = (usdc: number) => String(Math.round(usdc * 1e7));
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const same = (actual: unknown, expected: unknown, what: string) => check(actual === expected, `${what}: expected ${expected}, got ${actual}`);

/** Creates the account with friendbot if needed and buys test USDC on the testnet DEX up to `usdc`.
 * Plain Horizon REST (no Horizon.Server) so it also runs in Convex's default runtime. */
export async function fundBuyer(kp: Keypair, usdc = 40) {
  const load = async () => {
    const res = await fetch(`${HORIZON}/accounts/${kp.publicKey()}`);
    return res.ok ? await res.json() as { sequence: string; balances: { asset_code?: string; asset_issuer?: string; balance: string }[] } : null;
  };
  let account = await load();
  if (!account) {
    const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    if (!res.ok) throw new Error(`friendbot ${res.status}`);
    account = await load();
    if (!account) throw new Error("friendbot account not visible on Horizon");
  }
  const line = account.balances.find(b => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER);
  if (line && Number(line.balance) >= usdc) return;
  const buy = (usdc * 2 - Number(line?.balance ?? 0)).toFixed(7);
  const tx = new TransactionBuilder(new Account(kp.publicKey(), account.sequence), { fee: "10000", networkPassphrase: Networks.TESTNET });
  if (!line) tx.addOperation(Operation.changeTrust({ asset: USDC }));
  tx.addOperation(Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: String(Math.ceil(Number(buy) * 3)), destination: kp.publicKey(), destAsset: USDC, destAmount: buy, path: [] }));
  const built = tx.setTimeout(60).build(); built.sign(kp);
  const res = await fetch(`${HORIZON}/transactions`, { method: "POST", body: new URLSearchParams({ tx: built.toXDR() }) });
  if (!res.ok) throw new Error(`USDC purchase failed: ${(await res.text()).slice(0, 200)}`);
}

export async function connect(api: Api, getConfig: () => Promise<DemoConfig>) {
  const config = await getConfig();
  const client = new ProtectedEscrowClient(config);
  const [, arbA, arbB] = config.arbiters;
  check(config.version === 2 && arbA && arbB, "needs the protected escrow and three demo arbiters");

  const opened = new Map<string, Ctx>(); // the payment each buyer is running, for failure reports
  async function signIn(kp: Keypair) {
    const ch = await api({ operation: "auth_challenge", address: kp.publicKey() });
    const tx = TransactionBuilder.fromXDR(ch.xdr as string, Networks.TESTNET); tx.sign(kp);
    return (await api({ operation: "auth_verify", id: ch.id, xdr: tx.toXDR() })).token as string;
  }
  async function open(kp: Keypair, token: string, buyerArbiter: string | null, fallbackSellerBps = 5000): Promise<Ctx> {
    const agreement = `scenario ${Date.now()} ${Math.random()}`;
    // The API allows five quotes per buyer per minute; back off if a buyer hits it.
    let q: Record<string, unknown> | undefined;
    for (let i = 0; !q; i++) {
      try { q = await api({ operation: "quote", payer: kp.publicKey(), agreement, agreementHash: await hashText(agreement), buyerArbiter, fallbackSellerBps }, token); }
      catch (e) { if (i < 6 && /Too many quote/.test(String(e))) await sleep(15000); else throw e; }
    }
    const ctx: Ctx = { kp, token, paymentId: q.paymentId as string, capability: q.capability as string, terms: q.terms as PaymentTerms, txs: 0 };
    opened.set(kp.publicKey(), ctx);
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
  async function fails(ctx: Ctx, action: ProtectedAction, why: string) {
    try { await send(ctx, action); } catch { return; }
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
  async function rejects(run: Promise<unknown>, why: RegExp) {
    try { await run; } catch (e) { if (why.test(String(e))) return; throw e; }
    throw new Error(`expected rejection ${why}`);
  }
  const closeOut = (ctx: Ctx) => send(ctx, { type: "void_unclaimed", paymentId: ctx.paymentId });
  async function expect(ctx: Ctx, paid: number, returned: number) {
    const s: PaymentState = await client.state(ctx.paymentId);
    same(s.paid_to_seller, u(paid), "paid to seller");
    same(s.returned_to_buyer, u(returned), "returned to buyer");
    same(s.reserved, "0", "reserved"); same(s.available, "0", "available");
  }

  const scenarios = {
    async accept(kp: Keypair, token: string) {
      const ctx = await open(kp, token, null);
      const { id, c } = await claim(ctx, 3);
      await fails(ctx, { type: "accept", paymentId: ctx.paymentId, claimId: id, commitment: "00".repeat(32) }, "stale commitment");
      await accept(ctx, id, c.commitment);
      await fails(ctx, { type: "accept", paymentId: ctx.paymentId, claimId: id, commitment: c.commitment }, "double accept");
      await closeOut(ctx); await expect(ctx, 3, 7); return ctx;
    },
    async twoClaims(kp: Keypair, token: string) {
      const ctx = await open(kp, token, null);
      const a = await claim(ctx, 2); await accept(ctx, a.id, a.c.commitment);
      const b = await claim(ctx, 5); await accept(ctx, b.id, b.c.commitment);
      await fails(ctx, { type: "claim", paymentId: ctx.paymentId, amount: u(4), delivery: await hashText("over budget") }, "over budget");
      await closeOut(ctx); await expect(ctx, 7, 3); return ctx;
    },
    async reviewExpiry(kp: Keypair, token: string) {
      const ctx = await open(kp, token, null);
      const { id, c } = await claim(ctx, 4);
      await fails(ctx, { type: "settle", paymentId: ctx.paymentId, claimId: id }, "review pending");
      await until(c.review_until);
      await send(ctx, { type: "settle", paymentId: ctx.paymentId, claimId: id });
      await closeOut(ctx); await expect(ctx, 4, 6); return ctx;
    },
    async defaultRules(kp: Keypair, token: string) {
      const ctx = await open(kp, token, null);
      const { id } = await claim(ctx, 4);
      await dispute(ctx, id, ctx.terms.payer); await evidence(ctx, id, ctx.terms.seller);
      await until((await client.claimState(ctx.paymentId, id)).response_until);
      await rejects(rule(ctx, id, 5), /exceeds/);
      await rule(ctx, id, 2);
      await closeOut(ctx); await expect(ctx, 2, 8); return ctx;
    },
    async arbiterA(kp: Keypair, token: string) {
      const ctx = await open(kp, token, arbA.address);
      same(ctx.terms.seller_arbiter, arbA.address, "seller arbiter");
      const { id } = await claim(ctx, 3);
      await dispute(ctx, id, ctx.terms.payer);
      same(await client.arbiter(ctx.paymentId, id), arbA.address, "case arbiter");
      await until((await client.claimState(ctx.paymentId, id)).response_until);
      await rule(ctx, id, 1.5);
      await closeOut(ctx); await expect(ctx, 1.5, 8.5); return ctx;
    },
    async arbiterB(kp: Keypair, token: string) {
      const ctx = await open(kp, token, arbB.address);
      const { id } = await claim(ctx, 5);
      await dispute(ctx, id, ctx.terms.payer); await evidence(ctx, id, ctx.terms.seller);
      await until((await client.claimState(ctx.paymentId, id)).response_until);
      await rule(ctx, id, 0);
      await closeOut(ctx); await expect(ctx, 0, 10); return ctx;
    },
    async fallback(kp: Keypair, token: string) {
      const ctx = await open(kp, token, null, 7000);
      const { id } = await claim(ctx, 4);
      await dispute(ctx, id, ctx.terms.payer);
      const c = await client.claimState(ctx.paymentId, id);
      await fails(ctx, { type: "finalize_fallback", paymentId: ctx.paymentId, claimId: id }, "fallback not ready");
      await until(c.fallback_at);
      await send(ctx, { type: "finalize_fallback", paymentId: ctx.paymentId, claimId: id });
      await closeOut(ctx); await expect(ctx, 2.8, 7.2); return ctx;
    },
    async reclaim(kp: Keypair, token: string) {
      const ctx = await open(kp, token, null);
      const { id, c } = await claim(ctx, 3); await accept(ctx, id, c.commitment);
      await fails(ctx, { type: "reclaim", paymentId: ctx.paymentId }, "session open");
      await until(ctx.terms.delivery_deadline);
      await fails(ctx, { type: "claim", paymentId: ctx.paymentId, amount: u(1), delivery: await hashText("late") }, "session closed");
      await send(ctx, { type: "reclaim", paymentId: ctx.paymentId });
      await expect(ctx, 3, 7); return ctx;
    },
    async sellerDisputes(kp: Keypair, token: string) {
      const ctx = await open(kp, token, null);
      const { id } = await claim(ctx, 6);
      await dispute(ctx, id, ctx.terms.seller); await evidence(ctx, id, ctx.terms.payer);
      await until((await client.claimState(ctx.paymentId, id)).response_until);
      await rule(ctx, id, 6);
      await closeOut(ctx); await expect(ctx, 6, 4); return ctx;
    },
  };
  type Name = keyof typeof scenarios;

  /** Runs one scenario with a fresh sign-in; never throws. */
  async function run(name: Name, kp: Keypair): Promise<Result> {
    const started = Date.now();
    opened.delete(kp.publicKey());
    try {
      const ctx = await scenarios[name](kp, await signIn(kp)); // sessions last 30 minutes
      return { name, ok: true, txs: ctx.txs, ms: Date.now() - started, paymentId: ctx.paymentId };
    } catch (e) {
      const ctx = opened.get(kp.publicKey());
      return { name, ok: false, txs: ctx?.txs ?? 0, ms: Date.now() - started, error: String(e).slice(0, 300), paymentId: ctx?.paymentId };
    }
  }
  return { config, client, names: Object.keys(scenarios) as Name[], run };
}
