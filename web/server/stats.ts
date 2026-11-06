import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { requestBackend } from "../lib/backend.ts";
import { PROTECTED_CONTRACT, PROTECTED_DEPLOY_TX } from "../lib/deployment.ts";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
// Bucket sizes for the activity chart; the smallest that keeps it under 48 bars.
const BINS = [60, 300, 900, 3600, 6 * 3600, 86400];

type Event = { kind: string; ledger: number; at: number; tx: string; paymentId: string; claimId: number | null; value: Record<string, unknown> };
export type Stats = {
  contractId: string; updatedAt: number; firstAt: number | null; latestLedger: number;
  payments: number; buyers: number; transactions: number; events: number;
  funded: string; paidToSeller: string; returnedToBuyer: string;
  claims: number; claimed: string; disputes: number; evidence: number;
  outcomes: { reason: string; count: number; seller: string; buyer: string }[];
  returns: { reason: string; count: number; amount: string }[];
  arbiters: { address: string; payments: number }[];
  activity: { bin: number; points: { at: number; transactions: number }[] };
  recent: { kind: string; at: number; tx: string; paymentId: string; amount: string | null }[];
};
let cache: { at: number; value: Promise<Stats> } | undefined;
let startLedger: number | undefined;

/** Contract-wide numbers rebuilt from onchain events; cached for 30 seconds. */
export function stats(): Promise<Stats> {
  if (!cache || Date.now() - cache.at > 30_000) {
    const value = build();
    cache = { at: Date.now(), value };
    value.catch(() => { cache = undefined; });
  }
  return cache.value;
}

async function events(): Promise<{ list: Event[]; latestLedger: number }> {
  if (!startLedger) {
    const deploy = await server.getTransaction(PROTECTED_DEPLOY_TX);
    if (deploy.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error("Deployment transaction not found");
    startLedger = deploy.ledger;
  }
  const list: Event[] = [];
  const filters = [{ type: "contract" as const, contractIds: [PROTECTED_CONTRACT] }];
  let page = await server.getEvents({ startLedger, filters, limit: 1000 });
  for (;;) {
    for (const e of page.events) {
      const [kind, id, claimId] = e.topic.map(t => scValToNative(t));
      list.push({ kind: String(kind), ledger: e.ledger, at: Date.parse(e.ledgerClosedAt) / 1000, tx: e.txHash, paymentId: Buffer.from(id).toString("hex"), claimId: claimId === undefined ? null : Number(claimId), value: scValToNative(e.value) });
    }
    if (page.events.length < 1000) return { list, latestLedger: page.latestLedger };
    page = await server.getEvents({ cursor: page.cursor, filters, limit: 1000 });
  }
}

const sum = (xs: unknown[]) => xs.reduce<bigint>((a, x) => a + BigInt(x as bigint), 0n).toString();

async function build(): Promise<Stats> {
  // The hosted event index retains history beyond the RPC retention window.
  if (process.env.BACKEND_URL) {
    const url = process.env.BACKEND_URL;
    const chain = await requestBackend<Omit<Stats, "contractId">>(url, "query", "events:stats", {});
    return { contractId: PROTECTED_CONTRACT, ...chain };
  }
  const { list, latestLedger } = await events();
  const of = (kind: string) => list.filter(e => e.kind === kind);
  const funded = of("payment_funded"), claims = of("claim_recorded"), cases = of("case_updated");
  const finalized = of("claim_finalized"), returned = of("funds_returned");
  const terms = (e: Event) => e.value.terms as Record<string, unknown>;

  const group = <T,>(xs: Event[], key: (e: Event) => string, f: (g: Event[]) => T) =>
    [...Map.groupBy(xs, key)].map(([k, g]) => ({ k, ...f(g) }));

  const txAt = new Map(list.map(e => [e.tx, e.at]));
  const first = list[0]?.at ?? null, last = Math.floor(Date.now() / 1000);
  const span = first === null ? 0 : last - first;
  const bin = BINS.find(b => span / b <= 48) ?? 86400;
  const start = first === null ? 0 : Math.floor(first / bin) * bin;
  const perBin = Map.groupBy([...txAt.values()], at => Math.floor(at / bin) * bin);
  const points = first === null ? [] : Array.from({ length: Math.floor(last / bin) - start / bin + 1 }, (_, i) => {
    const at = start + i * bin;
    return { at, transactions: perBin.get(at)?.length ?? 0 };
  });

  const amountOf = (e: Event) => {
    const v = e.value;
    if (e.kind === "payment_funded") return String(terms(e).max_amount);
    if (e.kind === "claim_recorded") return String((v.claim as Record<string, unknown>).amount);
    if (e.kind === "claim_finalized") return String(v.seller_amount);
    if (e.kind === "funds_returned") return String(v.amount);
    return null;
  };

  return {
    contractId: PROTECTED_CONTRACT, updatedAt: last, firstAt: first, latestLedger,
    payments: funded.length,
    buyers: new Set(funded.map(e => terms(e).payer)).size,
    transactions: txAt.size, events: list.length,
    funded: sum(funded.map(e => terms(e).max_amount)),
    paidToSeller: sum(finalized.map(e => e.value.seller_amount)),
    returnedToBuyer: (BigInt(sum(finalized.map(e => e.value.buyer_amount))) + BigInt(sum(returned.map(e => e.value.amount)))).toString(),
    claims: claims.length,
    claimed: sum(claims.map(e => (e.value.claim as Record<string, unknown>).amount)),
    disputes: new Set(cases.map(e => `${e.paymentId}:${e.claimId}`)).size,
    evidence: cases.length,
    outcomes: group(finalized, e => String(e.value.reason), g => ({ count: g.length, seller: sum(g.map(e => e.value.seller_amount)), buyer: sum(g.map(e => e.value.buyer_amount)) }))
      .map(({ k, ...r }) => ({ reason: k, ...r })).sort((a, b) => b.count - a.count),
    returns: group(returned, e => String(e.value.reason), g => ({ count: g.length, amount: sum(g.map(e => e.value.amount)) }))
      .map(({ k, ...r }) => ({ reason: k, ...r })).sort((a, b) => b.count - a.count),
    arbiters: group(funded, e => String(e.value.arbiter), g => ({ payments: g.length }))
      .map(({ k, ...r }) => ({ address: k, ...r })).sort((a, b) => b.payments - a.payments),
    activity: { bin, points },
    recent: list.slice(-20).reverse().map(e => ({ kind: e.kind, at: e.at, tx: e.tx, paymentId: e.paymentId, amount: amountOf(e) })),
  };
}
