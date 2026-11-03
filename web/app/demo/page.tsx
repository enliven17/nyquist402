"use client";

import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

const TX_URL = "https://stellar.expert/explorer/testnet/tx/";
const UNIT = 10_000_000;

type Status = {
  addresses: { agent: string; merchant: string; escrow: string; token: string };
  balances: { agent: string; merchant: string; escrow: string };
  state?: { collected: boolean; capturable: string; refundable: string };
};
type Step = { ok: boolean; tx?: string; amount?: string; paymentHash?: string; error?: string };
type LogEntry = { label: string; step: Step };

const fmt = (base: string | undefined) => (base === undefined ? "–" : (Number(base) / UNIT).toFixed(2));

export default function Demo() {
  const [status, setStatus] = useState<Status>();
  const [hash, setHash] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (paymentHash?: string) => {
    const res = await fetch(`/api/demo${paymentHash ? `?paymentHash=${paymentHash}` : ""}`);
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setStatus(body);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(label: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/demo", { method: "POST", body: JSON.stringify({ paymentHash: hash, ...body }) });
      const step: Step = await res.json();
      setLog(l => [{ label, step }, ...l]);
      const next = step.paymentHash ?? hash;
      if (step.paymentHash) setHash(step.paymentHash);
      await refresh(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const state = status?.state;
  const capturable = Number(state?.capturable ?? 0);
  const refundable = Number(state?.refundable ?? 0);

  return (
    <main>
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none" }}><Logo size={24} /></a>
        <span className="badge" style={{ margin: 0 }}>Stellar testnet</span>
      </nav>

      <section>
        <h1>Live demo</h1>
        <p className="lead">
          An agent pays for a metered inference API with x402 <code>auth-capture</code>. It authorizes 1.00 DEMOUSD.
          The server captures what the work cost, releases the rest, and can refund later. Every step is a real
          testnet transaction.
        </p>
      </section>

      <section>
        <h2>Balances</h2>
        <div className="grid">
          {(["agent", "merchant", "escrow"] as const).map(k => (
            <div className="card" key={k}>
              <h3 style={{ textTransform: "capitalize" }}>{k}</h3>
              <p style={{ fontSize: "1.5rem", color: "var(--text)" }}>{fmt(status?.balances[k])}</p>
            </div>
          ))}
        </div>
        {state && (
          <p className="muted" style={{ marginTop: 16 }}>
            Payment: capturable {fmt(state.capturable)} · refundable {fmt(state.refundable)}
          </p>
        )}
      </section>

      <section>
        <h2>Steps</h2>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => run("Authorize 1.00", { action: "authorize" })}>
            1. Agent pays (authorize 1.00)
          </button>
          <button
            className="btn"
            disabled={busy || capturable === 0}
            onClick={() => run("Capture 0.60, release rest", { action: "capture", amount: "6000000", voidRemainder: true })}
          >
            2. Capture 0.60, release rest
          </button>
          <button className="btn" disabled={busy || capturable === 0} onClick={() => run("Void hold", { action: "void" })}>
            Void instead
          </button>
          <button
            className="btn"
            disabled={busy || refundable < 2_000_000}
            onClick={() => run("Refund 0.20", { action: "refund", amount: "2000000" })}
          >
            3. Refund 0.20
          </button>
        </div>
        {busy && <p className="muted" style={{ marginTop: 16 }}>Submitting to testnet…</p>}
        {error && <p style={{ marginTop: 16, color: "#ff8a8a" }}>{error}</p>}
      </section>

      <section>
        <h2>Transactions</h2>
        {log.length === 0 && <p className="muted">No steps yet.</p>}
        <table>
          <tbody>
            {log.map((entry, i) => (
              <tr key={i}>
                <td>{entry.label}</td>
                <td>
                  {entry.step.ok && entry.step.tx ? (
                    <a href={TX_URL + entry.step.tx} target="_blank" rel="noreferrer">
                      <code>{entry.step.tx.slice(0, 12)}…</code>
                    </a>
                  ) : (
                    <span style={{ color: "#ff8a8a" }}>{entry.step.error}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer>
        Escrow <code>{status?.addresses.escrow}</code>
      </footer>
    </main>
  );
}
