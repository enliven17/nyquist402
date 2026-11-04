"use client";

import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import * as wallet from "@/lib/wallet";

const TX_URL = "https://stellar.expert/explorer/testnet/tx/";
const UNIT = 10_000_000;

type Status = {
  addresses: { agent: string; merchant: string; escrow: string; token: string };
  balances: { agent: string; merchant: string; escrow: string };
  state?: { collected: boolean; capturable: string; refundable: string };
};
type Step = {
  ok: boolean;
  tx?: string;
  amount?: string;
  paymentHash?: string;
  captureDeadline?: number;
  xdr?: string;
  error?: string;
};
type LogEntry = { label: string; step: Step };
type Mode = "wallet" | "server";

const fmt = (base: string | undefined) => (base === undefined ? "–" : (Number(base) / UNIT).toFixed(2));
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

async function api(body: Record<string, unknown>): Promise<Step & Record<string, unknown>> {
  const res = await fetch("/api/demo", { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);

export default function Demo() {
  const [mode, setMode] = useState<Mode>("wallet");
  const [address, setAddress] = useState<string>();
  const [status, setStatus] = useState<Status>();
  const [hash, setHash] = useState<string>();
  const [deadline, setDeadline] = useState<number>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<string>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string>();

  const payer = mode === "wallet" ? address : undefined;

  const refresh = useCallback(
    async (paymentHash = hash) => {
      const q = new URLSearchParams();
      if (paymentHash) q.set("paymentHash", paymentHash);
      if (payer) q.set("payer", payer);
      const res = await fetch(`/api/demo?${q}`);
      const body = await res.json();
      if (!res.ok) return setError(body.error);
      setStatus(body);
    },
    [hash, payer],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setHash(undefined);
    setDeadline(undefined);
    setLog([]);
    setError(undefined);
  }

  async function run(label: string, work: () => Promise<Step>) {
    setBusy(label);
    setError(undefined);
    try {
      const step = await work();
      setLog(l => [{ label, step }, ...l]);
      if (step.paymentHash) setHash(step.paymentHash);
      if (step.captureDeadline) setDeadline(step.captureDeadline);
      await refresh(step.paymentHash ?? hash);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }

  /** Runs a server step that may return a transaction for the wallet to sign. */
  async function signed(body: Record<string, unknown>): Promise<Step> {
    const step = await api(body);
    if (!step.ok || !step.xdr) return step;
    const signedXdr = await wallet.signTransaction(step.xdr, address!);
    return api({ action: "submit", xdr: signedXdr });
  }

  async function connect() {
    setError(undefined);
    try {
      setAddress(await wallet.connect());
    } catch (e) {
      setError(errorText(e));
    }
  }

  const walletPay = async (): Promise<Step> => {
    const { quoteId, paymentRequired } = (await api({ action: "quote" })) as never;
    const payload = await wallet.createPayment(address!, paymentRequired);
    return api({ action: "pay", quoteId, payload });
  };

  const state = status?.state;
  const capturable = Number(state?.capturable ?? 0);
  const refundable = Number(state?.refundable ?? 0);
  const payerBalance = Number(status?.balances.agent ?? 0);
  const remaining = deadline ? deadline - now : undefined;
  const canPay = mode === "server" || (!!address && payerBalance >= UNIT);
  const disabled = !!busy;

  return (
    <main>
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none" }}><Logo size={24} /></a>
        <span className="badge" style={{ margin: 0 }}>Stellar testnet</span>
      </nav>

      <section>
        <h1>Live demo</h1>
        <p className="lead">
          Pay for a metered inference API with x402 <code>auth-capture</code>. You authorize 1.00 DEMOUSD into
          escrow. The merchant captures what the work cost, releases the rest, and can refund later. If the merchant
          does nothing, you reclaim the hold yourself. Every step is a real testnet transaction.
        </p>
        <div className="actions">
          <button className={`btn ${mode === "wallet" ? "btn-primary" : ""}`} onClick={() => switchMode("wallet")}>
            Use my wallet
          </button>
          <button className={`btn ${mode === "server" ? "btn-primary" : ""}`} onClick={() => switchMode("server")}>
            Try without a wallet
          </button>
        </div>
      </section>

      {mode === "wallet" && (
        <section>
          <h2>1. Your wallet</h2>
          {!address ? (
            <>
              <p className="muted">Freighter, xBull or Hana, set to Testnet. Paying needs no XLM.</p>
              <div className="actions" style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={connect}>Connect wallet</button>
              </div>
            </>
          ) : (
            <>
              <p>
                Connected <code>{short(address)}</code>{" "}
                <button
                  className="btn"
                  style={{ padding: "2px 10px", marginLeft: 8 }}
                  onClick={async () => {
                    await wallet.disconnect().catch(() => {});
                    setAddress(undefined);
                    switchMode("wallet");
                  }}
                >
                  Disconnect
                </button>
              </p>
              <div className="actions" style={{ marginTop: 16 }}>
                <button
                  className="btn"
                  disabled={disabled || payerBalance >= 10 * UNIT}
                  onClick={() => run("Get 10 DEMOUSD", () => signed({ action: "faucet", address }))}
                >
                  Get 10 test DEMOUSD
                </button>
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                New accounts are funded with testnet XLM. The first claim asks you to sign a trustline.
              </p>
            </>
          )}
        </section>
      )}

      <section>
        <h2>Balances</h2>
        <div className="grid">
          {([["agent", mode === "wallet" ? "You" : "Agent"], ["merchant", "Merchant"], ["escrow", "Escrow"]] as const).map(
            ([k, label]) => (
              <div className="card" key={k}>
                <h3>{label}</h3>
                <p style={{ fontSize: "1.5rem", color: "var(--text)" }}>{fmt(status?.balances[k])}</p>
              </div>
            ),
          )}
        </div>
        {state && (
          <p className="muted" style={{ marginTop: 16 }}>
            Payment: capturable {fmt(state.capturable)} · refundable {fmt(state.refundable)}
            {remaining !== undefined && capturable > 0 &&
              (remaining > 0 ? ` · capture window closes in ${remaining}s` : " · capture window closed")}
          </p>
        )}
      </section>

      <section>
        <h2>{mode === "wallet" ? "2. Pay" : "Agent"}</h2>
        <div className="actions" style={{ marginTop: 0 }}>
          <button
            className="btn btn-primary"
            disabled={disabled || !canPay}
            onClick={() =>
              run("Authorize 1.00", mode === "wallet" ? walletPay : () => api({ action: "authorize" }))
            }
          >
            {mode === "wallet" ? "Pay: authorize 1.00 (sign in wallet)" : "Agent pays (authorize 1.00)"}
          </button>
          {mode === "wallet" && (
            <button
              className="btn"
              disabled={disabled || capturable === 0 || remaining === undefined || remaining > 0}
              onClick={() => run("Reclaim hold", () => signed({ action: "reclaim", address, paymentHash: hash }))}
            >
              Reclaim hold (after window)
            </button>
          )}
        </div>
      </section>

      <section>
        <h2>{mode === "wallet" ? "3. Merchant" : "Merchant"}</h2>
        <div className="actions" style={{ marginTop: 0 }}>
          <button
            className="btn"
            disabled={disabled || capturable === 0}
            onClick={() =>
              run("Capture 0.60, release rest", () =>
                api({ action: "capture", paymentHash: hash, amount: "6000000", voidRemainder: true }),
              )
            }
          >
            Capture 0.60, release rest
          </button>
          <button
            className="btn"
            disabled={disabled || capturable === 0}
            onClick={() => run("Void hold", () => api({ action: "void", paymentHash: hash }))}
          >
            Void instead
          </button>
          <button
            className="btn"
            disabled={disabled || refundable < 2_000_000}
            onClick={() => run("Refund 0.20", () => api({ action: "refund", paymentHash: hash, amount: "2000000" }))}
          >
            Refund 0.20
          </button>
        </div>
        {busy && <p className="muted" style={{ marginTop: 16 }}>{busy}: submitting to testnet…</p>}
        {error && <p style={{ marginTop: 16, color: "#c62828" }}>{error}</p>}
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
                  ) : entry.step.ok ? (
                    <span className="muted">done</span>
                  ) : (
                    <span style={{ color: "#c62828" }}>{entry.step.error}</span>
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
