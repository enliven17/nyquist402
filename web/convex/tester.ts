// Scheduled scenario runs against the hosted product (crons.ts). Each run opens a fresh testnet
// wallet, funds it with friendbot XLM and 10 test USDC bought on the testnet DEX, signs in through
// the public API and drives one scenario end to end, then records the onchain result.
import { Keypair } from "@stellar/stellar-sdk";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { connect, fundBuyer } from "../lib/scenarios";
import type { DemoConfig } from "../lib/protected/types";

export const run = internalAction({
  args: {},
  handler: async ctx => {
    const site = process.env.SITE_URL;
    if (!site) return console.log("SITE_URL is not set; skipping the scenario run");
    const api = async (body: Record<string, unknown>, token?: string) => {
      const res = await fetch(`${site}/api/protected`, {
        method: "POST", body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      const json = await res.json() as Record<string, unknown>;
      if (!json.ok) throw new Error(String(json.error));
      return json;
    };
    const { names, run } = await connect(api, async () => (await (await fetch(`${site}/api/protected`)).json() as { config: DemoConfig }).config);
    const seq = ((await ctx.runQuery(internal.tester.last))?.seq ?? -1) + 1;
    const name = names[seq % names.length]; // rotate so every scenario runs equally often
    const kp = Keypair.random();
    let result;
    try { await fundBuyer(kp, 5); result = await run(name, kp); }
    catch (e) { result = { name, ok: false, txs: 0, ms: 0, error: `funding: ${String(e).slice(0, 280)}` }; }
    await ctx.runMutation(internal.tester.record, { seq, buyer: kp.publicKey(), ...result });
  },
});

export const last = internalQuery({ args: {}, handler: ctx => ctx.db.query("runs").withIndex("by_seq").order("desc").first() });
export const record = internalMutation({
  args: { seq: v.number(), name: v.string(), ok: v.boolean(), txs: v.number(), ms: v.number(), buyer: v.string(), paymentId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, run) => { await ctx.db.insert("runs", run); },
});

/** Public summary for the stats page: totals per scenario and the latest runs. */
export const summary = query({
  args: {},
  handler: async ctx => {
    const runs = await ctx.db.query("runs").withIndex("by_seq").order("desc").take(2000);
    const scenarios = [...Map.groupBy(runs, r => r.name)].map(([name, rs]) => ({ name, runs: rs.length, passed: rs.filter(r => r.ok).length, txs: rs.reduce((a, r) => a + r.txs, 0) }));
    const latest = runs.slice(0, 20).map(r => ({ seq: r.seq, name: r.name, ok: r.ok, txs: r.txs, ms: r.ms, at: Math.floor(r._creationTime / 1000), paymentId: r.paymentId, error: r.error }));
    return { runs: runs.length, passed: runs.filter(r => r.ok).length, wallets: new Set(runs.map(r => r.buyer)).size, scenarios, latest };
  },
});
