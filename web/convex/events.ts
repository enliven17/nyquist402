// Durable copy of the protected escrow's contract events. Soroban RPC keeps about seven days of
// events, so a cron (crons.ts) copies new ones here and folds them into running totals that the
// stats page reads (web/server/stats.ts).
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { PROTECTED_CONTRACT, PROTECTED_DEPLOY_TX } from "../lib/deployment";

const BIN = 900; // activity is stored in 15-minute buckets
const event = v.object({
  eid: v.string(), kind: v.string(), ledger: v.number(), at: v.number(), tx: v.string(), paymentId: v.string(),
  claimId: v.union(v.number(), v.null()), payer: v.optional(v.string()), arbiter: v.optional(v.string()),
  amount: v.optional(v.string()), seller: v.optional(v.string()), buyer: v.optional(v.string()), reason: v.optional(v.string()),
});
type Event = typeof event.type;
type Totals = {
  payments: number; buyers: number; transactions: number; events: number; claims: number; disputes: number; evidence: number;
  funded: string; paidToSeller: string; returnedToBuyer: string; claimed: string; firstAt: number | null; latestLedger: number;
  outcomes: Record<string, { count: number; seller: string; buyer: string }>;
  returns: Record<string, { count: number; amount: string }>;
  arbiters: Record<string, number>;
};
const empty = (): Totals => ({
  payments: 0, buyers: 0, transactions: 0, events: 0, claims: 0, disputes: 0, evidence: 0,
  funded: "0", paidToSeller: "0", returnedToBuyer: "0", claimed: "0", firstAt: null, latestLedger: 0,
  outcomes: {}, returns: {}, arbiters: {},
});
const add = (a: string, b?: string) => (BigInt(a) + BigInt(b ?? 0)).toString();

export const ingest = internalAction({
  args: {},
  handler: async ctx => {
    const server = new rpc.Server("https://soroban-testnet.stellar.org");
    const state = await ctx.runQuery(internal.events.chain);
    const filters = [{ type: "contract" as const, contractIds: [PROTECTED_CONTRACT] }];
    let startLedger = state?.startLedger;
    if (!startLedger) {
      const deploy = await server.getTransaction(PROTECTED_DEPLOY_TX);
      if (deploy.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error("Deployment transaction not found");
      startLedger = deploy.ledger;
    }
    let cursor = state?.cursor;
    for (let page = 0; page < 20; page++) {
      const res = cursor ? await server.getEvents({ cursor, filters, limit: 500 }) : await server.getEvents({ startLedger, filters, limit: 500 });
      const events = res.events.map(normalize);
      cursor = res.cursor;
      await ctx.runMutation(internal.events.apply, { events, cursor, startLedger, latestLedger: res.latestLedger });
      if (res.events.length < 500) return;
    }
  },
});

function normalize(e: rpc.Api.EventResponse): Event {
  const [kind, id, claimId] = e.topic.map(t => scValToNative(t));
  const value = scValToNative(e.value) as Record<string, any>;
  const out: Event = {
    eid: e.id, kind: String(kind), ledger: e.ledger, at: Math.floor(Date.parse(e.ledgerClosedAt) / 1000), tx: e.txHash,
    paymentId: Array.from(id as Uint8Array, b => b.toString(16).padStart(2, "0")).join(""), claimId: claimId === undefined ? null : Number(claimId),
  };
  if (out.kind === "payment_funded") Object.assign(out, { payer: String(value.terms.payer), arbiter: String(value.arbiter), amount: String(value.terms.max_amount) });
  if (out.kind === "claim_recorded") out.amount = String(value.claim.amount);
  if (out.kind === "claim_finalized") Object.assign(out, { seller: String(value.seller_amount), buyer: String(value.buyer_amount), reason: String(value.reason) });
  if (out.kind === "funds_returned") Object.assign(out, { amount: String(value.amount), reason: String(value.reason) });
  return out;
}

export const chain = internalQuery({ args: {}, handler: ctx => ctx.db.query("chain").first() });

export const apply = internalMutation({
  args: { events: v.array(event), cursor: v.string(), startLedger: v.number(), latestLedger: v.number() },
  handler: async (ctx, { events, cursor, startLedger, latestLedger }) => {
    const state = await ctx.db.query("chain").first();
    const t: Totals = state?.totals ?? empty();
    // Counts each key once (buyers, transactions, disputed claims); true the first time.
    const first = async (kind: string, key: string) => {
      if (await ctx.db.query("seen").withIndex("by_key", q => q.eq("kind", kind).eq("key", key)).first()) return false;
      await ctx.db.insert("seen", { kind, key });
      return true;
    };
    for (const e of events) {
      if (await ctx.db.query("events").withIndex("by_eid", q => q.eq("eid", e.eid)).first()) continue;
      await ctx.db.insert("events", e);
      t.events++; t.firstAt ??= e.at;
      if (await first("tx", e.tx)) {
        t.transactions++;
        const at = Math.floor(e.at / BIN) * BIN, bin = await ctx.db.query("bins").withIndex("by_at", q => q.eq("at", at)).first();
        if (bin) await ctx.db.patch(bin._id, { transactions: bin.transactions + 1 });
        else await ctx.db.insert("bins", { at, transactions: 1 });
      }
      if (e.kind === "payment_funded") {
        t.payments++; t.funded = add(t.funded, e.amount);
        if (await first("buyer", e.payer!)) t.buyers++;
        t.arbiters[e.arbiter!] = (t.arbiters[e.arbiter!] ?? 0) + 1;
      } else if (e.kind === "claim_recorded") { t.claims++; t.claimed = add(t.claimed, e.amount); }
      else if (e.kind === "case_updated") { t.evidence++; if (await first("dispute", `${e.paymentId}:${e.claimId}`)) t.disputes++; }
      else if (e.kind === "claim_finalized") {
        const o = t.outcomes[e.reason!] ?? { count: 0, seller: "0", buyer: "0" };
        t.outcomes[e.reason!] = { count: o.count + 1, seller: add(o.seller, e.seller), buyer: add(o.buyer, e.buyer) };
        t.paidToSeller = add(t.paidToSeller, e.seller); t.returnedToBuyer = add(t.returnedToBuyer, e.buyer);
      } else if (e.kind === "funds_returned") {
        const r = t.returns[e.reason!] ?? { count: 0, amount: "0" };
        t.returns[e.reason!] = { count: r.count + 1, amount: add(r.amount, e.amount) };
        t.returnedToBuyer = add(t.returnedToBuyer, e.amount);
      }
    }
    t.latestLedger = latestLedger;
    if (state) await ctx.db.patch(state._id, { cursor, totals: t });
    else await ctx.db.insert("chain", { cursor, startLedger, totals: t });
  },
});

/** The stats page payload (shape of web/server/stats.ts Stats, minus fields the server adds). */
export const stats = query({
  args: {},
  handler: async ctx => {
    const state = await ctx.db.query("chain").first();
    const t: Totals = state?.totals ?? empty();
    const now = Math.floor(Date.now() / 1000);
    const span = t.firstAt === null ? 0 : now - t.firstAt;
    const bin = [BIN, 3600, 6 * 3600, 86400, 7 * 86400].find(b => span / b <= 48) ?? 7 * 86400;
    const start = t.firstAt === null ? 0 : Math.floor(t.firstAt / bin) * bin;
    const stored = await ctx.db.query("bins").withIndex("by_at", q => q.gte("at", start)).collect();
    const perBin = new Map<number, number>();
    for (const b of stored) { const k = Math.floor(b.at / bin) * bin; perBin.set(k, (perBin.get(k) ?? 0) + b.transactions); }
    const points = t.firstAt === null ? [] : Array.from({ length: Math.floor(now / bin) - start / bin + 1 }, (_, i) => ({ at: start + i * bin, transactions: perBin.get(start + i * bin) ?? 0 }));
    const recent = await ctx.db.query("events").order("desc").take(20);
    const amount = (e: Event) => e.kind === "claim_finalized" ? e.seller! : e.amount ?? null;
    return {
      updatedAt: now, firstAt: t.firstAt, latestLedger: t.latestLedger,
      payments: t.payments, buyers: t.buyers, transactions: t.transactions, events: t.events,
      funded: t.funded, paidToSeller: t.paidToSeller, returnedToBuyer: t.returnedToBuyer,
      claims: t.claims, claimed: t.claimed, disputes: t.disputes, evidence: t.evidence,
      outcomes: Object.entries(t.outcomes).map(([reason, o]) => ({ reason, ...o })).sort((a, b) => b.count - a.count),
      returns: Object.entries(t.returns).map(([reason, r]) => ({ reason, ...r })).sort((a, b) => b.count - a.count),
      arbiters: Object.entries(t.arbiters).map(([address, payments]) => ({ address, payments })).sort((a, b) => b.payments - a.payments),
      activity: { bin, points },
      recent: recent.map(e => ({ kind: e.kind, at: e.at, tx: e.tx, paymentId: e.paymentId, amount: amount(e) })),
    };
  },
});
