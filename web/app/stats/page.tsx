import { useEffect, useState } from "react";
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
          <h2>Transactions over time</h2>
          <Activity points={data.activity.points} bin={data.activity.bin} />
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
          <div className="st-table">
            <table>
              <thead><tr><th>Event</th><th>Payment</th><th className="num">USDC</th><th>Time</th><th>Transaction</th></tr></thead>
              <tbody>
                {data.recent.map(e => (
                  <tr key={e.tx + e.kind}>
                    <td>{EVENTS[e.kind] ?? e.kind}</td>
                    <td><code>{short(e.paymentId)}</code></td>
                    <td className="num">{e.amount === null ? "—" : usdc(e.amount)}</td>
                    <td>{ago(e.at)}</td>
                    <td><a href={`${EXPERT}/tx/${e.tx}`} target="_blank" rel="noreferrer"><code>{short(e.tx)}</code> ↗</a></td>
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

const W = 960, H = 220, PAD = { l: 36, r: 8, t: 12, b: 26 };
function Activity({ points, bin }: { points: { at: number; transactions: number }[]; bin: number }) {
  const [hover, setHover] = useState<number>();
  if (!points.length) return <p className="st-muted">No transactions yet.</p>;
  const max = Math.max(1, ...points.map(p => p.transactions));
  const top = Math.ceil(max / 5) * 5 || 5;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const step = iw / points.length, bw = Math.max(2, step - 2);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const label = (at: number) => new Date(at * 1000).toLocaleString("en-US", bin >= 86400 ? { month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit" });
  const every = Math.ceil(points.length / 8);
  const h = hover === undefined ? undefined : points[hover];
  return (
    <div className="st-chart">
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
          <b>{h.transactions}</b> transactions<span>{label(h.at)} – {label(h.at + bin)}</span>
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
