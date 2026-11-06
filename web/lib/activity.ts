// Buckets transaction timestamps for the stats chart. Shared by the RPC path (server/stats.ts)
// and the Convex path (convex/events.ts), whose stored counts are already 15-minute buckets.
const BINS = [60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 7 * 86400];

/** Counts in [from, to) with the smallest bin (at least `minBin`) that keeps the chart at 48 bars or fewer. */
export function bucket(counts: { at: number; n: number }[], from: number, to: number, minBin = 60) {
  const bin = BINS.find(b => b >= minBin && (to - from) / b <= 48) ?? BINS.at(-1)!;
  const start = Math.floor(from / bin) * bin, per = new Map<number, number>();
  for (const c of counts) if (c.at >= start && c.at < to) {
    const k = Math.floor(c.at / bin) * bin;
    per.set(k, (per.get(k) ?? 0) + c.n);
  }
  const length = Math.max(1, Math.floor((to - 1) / bin) - start / bin + 1);
  return { bin, points: Array.from({ length }, (_, i) => ({ at: start + i * bin, transactions: per.get(start + i * bin) ?? 0 })) };
}
