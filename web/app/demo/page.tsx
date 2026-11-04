"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as wallet from "@/lib/wallet";
import { Toast } from "@/components/Toast";
import "./demo.css";

const TX_URL = "https://stellar.expert/explorer/testnet/tx/";
const UNIT = 10_000_000;
const HOLD = 10_000_000;

type Status = {
  addresses: { agent: string; merchant: string; escrow: string; token: string };
  balances: { agent: string; merchant: string; escrow: string };
  state?: { collected: boolean; capturable: string; refundable: string };
};
type Step = {
  ok: boolean;
  tx?: string;
  paymentHash?: string;
  captureDeadline?: number;
  xdr?: string;
  error?: string;
};
type LogEntry = { id: number; label: string; step: Step };
type Mode = "wallet" | "server";
type StepState = "locked" | "active" | "done";

const fmt = (base: string | number | undefined) => (base === undefined ? "–" : (Number(base) / UNIT).toFixed(2));
const short = (a: string) => `${a.slice(0, 5)}…${a.slice(-5)}`;

async function api(body: Record<string, unknown>): Promise<Step & Record<string, unknown>> {
  const res = await fetch("/api/demo", { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

/** Turns wallet and simulation errors into one readable line. */
function friendly(e: unknown): string {
  const raw =
    e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
  if (raw.includes("trustline entry is missing")) return "Your wallet has no DEMOUSD yet. Run step 02 first.";
  if (/declined|rejected|denied|cancel/i.test(raw)) return "Request rejected in the wallet.";
  if (raw.includes("not been installed") || raw.includes("not available")) return "Wallet extension not found.";
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

function Row(props: {
  n: string;
  state: StepState;
  title: string;
  who?: string;
  children?: React.ReactNode;
  body: React.ReactNode;
}) {
  return (
    <div className="step-row" data-state={props.state}>
      <span className="step-num">{props.state === "done" ? "✓" : props.n}</span>
      <div>
        <h2>
          {props.title}
          {props.who && <span className="d-cap who">{props.who}</span>}
        </h2>
        <p>{props.body}</p>
        {props.children && <div className="acts">{props.children}</div>}
      </div>
    </div>
  );
}

export default function Demo() {
  const [mode, setMode] = useState<Mode>("wallet");
  const [address, setAddress] = useState<string>();
  const [status, setStatus] = useState<Status>();
  const [hash, setHash] = useState<string>();
  const [window_, setWindow] = useState<{ start: number; end: number }>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<string>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string>();
  const seq = useRef(0);

  const payer = mode === "wallet" ? address : undefined;

  const refresh = useCallback(
    async (paymentHash = hash) => {
      const id = ++seq.current;
      const q = new URLSearchParams();
      if (paymentHash) q.set("paymentHash", paymentHash);
      if (payer) q.set("payer", payer);
      const res = await fetch(`/api/demo?${q}`);
      const body = await res.json();
      if (id !== seq.current) return; // a newer request superseded this one
      if (!res.ok) return setError(body.error);
      setStatus(body);
    },
    [hash, payer],
  );

  useEffect(() => {
    setStatus(undefined);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  function reset(next: Mode) {
    setMode(next);
    setHash(undefined);
    setWindow(undefined);
    setLog([]);
    setError(undefined);
  }

  async function run(label: string, work: () => Promise<Step>) {
    setBusy(label);
    setError(undefined);
    try {
      const step = await work();
      setLog(l => [{ id: Date.now(), label, step: step.ok ? step : { ...step, error: friendly(step.error) } }, ...l]);
      if (!step.ok) setError(friendly(step.error));
      if (step.paymentHash) setHash(step.paymentHash);
      if (step.captureDeadline) setWindow({ start: Math.floor(Date.now() / 1000), end: step.captureDeadline });
      await refresh(step.paymentHash ?? hash);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(undefined);
    }
  }

  /** Runs a server step that may hand back a transaction for the wallet to sign. */
  async function signed(body: Record<string, unknown>): Promise<Step> {
    const step = await api(body);
    if (!step.ok || !step.xdr) return step;
    return api({ action: "submit", xdr: await wallet.signTransaction(step.xdr, address!) });
  }

  async function connect() {
    setError(undefined);
    setBusy("Connect");
    try {
      setAddress(await wallet.connect());
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(undefined);
    }
  }

  async function disconnect() {
    await wallet.disconnect().catch(() => {});
    setAddress(undefined);
    reset("wallet");
  }

  const walletPay = async (): Promise<Step> => {
    const { quoteId, paymentRequired } = (await api({ action: "quote" })) as never;
    const payload = await wallet.createPayment(address!, paymentRequired);
    return api({ action: "pay", quoteId, payload });
  };

  // Balances count only once they belong to the payer shown.
  const own = !!status && (mode === "server" || status.addresses.agent === address);
  const payerBalance = own ? Number(status.balances.agent) : undefined;
  const state = status?.state;
  const capturable = Number(state?.capturable ?? 0);
  const refundable = Number(state?.refundable ?? 0);
  const remaining = window_ ? Math.max(0, window_.end - now) : undefined;
  const windowPct = window_ && remaining !== undefined ? (remaining / (window_.end - window_.start)) * 100 : 0;

  const connected = mode === "server" || !!address;
  const funded = mode === "server" || (payerBalance ?? 0) >= HOLD;
  const paid = !!hash;
  const open = capturable > 0 || refundable > 0;
  const stepState = (done: boolean, ready: boolean): StepState => (done ? "done" : ready ? "active" : "locked");
  const b = (label: string) => busy === label;
  const Spinner = ({ on }: { on: boolean }) => (on ? <span className="spin" aria-hidden /> : null);

  const n = (i: number) => String(mode === "wallet" ? i : i - 2).padStart(2, "0");

  return (
    <div className="demo">
      <Toast message={error} onClose={() => setError(undefined)} />
      <main>
        <section className="d-head">
          <div>
            <p className="d-cap" style={{ marginBottom: 14 }}>Live demo · x402 auth-capture</p>
            <h1>Pay for work before it is done.</h1>
            <p style={{ marginTop: 18 }}>
              Hold 1.00 in escrow. The merchant captures what the work cost.
            </p>
          </div>
          <div className="seg" role="group" aria-label="Payer">
            <button aria-pressed={mode === "wallet"} onClick={() => reset("wallet")}>My wallet</button>
            <button aria-pressed={mode === "server"} onClick={() => reset("server")}>Demo agent</button>
          </div>
        </section>

        <div className="d-grid">
          <section aria-label="Steps">
            {mode === "wallet" && (
              <>
                <Row
                  n="01"
                  state={stepState(!!address, true)}
                  title="Connect a wallet"
                  body={
                    address ? (
                      <>Connected as <span className="addr">{short(address)}</span></>
                    ) : (
                      "Freighter, xBull or Hana on Testnet."
                    )
                  }
                >
                  {!address ? (
                    <button className="pill-btn accent" disabled={!!busy} onClick={connect}>
                      <Spinner on={b("Connect")} />Connect wallet
                    </button>
                  ) : (
                    <button className="pill-btn sm" onClick={disconnect}>Disconnect</button>
                  )}
                </Row>
                <Row
                  n="02"
                  state={stepState(!!address && funded, !!address)}
                  title="Get test DEMOUSD"
                  body="First claim adds a trustline: one signature."
                >
                  <button
                    className="pill-btn"
                    disabled={!!busy || !address || payerBalance === undefined || payerBalance >= 10 * UNIT}
                    onClick={() => run("Get 10 DEMOUSD", () => signed({ action: "faucet", address }))}
                  >
                    <Spinner on={b("Get 10 DEMOUSD")} />Get 10 DEMOUSD
                  </button>
                </Row>
              </>
            )}

            <Row
              n={n(3)}
              state={stepState(paid, connected && funded)}
              title="Authorize 1.00"
              who={mode === "wallet" ? "you" : "agent"}
              body={
                mode === "wallet"
                  ? "One signature. No XLM needed."
                  : "The demo agent signs for you."
              }
            >
              <button
                className="pill-btn accent"
                disabled={!!busy || !connected || !funded}
                onClick={() => run("Authorize 1.00", mode === "wallet" ? walletPay : () => api({ action: "authorize" }))}
              >
                <Spinner on={b("Authorize 1.00")} />
                {paid ? "Authorize again" : mode === "wallet" ? "Sign and pay" : "Agent pays"}
              </button>
            </Row>

            <Row
              n={n(4)}
              state={stepState(paid && !open, paid && open)}
              title="Settle"
              who="merchant"
              body="Capture 0.60 and release the rest, or void."
            >
              <button
                className="pill-btn"
                disabled={!!busy || capturable === 0}
                onClick={() =>
                  run("Capture 0.60", () =>
                    api({ action: "capture", paymentHash: hash, amount: "6000000", voidRemainder: true }),
                  )
                }
              >
                <Spinner on={b("Capture 0.60")} />Capture 0.60
              </button>
              <button
                className="pill-btn"
                disabled={!!busy || capturable === 0}
                onClick={() => run("Void", () => api({ action: "void", paymentHash: hash }))}
              >
                <Spinner on={b("Void")} />Void
              </button>
              <button
                className="pill-btn"
                disabled={!!busy || refundable < 2_000_000}
                onClick={() => run("Refund 0.20", () => api({ action: "refund", paymentHash: hash, amount: "2000000" }))}
              >
                <Spinner on={b("Refund 0.20")} />Refund 0.20
              </button>
            </Row>

            {mode === "wallet" && (
              <Row
                n="05"
                state={stepState(false, paid && capturable > 0 && remaining === 0)}
                title="Reclaim"
                who="you"
                body="If the merchant does nothing, take the hold back after 3 minutes."
              >
                <button
                  className="pill-btn"
                  disabled={!!busy || capturable === 0 || remaining !== 0}
                  onClick={() => run("Reclaim", () => signed({ action: "reclaim", address, paymentHash: hash }))}
                >
                  <Spinner on={b("Reclaim")} />
                  {remaining ? `Reclaim in ${remaining}s` : "Reclaim hold"}
                </button>
              </Row>
            )}

          </section>

          <aside className="d-side" aria-label="Ledger">
            <div className="bal">
              {(
                [
                  ["agent", mode === "wallet" ? "You" : "Agent"],
                  ["merchant", "Merchant"],
                  ["escrow", "Escrow"],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className={k}>
                  <span className="d-cap">{label}</span>
                  <strong>{own ? fmt(status.balances[k]) : "–"}</strong>
                </div>
              ))}
            </div>

            <div className="pstate">
              <span className="d-cap">Payment</span>
              {state ? (
                <>
                  <div className="kv"><span>Held in escrow</span><span>{fmt(capturable)}</span></div>
                  <div className="bar"><i style={{ width: `${(capturable / HOLD) * 100}%` }} /></div>
                  <div className="kv"><span>Captured, refundable</span><span>{fmt(refundable)}</span></div>
                  <div className="bar"><i style={{ width: `${(refundable / HOLD) * 100}%` }} /></div>
                  {window_ && capturable > 0 && (
                    <>
                      <div className="kv">
                        <span>Capture window</span>
                        <span>{remaining ? `${remaining}s left` : "closed"}</span>
                      </div>
                      <div className="bar time"><i style={{ width: `${windowPct}%` }} /></div>
                    </>
                  )}
                </>
              ) : (
                <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>No payment yet.</p>
              )}
            </div>

            <div className="log">
              <span className="d-cap">Transactions</span>
              <ol>
                {log.length === 0 && <li className="muted">None yet.</li>}
                {log.map(entry => (
                  <li key={entry.id}>
                    <span>{entry.label}</span>
                    {entry.step.ok && entry.step.tx ? (
                      <a href={TX_URL + entry.step.tx} target="_blank" rel="noreferrer">
                        {entry.step.tx.slice(0, 10)}… ↗
                      </a>
                    ) : entry.step.ok ? (
                      <span className="muted">done</span>
                    ) : (
                      <span className="bad">{entry.step.error}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            <p className="d-foot">
              Escrow <code>{status?.addresses.escrow ?? "…"}</code>
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
