import { useEffect, useState } from "react";
import * as wallet from "@/lib/wallet";
import { Toast } from "@/components/Toast";
import { ProtectedEscrowClient } from "@/lib/protected/client";
import { assertHash, hashText, selectedArbiter } from "@/lib/protected/codec";
import { formatAmount, parseAmount, parsePercentBps, validateQuote, type Quote } from "@/lib/protected/flow";
import { historyKey, readHistory } from "@/lib/protected/history";
import type { DemoConfig, HistoryRecord, Prepared, ProtectedAction, Snapshot } from "@/lib/protected/types";
import { ClaimPanel } from "./ClaimPanel";
import "../demo.css";
import "./protected.css";

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/protected", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error ?? "Protected request failed");
  return result;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const AGREEMENT = "Demonstration API delivery: each claim must describe its result and agreed cost. Buyer reviews each result; either party may dispute before review closes. No real inference service is included.";
export default function ProtectedDemo() {
  const [config, setConfig] = useState<DemoConfig>();
  const [address, setAddress] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [now, setNow] = useState(0);
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [paymentId, setPaymentId] = useState("");
  const [importId, setImportId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [offset, setOffset] = useState(0);
  const [offer, setOffer] = useState<Quote>();
  const [agreement, setAgreement] = useState(AGREEMENT);
  const [preferred, setPreferred] = useState("");
  const [fallback, setFallback] = useState("50");
  const [claimAmount, setClaimAmount] = useState("3.00");
  const [delivery, setDelivery] = useState("");
  const [log, setLog] = useState<{ label: string; tx?: string; error?: string }[]>([]);
  const [reload, setReload] = useState(0);
  const key = config && address ? historyKey(config.networkPassphrase, config.contractId, address) : undefined;
  const current = records.find(r => r.paymentId === paymentId);
  const buyer = !!address && address === snapshot?.terms.payer;
  const sellerControl = !!address && (!!current?.capability || address === snapshot?.terms.seller);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/protected", { signal: controller.signal }).then(r => r.json()).then(body => {
      if (!body.ok) throw new Error(body.error); setConfig(body.config);
    }).catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setOffer(undefined); setSnapshot(undefined); setOffset(0);
    let saved: HistoryRecord[] = [];
    if (key) { try { saved = readHistory(localStorage.getItem(key)); } catch { /* storage disabled */ } }
    setRecords(saved); setPaymentId(saved[0]?.paymentId ?? "");
  }, [key]);
  useEffect(() => { setSnapshot(undefined); setOffset(0); }, [paymentId]);
  useEffect(() => {
    if (!paymentId) return;
    let active = true;
    const controller = new AbortController();
    async function read() {
      try {
        const result = await fetch(`/api/protected?paymentId=${paymentId}&offset=${offset}`, { signal: controller.signal }).then(r => r.json());
        if (!result.ok) throw new Error(result.error);
        if (active) setSnapshot(result);
      } catch (e) { if (active && !controller.signal.aborted) setError(message(e)); }
    }
    void read(); const timer = setInterval(() => void read(), 5000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [paymentId, offset, reload]);
  function remember(record: HistoryRecord) {
    const next = [record, ...records.filter(r => r.paymentId !== record.paymentId)].slice(0, 100);
    setRecords(next);
    if (key) { try { localStorage.setItem(key, JSON.stringify(next)); } catch { setError("Browser storage unavailable. Save the payment ID and agreement for recovery."); } }
  }
  async function work(label: string, action: () => Promise<{ tx?: string } | void>) {
    setBusy(label); setError(undefined);
    try {
      const result = await action(); setLog(items => [{ label, tx: result?.tx }, ...items]);
      setReload(n => n + 1);
    } catch (e) { setError(message(e)); setLog(items => [{ label, error: message(e) }, ...items]); }
    finally { setBusy(undefined); }
  }
  async function transact(action: ProtectedAction, capability = current?.capability) {
    if (!config || !address) throw new Error("Connect a testnet wallet first");
    const { prepared } = await post({ operation: "prepare", source: address, action, capability }) as { prepared: Prepared };
    const client = new ProtectedEscrowClient(config);
    return client.submit(prepared, await wallet.signTransaction(prepared.xdr, address));
  }
  async function quote() {
    if (!config || !address || !agreement.trim()) throw new Error("Connect a wallet and enter the agreement");
    const input = { payer: address, agreementHash: await hashText(agreement), buyerArbiter: preferred.trim() || null, fallbackSellerBps: parsePercentBps(fallback) };
    const quoted = await post({ operation: "quote", ...input }) as Quote;
    await validateQuote(quoted, config, input, Math.floor(Date.now() / 1000)); setOffer(quoted);
  }
  async function fund() {
    if (!offer || !config || !address) return;
    await validateQuote(offer, config, { payer: address, agreementHash: await hashText(agreement), buyerArbiter: preferred.trim() || null, fallbackSellerBps: parsePercentBps(fallback) }, Math.floor(Date.now() / 1000));
    // Retain the recovery ID even if the network accepts a transaction after polling times out.
    remember({ paymentId: offer.paymentId, agreement, capability: offer.capability });
    const result = await transact({ type: "authorize", terms: offer.terms }, offer.capability);
    setPaymentId(offer.paymentId); setOffer(undefined); return result;
  }
  const run = (label: string, action: ProtectedAction) => work(label, () => transact(action));
  const arbitrate = (claimId: number, sellerAmount: string, name: string) =>
    work(`${name} rules · claim ${claimId}`, () => post({ operation: "arbitrate", paymentId, claimId, sellerAmount }) as Promise<{ tx: string }>);
  const deadline = (time: number) => `${new Date(time * 1000).toLocaleTimeString()} · ${Math.max(0, time - now)}s left`;
  const disabled = !!busy || !config || !address;
  const p = config?.preset;
  const chosen = preferred || config?.defaultArbiter;
  const getTokens = () => work("Get DEMOUSD", async () => {
    const step = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "faucet", address }) }).then(r => r.json());
    if (!step.ok) throw new Error(step.error);
    if (!step.xdr) return step;
    const result = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", xdr: await wallet.signTransaction(step.xdr, address!) }) }).then(r => r.json());
    if (!result.ok) throw new Error(result.error); return result;
  });
  const buckets = snapshot ? ([
    ["available", "Unused", "pb-available"],
    ["reserved", "Reserved", "pb-reserved"],
    ["paid_to_seller", "Paid to seller", "pb-paid"],
    ["returned_to_buyer", "Returned", "pb-returned"],
  ] as const).map(([field, label, cls]) => ({ label, cls, value: BigInt(snapshot.state[field]) })) : [];
  const total = buckets.reduce((sum, b) => sum + b.value, 0n) || 1n;
  return <div className="demo protected-demo">
      <Toast message={error} onClose={() => setError(undefined)} /><main>

    <section className="d-head"><div><h1>Review the work.<br />Keep the budget protected.</h1><p>Every delivery is a claim the buyer reviews. Disputes go to the arbiter you choose.</p></div>
      <button className="pill-btn accent" disabled={!!busy} onClick={() => void work("Connect wallet", async () => { setAddress(await wallet.connect()); })}>{address ? `Connected · ${address.slice(0, 4)}…${address.slice(-4)}` : "Connect testnet wallet"}</button>
    </section>
    {busy && <p role="status" className="busy-bar"><span className="spin" aria-hidden /> {busy}…</p>}
    <div className="d-grid"><section>

      <div className="step-row" data-state={snapshot ? "done" : "active"}><span className="step-num">{snapshot ? "✓" : "01"}</span><div>
        <h2>Agree and fund</h2>
        {p && <ul className="chips" aria-label="Session presets">
          <li><b>{formatAmount(p.budget)}</b> budget</li><li><b>{p.review}s</b> review</li><li><b>{p.response}s</b> evidence</li><li><b>{p.custom}s</b> per arbiter</li><li><b>{Math.round(p.session / 60)} min</b> session</li>
        </ul>}

        <fieldset className="arbiter-pick"><legend>Arbiter <span className="free">free on testnet</span></legend>
          <div className="arbiter-cards">{(config?.arbiters ?? []).map(a => <label key={a.address} className={chosen === a.address ? "on" : undefined}>
            <input type="radio" name="arbiter" checked={chosen === a.address} onChange={() => { setPreferred(a.isDefault ? "" : a.address); setOffer(undefined); }} />
            <strong>{a.name}</strong><code>{a.address.slice(0, 4)}…{a.address.slice(-4)}</code>{a.isDefault && <em>backup for every case</em>}
          </label>)}</div>
        </fieldset>

        <div className="protected-form">
          <label className="split">Seller share if no arbiter rules <output>{fallback}%</output>
            <input type="range" min="0" max="100" step="5" value={fallback} onChange={e => { setFallback(e.target.value); setOffer(undefined); }} />
          </label>
          <details><summary>Service agreement</summary><textarea aria-label="Service agreement" value={agreement} maxLength={10000} onChange={e => { setAgreement(e.target.value); setOffer(undefined); }} /></details>
        </div>

        <div className="acts">
          <button className="pill-btn" disabled={disabled} onClick={() => void getTokens()}>Get 10 DEMOUSD</button>
          <button className="pill-btn accent" disabled={disabled || !agreement.trim()} onClick={() => void work("Review terms", quote)}>Review terms</button>
        </div>

        {offer && <div className="protected-offer"><h3>Before you sign</h3><dl className="protected-details">
          <div><dt>Budget</dt><dd>{formatAmount(offer.terms.max_amount)} DEMOUSD</dd></div>
          <div><dt>Arbiter</dt><dd>{config?.arbiters.find(a => a.address === selectedArbiter(offer.terms))?.name ?? <code>{selectedArbiter(offer.terms)}</code>} · free</dd></div>
          <div><dt>Funding closes</dt><dd>{deadline(offer.terms.fund_by)}</dd></div>
          <div><dt>Session closes</dt><dd>{deadline(offer.terms.delivery_deadline)}</dd></div>
          <div><dt>Timeout split</dt><dd>Seller {offer.terms.fallback_seller_bps / 100}% · buyer {100 - offer.terms.fallback_seller_bps / 100}%</dd></div>
        </dl><details><summary>Full signed terms</summary><pre>{JSON.stringify(offer.terms, null, 2)}</pre></details>
          <button className="pill-btn accent" disabled={disabled || now >= offer.terms.fund_by} onClick={() => void work("Fund protected payment", fund)}>Sign and fund {formatAmount(offer.terms.max_amount)}</button></div>}
      </div></div>

      <div className="step-row" data-state={snapshot ? (snapshot.claims.length ? "done" : "active") : "locked"}><span className="step-num">02</span><div>
        <h2>Record a delivery</h2><p>The seller reserves what the delivery cost. It stays in escrow until the buyer accepts or a case ends.</p>
        {snapshot && <div className="protected-form">
          <div className="row2">
            <label>Amount<input inputMode="decimal" value={claimAmount} onChange={e => setClaimAmount(e.target.value)} /></label>
            <label>Delivery<input value={delivery} maxLength={10000} onChange={e => setDelivery(e.target.value)} placeholder="What was delivered" /></label>
          </div>
          <div className="acts"><button className="pill-btn" disabled={disabled || !sellerControl || !delivery.trim() || now >= snapshot.terms.delivery_deadline || BigInt(snapshot.state.available) === 0n} onClick={() => void work("Record claim", async () => transact({ type: "claim", paymentId, amount: parseAmount(claimAmount), delivery: await hashText(delivery) }))}>Seller records claim</button></div>
        </div>}
      </div></div>

      {snapshot && <div className="protected-claims"><h2>Claims</h2>{snapshot.claims.length === 0 && <p className="muted">No claims yet.</p>}{snapshot.claims.map(item => <ClaimPanel key={`${paymentId}:${item.id}`} {...item} terms={snapshot.terms} paymentId={paymentId} address={address} sellerControl={sellerControl} now={now} busy={!!busy} run={run} arbiters={config?.arbiters ?? []} arbitrate={arbitrate} />)}
        {(offset > 0 || snapshot.nextOffset !== null) && <div className="acts"><button className="pill-btn sm" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 20))}>Previous</button><button className="pill-btn sm" disabled={snapshot.nextOffset === null} onClick={() => setOffset(snapshot.nextOffset ?? offset)}>Next</button></div>}
      </div>}
    </section>

    <aside className="d-side" aria-label="Protected ledger">
      <div className="pstate"><span className="d-cap">This payment</span>{snapshot ? <>
        <div className="pbar" role="img" aria-label={buckets.map(b => `${b.label} ${formatAmount(b.value.toString())}`).join(", ")}>
          {buckets.map(b => <i key={b.cls} className={b.cls} style={{ width: `${Number((b.value * 1000n) / total) / 10}%` }} />)}
        </div>
        <ul className="plegend">{buckets.map(b => <li key={b.cls}><i className={b.cls} />{b.label}<span>{formatAmount(b.value.toString())}</span></li>)}</ul>
        <div className="kv"><span>Session ends</span><span>{Math.max(0, snapshot.terms.delivery_deadline - now)}s</span></div>
        <div className="acts">
          <button className="pill-btn sm" disabled={disabled || !buyer || now < snapshot.terms.delivery_deadline || BigInt(snapshot.state.available) === 0n} onClick={() => void run("Reclaim unused funds", { type: "reclaim", paymentId })}>Reclaim unused</button>
          <button className="pill-btn sm" disabled={disabled || !sellerControl || BigInt(snapshot.state.available) === 0n} onClick={() => void run("Seller returns unused funds", { type: "void_unclaimed", paymentId })}>Seller returns unused</button>
        </div>
        <details><summary>Payment details</summary><dl className="protected-details">
          <div><dt>Buyer</dt><dd><code>{snapshot.terms.payer}</code></dd></div><div><dt>Seller</dt><dd><code>{snapshot.terms.seller}</code></dd></div>
          <div><dt>Payment ID</dt><dd><code>{paymentId}</code></dd></div><div><dt>Agreement</dt><dd><code>{snapshot.terms.agreement}</code></dd></div>
        </dl></details>
      </> : <p className="muted" style={{ marginTop: 8 }}>Fund a payment to see its balances.</p>}</div>

      <details className="recover"><summary>Recover a payment</summary><div className="protected-form">
        {records.length > 0 && <label>Saved<select value={paymentId} onChange={e => setPaymentId(e.target.value)}><option value="">Choose a payment</option>{records.map(r => <option key={r.paymentId} value={r.paymentId}>{r.paymentId.slice(0, 12)}…</option>)}</select></label>}
        <label>Payment ID<input value={importId} onChange={e => setImportId(e.target.value)} placeholder="64 hex characters" /></label>
        <button className="pill-btn sm" disabled={!!busy || !config || !importId} onClick={() => void work("Recover payment", async () => { assertHash(importId); setPaymentId(importId); const record = records.find(r => r.paymentId === importId); if (!record) remember({ paymentId: importId, agreement: "Imported payment; obtain the original agreement from the parties." }); })}>Read from contract</button>
      </div></details>

      <div className="log"><span className="d-cap">Activity</span><ol>{log.length === 0 && <li className="muted">Transactions appear here.</li>}{log.map((entry, index) => <li key={index}><span>{entry.label}</span>{entry.tx ? <a href={`https://stellar.expert/explorer/testnet/tx/${entry.tx}`} target="_blank" rel="noreferrer">{entry.tx.slice(0, 10)}… ↗</a> : <span className={entry.error ? "bad" : "muted"}>{entry.error ? "failed" : "done"}</span>}</li>)}</ol></div>
      <p className="d-foot">Testnet only. Seller and arbiters are operated by this demo so you can play every role.</p>
    </aside></div>
  </main></div>;
}
