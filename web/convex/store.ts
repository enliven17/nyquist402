// Durable service data for the hosted API (web/server/store.ts calls these over HTTP).
// Convex functions are public, so every one requires the shared CONVEX_STORE_KEY.
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

function guard(key: string) {
  const expected = process.env.CONVEX_STORE_KEY;
  if (!expected || key !== expected) throw new Error("Unauthorized");
}
const key = v.string();
const jobKey = { key, contract: v.string(), payment: v.string(), claim: v.number(), action: v.string() };

export const rememberPayment = mutation({
  args: { key, contract: v.string(), id: v.string(), buyer: v.string(), seller: v.string(), agreement: v.string() },
  handler: async (ctx, { key, ...payment }) => {
    guard(key);
    const existing = await ctx.db.query("payments").withIndex("by_payment_id", q => q.eq("contract", payment.contract).eq("id", payment.id)).first();
    if (!existing) await ctx.db.insert("payments", payment);
  },
});
export const history = query({
  args: { key, contract: v.string(), account: v.string() },
  handler: async (ctx, { key, contract, account }) => {
    guard(key);
    const [bought, sold] = await Promise.all([
      ctx.db.query("payments").withIndex("by_buyer", q => q.eq("contract", contract).eq("buyer", account)).order("desc").take(100),
      ctx.db.query("payments").withIndex("by_seller", q => q.eq("contract", contract).eq("seller", account)).order("desc").take(100),
    ]);
    const all = new Map([...bought, ...sold].map(p => [p._id, p]));
    return [...all.values()].sort((a, b) => b._creationTime - a._creationTime).slice(0, 100).map(p => ({ paymentId: p.id, agreement: p.agreement }));
  },
});
export const recentPayments = query({
  args: { key, contract: v.string() },
  handler: async (ctx, { key, contract }) => {
    guard(key);
    return (await ctx.db.query("payments").withIndex("by_contract", q => q.eq("contract", contract)).order("desc").take(100)).map(p => p.id);
  },
});
export const storeBody = mutation({
  args: { key, contract: v.string(), payment: v.string(), hash: v.string(), party: v.string(), kind: v.string(), claim: v.number(), body: v.string() },
  handler: async (ctx, { key, ...row }) => {
    guard(key);
    const rows = await ctx.db.query("bodies").withIndex("by_payment", q => q.eq("contract", row.contract).eq("payment", row.payment)).take(1000);
    if (rows.some(r => r.hash === row.hash && r.party === row.party && r.kind === row.kind && r.claim === row.claim)) return;
    if (rows.length >= 1000) throw new Error("Payment evidence storage limit reached");
    await ctx.db.insert("bodies", row);
  },
});
export const bodies = query({
  args: { key, contract: v.string(), payment: v.string(), claim: v.number() },
  handler: async (ctx, { key, contract, payment, claim }) => {
    guard(key);
    const rows = await ctx.db.query("bodies").withIndex("by_payment", q => q.eq("contract", contract).eq("payment", payment).eq("claim", claim)).collect();
    return rows.map(r => ({ hash: r.hash, party: r.party, kind: r.kind, body: r.body, created: Math.floor(r._creationTime) }));
  },
});
export const track = mutation({
  args: { key, hash: v.string(), contract: v.string(), payment: v.string(), account: v.string(), action: v.string() },
  handler: async (ctx, { key, ...tx }) => {
    guard(key);
    if (!await ctx.db.query("transactions").withIndex("by_hash", q => q.eq("hash", tx.hash)).first()) await ctx.db.insert("transactions", { ...tx, status: "pending" });
  },
});
export const activity = query({
  args: { key, contract: v.string(), payment: v.string() },
  handler: async (ctx, { key, contract, payment }) => {
    guard(key);
    const rows = await ctx.db.query("transactions").withIndex("by_payment", q => q.eq("contract", contract).eq("payment", payment)).order("desc").take(100);
    return rows.map(r => ({ tx: r.hash, label: r.action, status: r.status }));
  },
});
export const pendingTransactions = query({
  args: { key, contract: v.string() },
  handler: async (ctx, { key, contract }) => {
    guard(key);
    return (await ctx.db.query("transactions").withIndex("by_status", q => q.eq("contract", contract).eq("status", "pending")).take(100)).map(r => r.hash);
  },
});
export const setTransactionStatus = mutation({
  args: { key, hash: v.string(), status: v.string() },
  handler: async (ctx, { key, hash, status }) => {
    guard(key);
    const row = await ctx.db.query("transactions").withIndex("by_hash", q => q.eq("hash", hash)).first();
    if (row) await ctx.db.patch(row._id, { status });
  },
});

type JobRef = { contract: string; payment: string; claim: number; action: string };
const findJob = (ctx: QueryCtx, a: JobRef) =>
  ctx.db.query("jobs").withIndex("by_key", q => q.eq("contract", a.contract).eq("payment", a.payment).eq("claim", a.claim).eq("action", a.action)).first();
export const job = query({
  args: jobKey,
  handler: async (ctx, { key, ...a }) => {
    guard(key);
    const row = await findJob(ctx, a);
    return row ? { tx: row.tx, status: row.status, xdr: row.xdr } : null;
  },
});
export const addJob = mutation({
  args: { ...jobKey, tx: v.string(), xdr: v.string() },
  handler: async (ctx, { key, tx, xdr, ...a }) => {
    guard(key);
    if (await findJob(ctx, a)) return false;
    await ctx.db.insert("jobs", { ...a, tx, xdr, status: "pending" });
    return true;
  },
});
export const setJobStatus = mutation({
  args: { ...jobKey, status: v.string() },
  handler: async (ctx, { key, status, ...a }) => {
    guard(key);
    const row = await findJob(ctx, a);
    if (row) await ctx.db.patch(row._id, { status });
  },
});

export const saveChallenge = mutation({
  args: { key, id: v.string(), address: v.string(), xdr: v.string(), expires: v.number() },
  handler: async (ctx, { key, ...challenge }) => {
    guard(key);
    const now = Math.floor(Date.now() / 1000);
    for (const old of await ctx.db.query("challenges").withIndex("by_expires", q => q.lte("expires", now)).take(100)) await ctx.db.delete(old._id);
    if ((await ctx.db.query("challenges").take(1000)).length >= 1000) throw new Error("Too many pending sign-ins");
    await ctx.db.insert("challenges", challenge);
  },
});
export const getChallenge = query({
  args: { key, id: v.string() },
  handler: async (ctx, { key, id }) => {
    guard(key);
    const row = await ctx.db.query("challenges").withIndex("by_cid", q => q.eq("id", id)).first();
    return row ? { address: row.address, xdr: row.xdr, expires: row.expires } : null;
  },
});
export const consumeChallenge = mutation({
  args: { key, id: v.string() },
  handler: async (ctx, { key, id }) => {
    guard(key);
    const row = await ctx.db.query("challenges").withIndex("by_cid", q => q.eq("id", id)).first();
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});
