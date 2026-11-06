import { useEffect, useState } from "react";
import { Sk } from "@/components/Skeleton";
import { requestBackend } from "@/lib/backend";
import { serviceHealth } from "@/lib/status";
import type { StatusBar as Bar, StatusComponent as Component, StatusSummary as Summary } from "@/lib/status";
import "./status.css";

// Read the external monitor directly, so status remains available during site API failures.
const STATUS_URL = import.meta.env.VITE_STATUS_URL as string | undefined;

const RANGES = [7, 30, 90];
const ago = (at: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - at);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const level = (b: Bar) => (b.checks === 0 ? "none" : b.down === 0 ? "ok" : b.down <= 30 ? "warn" : "bad");
const dayLabel = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function load(days: number): Promise<Summary> {
  if (!STATUS_URL) throw new Error("Status backend is not configured");
  return serviceHealth(await requestBackend<Summary>(STATUS_URL, "query", "status:summary", { days }));
}

export default function StatusPage() {
  const [days, setDays] = useState(() => (window.matchMedia("(max-width: 760px)").matches ? 30 : 90));
  const [data, setData] = useState<Summary>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    const run = () => load(days).then(d => { if (live) { setData(d); setError(undefined); } }).catch(e => live && setError(String(e.message ?? e)));
    run();
    const timer = setInterval(run, 60_000);
    return () => { live = false; clearInterval(timer); };
  }, [days]);

  const down = data?.components.filter(c => c.ok === false) ?? [];
  const names = new Map(data?.components.map(c => [c.id, c.name]));
  return (
    <main className="sp">
      <header className="sp-head">
        <h1>Status</h1>
        <p>Checked from outside the site every 5 minutes.</p>
      </header>

      {error && !data && <p className="sp-error">{error}</p>}
      {!data && !error && <Loading />}
      {data && <>
        <div className={down.length ? "sp-banner bad" : "sp-banner ok"} role="status">
          <span className="sp-dot" aria-hidden />
          <div>
            <b>{down.length === 0 ? "All systems operational" : down.length === 1 ? `${down[0].name} is failing` : `${down.length} components are failing`}</b>
            <span>{data.checkedAt ? `Last checked ${ago(data.checkedAt)}` : "No checks yet"}{data.since ? ` · measured since ${new Date(data.since * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}</span>
          </div>
        </div>

        <div className="sp-bar-head">
          <h2>Components</h2>
          <div className="sp-range">
            {RANGES.map(r => <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}>{r} days</button>)}
          </div>
        </div>
        <ul className="sp-list">
          {data.components.map(c => <Row key={c.id} c={c} days={days} />)}
        </ul>
        <ul className="sp-legend" aria-label="Legend">
          <li><i className="ok" />No downtime</li><li><i className="warn" />Up to 30 min down</li><li><i className="bad" />Over 30 min down</li><li><i className="none" />Not measured</li>
        </ul>
        <p className="sp-muted">Each bar is one UTC day, oldest on the left. A failed check counts as {data.interval} minutes down.</p>

        <section className="sp-card">
          <h2>Recent failures</h2>
          {data.failures.length === 0 ? <p className="sp-muted">No recent service failures reported.</p> : (
            <div className="sp-table"><table>
              <thead><tr><th>Time</th><th>Component</th><th>Error</th></tr></thead>
              <tbody>{data.failures.map((f, i) => (
                <tr key={i}><td>{new Date(f.at * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{names.get(f.component) ?? f.component}</td><td><code>{f.error}</code></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
        <p className="sp-muted">Onchain totals are on the <a href="/stats">stats page</a>.</p>
      </>}
    </main>
  );
}

function Row({ c, days }: { c: Component; days: number }) {
  const [hover, setHover] = useState<number>();
  const h = hover === undefined ? undefined : c.bars[hover];
  const state = c.ok === null ? "Not measured" : c.ok ? "Operational" : "Failing";
  const timing = c.ms === null ? null : `${c.ms.toLocaleString("en-US")} ms`;
  return (
    <li className="sp-row">
      <div className="sp-row-top">
        <div><b>{c.name}</b><span className="sp-muted">{c.detail}</span></div>
        <div className="sp-now">
          <span className={`sp-state ${c.ok === null ? "none" : c.ok ? "ok" : "bad"}`}><i aria-hidden />{state}</span>
          {timing && <span className="sp-muted">{timing}</span>}
          <span className="sp-uptime">{c.uptime === null ? "—" : `${(c.uptime * 100).toFixed(c.uptime === 1 ? 0 : 2)}%`}</span>
        </div>
      </div>
      {c.ok === false && c.error && <p className="sp-err">{c.error}</p>}
      <div className="sp-bars" onMouseLeave={() => setHover(undefined)} aria-label={`${c.name}, last ${days} days`}>
        {c.bars.map((b, i) => (
          <span key={b.day} className={`${level(b)}${hover === i ? " on" : ""}`} tabIndex={0} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(undefined)}
            aria-label={`${dayLabel(b.day)}: ${b.checks ? `${b.down} minutes down` : "not measured"}`} />
        ))}
        {h && hover !== undefined && (
          <div className={`sp-tip${hover < c.bars.length * 0.15 ? " start" : hover > c.bars.length * 0.85 ? " end" : ""}`} style={{ left: `${((hover + (hover > c.bars.length * 0.85 ? 1 : hover < c.bars.length * 0.15 ? 0 : 0.5)) / c.bars.length) * 100}%` }}>
            <b>{dayLabel(h.day)}</b>
            <span>{h.checks === 0 ? "Not measured" : `${h.down === 0 ? "No downtime" : `${h.down} min down`} · ${h.checks} checks`}</span>
          </div>
        )}
      </div>
      <div className="sp-axis"><span>{days} days ago</span><span>Today</span></div>
    </li>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading status">
      <Sk h={72} style={{ margin: "36px 0 40px" }} />
      <ul className="sp-list">
        {Array.from({ length: 7 }, (_, i) => (
          <li className="sp-row" key={i}><Sk w="40%" h={14} style={{ marginBottom: 10 }} /><Sk w="60%" h={11} style={{ marginBottom: 16 }} /><Sk h={30} /></li>
        ))}
      </ul>
    </div>
  );
}
