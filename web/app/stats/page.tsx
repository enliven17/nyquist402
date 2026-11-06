import { useEffect, useRef, useState } from "react";
import type { Stats } from "../../server/stats";
import { Sk } from "@/components/Skeleton";
import "./stats.css";

const EXPERT = "https://stellar.expert/explorer/testnet";
const usdc = (units: string) => (Number(BigInt(units)) / 1e7).toLocaleString("en-US", { maximumFractionDigits: 2 });
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const ago = (at: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - at);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const REASONS: Record<string, string> = {
  accept: "Accepted by buyer", review_expired: "Review window expired", ruling: "Arbiter ruling", fallback: "Signed fallback",
  void: "Released by seller", reclaim: "Reclaimed after deadline",
};
const EVENTS: Record<string, string> = {
  payment_funded: "Funded", claim_recorded: "Claim", case_updated: "Dispute / evidence", claim_finalized: "Settled", funds_returned: "Returned",
};

export default function StatsPage() {
  const [data, setData] = useState<Stats>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/stats").then(r => r.json()).then(r => {
      if (!live) return;
      if (r.ok) { setData(r.stats); setError(undefined); } else setError(r.error);
    }).catch(() => live && setError("Stats unavailable"));
    load();
    const timer = setInterval(load, 30_000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  return (
    <main className="st">
      <header className="st-head">
        <h1>Onchain stats</h1>
        <p>Read from the protected escrow's events on Stellar testnet. Refreshes every 30 seconds.</p>
        {!data && !error && <p className="st-meta"><Sk w={320} h={12} /></p>}
        {data && <p className="st-meta">
          <a href={`${EXPERT}/contract/${data.contractId}`} target="_blank" rel="noreferrer">{short(data.contractId)} ↗</a>
          <span>ledger {data.latestLedger.toLocaleString("en-US")}</span>
          {data.firstAt && <span>first payment {ago(data.firstAt)}</span>}
        </p>}
      </header>

      {error && !data && <p className="st-error">{error}</p>}
      {!data && !error && <Loading />}

      {data && <>
        <dl className="st-tiles">
          <Tile label="Payments funded" value={data.payments.toLocaleString("en-US")} note={`${data.buyers} buyers`} />
          <Tile label="Onchain transactions" value={data.transactions.toLocaleString("en-US")} note={`${data.events} contract events`} />
          <Tile label="USDC funded" value={usdc(data.funded)} note={`${usdc(data.claimed)} claimed`} />
          <Tile label="Paid to sellers" value={usdc(data.paidToSeller)} note="USDC" />
          <Tile label="Returned to buyers" value={usdc(data.returnedToBuyer)} note="USDC" />
          <Tile label="Disputed claims" value={data.disputes.toLocaleString("en-US")} note={`of ${data.claims} claims`} />
        </dl>

        <section className="st-card">
          <ActivityCard live={data.activity} firstAt={data.firstAt} />
        </section>

        <div className="st-grid">
          <section className="st-card">
            <h2>How claims settled</h2>
            <Breakdown rows={data.outcomes.map(o => ({ key: o.reason, count: o.count, note: `${usdc(o.seller)} to seller · ${usdc(o.buyer)} to buyer` }))} />
          </section>
          <section className="st-card">
            <h2>Unused funds returned</h2>
            <Breakdown rows={data.returns.map(r => ({ key: r.reason, count: r.count, note: `${usdc(r.amount)} USDC` }))} />
            <h2 className="st-sub">Arbiter per payment</h2>
            <ul className="st-arbiters">
              {data.arbiters.map(a => (
                <li key={a.address}><a href={`${EXPERT}/account/${a.address}`} target="_blank" rel="noreferrer">{short(a.address)}</a><span>{a.payments} payments</span></li>
              ))}
            </ul>
          </section>
        </div>

        <section className="st-card">
          <h2>Latest events</h2>
          <div className="st-table st-events">
            <table>
              <thead><tr><th>Event</th><th>Payment</th><th className="num">USDC</th><th>Time</th><th>Transaction</th></tr></thead>
              <tbody>
                {data.recent.map(e => (
                  <tr key={e.tx + e.kind}>
                    <td className="st-lead">{EVENTS[e.kind] ?? e.kind}</td>
                    <td data-label="Payment"><code>{short(e.paymentId)}</code></td>
                    <td data-label="USDC" className="num">{e.amount === null ? "—" : usdc(e.amount)}</td>
                    <td data-label="Time">{ago(e.at)}</td>
                    <td data-label="Transaction"><a href={`${EXPERT}/tx/${e.tx}`} target="_blank" rel="noreferrer"><code>{short(e.tx)}</code> ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>}
    </main>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading onchain stats">
      <dl className="st-tiles">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}><dt><Sk w={110} h={10} /></dt><dd><Sk w={90} h={40} style={{ margin: "12px 0 10px" }} /><Sk w={80} h={11} /></dd></div>
        ))}
      </dl>
      <section className="st-card"><Sk w={160} h={14} style={{ marginBottom: 22 }} />
        <div className="st-sk-bars">{Array.from({ length: 32 }, (_, i) => <Sk key={i} h={`${30 + ((i * 37) % 60)}%`} />)}</div>
      </section>
      <div className="st-grid">
        {[0, 1].map(c => (
          <section className="st-card" key={c}><Sk w={150} h={14} style={{ marginBottom: 22 }} />
            {Array.from({ length: 4 }, (_, i) => <div key={i} style={{ marginBottom: 18 }}><Sk w="60%" h={12} /><Sk h={8} style={{ margin: "8px 0" }} /><Sk w={140} h={10} /></div>)}
          </section>
        ))}
      </div>
      <section className="st-card"><Sk w={120} h={14} style={{ marginBottom: 22 }} />
        {Array.from({ length: 8 }, (_, i) => <Sk key={i} h={14} style={{ margin: "0 0 18px" }} />)}
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return <div><dt>{label}</dt><dd><b>{value}</b><span>{note}</span></dd></div>;
}

function Breakdown({ rows }: { rows: { key: string; count: number; note: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  if (!rows.length) return <p className="st-muted">None yet.</p>;
  return (
    <ul className="st-bars">
      {rows.map(r => (
        <li key={r.key}>
          <div className="st-bar-label"><span>{REASONS[r.key] ?? r.key}</span><b>{r.count}</b></div>
          <div className="st-bar"><i style={{ width: `${(r.count / max) * 100}%` }} /></div>
          <small>{r.note}</small>
        </li>
      ))}
    </ul>
  );
}

const RANGES = [{ label: "24H", span: 86400 }, { label: "7D", span: 7 * 86400 }, { label: "30D", span: 30 * 86400 }, { label: "All", span: null }] as const;
type Series = Stats["activity"];
const when = (at: number, opts: Intl.DateTimeFormatOptions) => new Date(at * 1000).toLocaleString("en-US", opts);

/** The chart with range buttons and earlier/later paging; "All" follows the live 30-second refresh. */
function ActivityCard({ live, firstAt }: { live: Series; firstAt: number | null }) {
  const [span, setSpan] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null); // null: ends now
  const [series, setSeries] = useState<Series>();
  const [loading, setLoading] = useState(false);
  const now = Math.floor(Date.now() / 1000);
  const to = end ?? now + 1, from = span === null ? (firstAt ?? now) : to - span;
  useEffect(() => {
    if (span === null) { setSeries(undefined); return; }
    let live = true;
    setLoading(true);
    fetch(`/api/stats/activity?from=${from}&to=${to}`).then(r => r.json()).then(r => { if (live && r.ok) setSeries(r.activity); })
      .catch(() => undefined).finally(() => live && setLoading(false));
    return () => { live = false; };
    // Refetch only when the window changes; `to` moves every render while `end` is null.
  }, [span, end]);
  const shown = span === null ? live : series;
  const choose = (next: number | null) => { setSpan(next); setEnd(null); };
  const earlier = span !== null && firstAt !== null && from > firstAt;
  const later = span !== null && end !== null;
  const total = shown?.points.reduce((a, p) => a + p.transactions, 0) ?? 0;
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  return (
    <section className="st-card">
      <div className="st-chart-head">
        <h2>Transactions over time</h2>
        <div className="st-range">
          {span !== null && <button type="button" disabled={!earlier} onClick={() => setEnd(to - span)} aria-label="Earlier">‹</button>}
          {RANGES.map(r => <button type="button" key={r.label} aria-pressed={span === r.span} onClick={() => choose(r.span)}>{r.label}</button>)}
          {span !== null && <button type="button" disabled={!later} onClick={() => setEnd(to + span >= now ? null : to + span)} aria-label="Later">›</button>}
        </div>
      </div>
      <p className="st-muted st-note">{when(from, fmt)} – {end === null ? "now" : when(to, fmt)} · {total.toLocaleString("en-US")} transactions</p>
      {shown ? <div className={loading ? "st-loading" : undefined}><Activity points={shown.points} bin={shown.bin} span={to - from} /></div>
        : <div className="st-sk-bars">{Array.from({ length: 32 }, (_, i) => <Sk key={i} h={`${30 + ((i * 37) % 60)}%`} />)}</div>}
    </section>
  );
}

const PAD = { l: 44, r: 8, t: 12, b: 26 };
function Activity({ points, bin, span }: { points: { at: number; transactions: number }[]; bin: number; span: number }) {
  const [hover, setHover] = useState<number>();
  // Drawn at the container's real width, so it fits a phone without scrolling or shrinking text.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(960);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, [points.length === 0]);
  const H = W < 600 ? 180 : 220;
  if (!points.some(p => p.transactions)) return <p className="st-muted">No transactions in this range.</p>;
  const max = Math.max(1, ...points.map(p => p.transactions));
  const top = max <= 10 ? Math.max(2, Math.ceil(max / 2) * 2) : Math.ceil(max / 10) * 10; // even, so the midline is whole
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const step = iw / points.length, bw = Math.max(2, step - 2);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const label = (at: number) => when(at, bin >= 86400 ? { month: "short", day: "numeric" } : span > 86400 ? { month: "short", day: "numeric", hour: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  const every = Math.ceil(points.length / Math.max(2, Math.min(span > 86400 && bin < 86400 ? 6 : 8, Math.floor(W / 120))));
  const h = hover === undefined ? undefined : points[hover];
  return (
    <div className="st-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Onchain transactions per ${bin / 60} minutes`} onMouseLeave={() => setHover(undefined)}>
        {[0, top / 2, top].map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="st-grid-line" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="st-axis">{v}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = PAD.l + i * step + (step - bw) / 2, top = y(p.transactions), bh = PAD.t + ih - top;
          return (
            <g key={p.at} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + i * step} y={PAD.t} width={step} height={ih} fill="transparent" />
              {bh > 0 && <path className={hover === i ? "st-mark on" : "st-mark"} d={bar(x, top, bw, bh)} />}
              {i % every === 0 && points.length - i > every / 2 && <text x={Math.max(PAD.l, x + bw / 2)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"} className="st-axis">{label(p.at)}</text>}
            </g>
          );
        })}
      </svg>
      {h && hover !== undefined && (
        <div className="st-tip" style={{ left: `${((PAD.l + (hover + 0.5) * step) / W) * 100}%` }}>
          <b>{h.transactions}</b> transactions<span>{when(h.at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} – {when(h.at + bin, bin >= 86400 ? { month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      )}
    </div>
  );
}
// A bar with a 4px rounded data end, square at the baseline.
function bar(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
