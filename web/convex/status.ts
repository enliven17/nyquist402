// External health checks for the status page. A cron (crons.ts) probes each component every
// 5 minutes from Convex, outside the hosted site, and folds results into per-day counts.
import { Networks } from "@stellar/stellar-sdk";
import { v } from "convex/values";
import { internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ProtectedEscrowClient } from "../lib/protected/client";
import { PROTECTED_CONTRACT } from "../lib/deployment";

const INTERVAL = 5; // minutes between checks; each failed check counts as this many minutes down
const RPC = "https://soroban-testnet.stellar.org", HORIZON = "https://horizon-testnet.stellar.org";
export const COMPONENTS = [
  { id: "site", name: "Website", detail: "Landing page, docs and demo pages load" },
  { id: "api", name: "Payment API", detail: "Demo configuration responds and recipient USDC trustlines are ready" },
  { id: "signin", name: "Wallet sign-in", detail: "Sign-in challenges are issued and stored" },
  { id: "stats", name: "Stats API", detail: "Onchain totals are served" },
  { id: "contract", name: "Escrow contract", detail: "Protected escrow answers onchain reads" },
  { id: "rpc", name: "Soroban RPC", detail: "Stellar testnet RPC reports healthy" },
  { id: "horizon", name: "Horizon", detail: "Stellar testnet Horizon responds" },
] as const;
type Id = (typeof COMPONENTS)[number]["id"];

async function json(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<any>;
}
function probes(site: string): Record<Id, () => Promise<void>> {
  return {
    async site() {
      const res = await fetch(site, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!(await res.text()).includes('id="root"')) throw new Error("Unexpected page body");
    },
    async api() {
      const r = await json(`${site}/api/protected`);
      if (!r.ok) throw new Error(r.error);
      if (!r.config.readiness.ready) throw new Error("Recipient USDC trustlines missing");
    },
    async signin() {
      // A fixed public address; the challenge is never signed and expires after five minutes.
      const r = await json(`${site}/api/protected`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "auth_challenge", address: "GAUGBDDPCE4SH44FA44UYKA6FE4MKYA4TQGJRYZME5SNVMIZNSXVTHDJ" }) });
      if (!r.ok) throw new Error(r.error);
    },
    async stats() {
      const r = await json(`${site}/api/stats`);
      if (!r.ok) throw new Error(r.error);
    },
    async contract() {
      const version = await new ProtectedEscrowClient({ contractId: PROTECTED_CONTRACT, rpcUrl: RPC, networkPassphrase: Networks.TESTNET }).read("version");
      if (Number(version) !== 2) throw new Error(`Unexpected contract version ${version}`);
    },
    async rpc() {
      const r = await json(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }) });
      if (r.result?.status !== "healthy") throw new Error(`RPC ${r.result?.status ?? r.error?.message ?? "unknown"}`);
    },
    async horizon() { await json(HORIZON); },
  };
}

const result = v.object({ id: v.string(), ok: v.boolean(), ms: v.number(), error: v.optional(v.string()) });

export const check = internalAction({
  args: {},
  handler: async ctx => {
    const site = process.env.SITE_URL;
    if (!site) return;
    // One at a time, so each latency reflects that component rather than the others in flight.
    const results = [];
    for (const [id, probe] of Object.entries(probes(site))) {
      const started = Date.now();
      try { await probe(); results.push({ id, ok: true, ms: Date.now() - started }); }
      catch (e) { results.push({ id, ok: false, ms: Date.now() - started, error: String(e instanceof Error ? e.message : e).slice(0, 200) }); }
    }
    await ctx.runMutation(internal.status.record, { results });
  },
});

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const record = internalMutation({
  args: { results: v.array(result) },
  handler: async (ctx, { results }) => {
    const now = Date.now(), day = dayOf(now);
    await ctx.db.insert("checks", { at: Math.floor(now / 1000), results });
    for (const r of results) {
      const row = await ctx.db.query("uptime").withIndex("by_day", q => q.eq("component", r.id).eq("day", day)).first();
      if (row) await ctx.db.patch(row._id, { checks: row.checks + 1, failures: row.failures + (r.ok ? 0 : 1) });
      else await ctx.db.insert("uptime", { component: r.id, day, checks: 1, failures: r.ok ? 0 : 1 });
    }
    // Raw checks are only needed for recent detail; daily counts are kept.
    const old = await ctx.db.query("checks").withIndex("by_at", q => q.lt("at", Math.floor(now / 1000) - 30 * 86400)).take(20);
    for (const c of old) await ctx.db.delete(c._id);
  },
});

/** Status page payload: current state, daily bars for the last `days` UTC days and recent failures. */
export const summary = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.days ?? 90, 1), 365);
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const range = Array.from({ length: days }, (_, i) => dayOf(today - (days - 1 - i) * 86400_000));
    const latest = await ctx.db.query("checks").withIndex("by_at").order("desc").first();
    const recent = await ctx.db.query("checks").withIndex("by_at").order("desc").take(288 * 2);
    const failures = recent.flatMap(c => c.results.filter(r => !r.ok).map(r => ({ at: c.at, component: r.id, error: r.error ?? "Failed" }))).slice(0, 15);
    const first = await ctx.db.query("checks").withIndex("by_at").first();

    const components = await Promise.all(COMPONENTS.map(async c => {
      const rows = await ctx.db.query("uptime").withIndex("by_day", q => q.eq("component", c.id).gte("day", range[0])).collect();
      const byDay = new Map(rows.map(r => [r.day, r]));
      const now = latest?.results.find(r => r.id === c.id);
      const bars = range.map(day => { const r = byDay.get(day); return { day, checks: r?.checks ?? 0, down: (r?.failures ?? 0) * INTERVAL }; });
      const checks = rows.reduce((a, r) => a + r.checks, 0), failed = rows.reduce((a, r) => a + r.failures, 0);
      return { ...c, ok: now?.ok ?? null, ms: now?.ms ?? null, error: now?.error, uptime: checks ? (checks - failed) / checks : null, bars };
    }));

    // End-to-end payments come from the scheduled scenario runs (tester.ts), every 15 minutes.
    const runs = await ctx.db.query("runs").withIndex("by_seq").order("desc").take(3000);
    const runDays = Map.groupBy(runs.filter(r => dayOf(r._creationTime) >= range[0]), r => dayOf(r._creationTime));
    const inRange = runs.filter(r => dayOf(r._creationTime) >= range[0]);
    const payments = {
      id: "payments", name: "End-to-end payments", detail: "A fresh wallet funds and settles a payment scenario every 15 minutes",
      ok: runs[0]?.ok ?? null, ms: runs[0]?.ms ?? null, error: runs[0]?.error,
      uptime: inRange.length ? inRange.filter(r => r.ok).length / inRange.length : null,
      bars: range.map(day => { const rs = runDays.get(day) ?? []; return { day, checks: rs.length, down: rs.filter(r => !r.ok).length * 15 }; }),
      latest: runs.slice(0, 12).map(r => ({ name: r.name, ok: r.ok, at: Math.floor(r._creationTime / 1000) })),
    };
    const failedRuns = runs.filter(r => !r.ok).slice(0, 15).map(r => ({ at: Math.floor(r._creationTime / 1000), component: "payments", error: `${r.name}: ${r.error ?? "failed"}` }));
    const incidents = [...failures, ...failedRuns].sort((a, b) => b.at - a.at).slice(0, 15);
    return { checkedAt: latest?.at ?? null, since: first?.at ?? null, interval: INTERVAL, components: [...components, payments], failures: incidents };
  },
});
