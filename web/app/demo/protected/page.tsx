"use client";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import * as wallet from "@/lib/wallet";
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
  const deadline = (time: number) => `${new Date(time * 1000).toLocaleTimeString()} · ${Math.max(0, time - now)}s left`;
  const disabled = !!busy || !config || !address;
  return <div className="demo protected-demo"><main>
    <header className="d-top"><a href="/" aria-label="Nyquist402 home"><Logo size={24} /></a><nav><span className="mono"><span className="dot" />Stellar testnet</span><a href="/demo">Basic demo</a><a href="/docs">Docs</a></nav></header>
    <section className="d-head"><div><p className="d-cap">Protected settlement · local SDK v1</p><h1>Review the work.<br />Keep the budget protected.</h1><p>Each delivery gets its own reserved claim. Either party can dispute. After the session ends, the buyer can reclaim unused funds while reserved claims stay in escrow.</p></div>
      <button className="pill-btn accent" disabled={!!busy} onClick={() => void work("Connect wallet", async () => { setAddress(await wallet.connect()); })}>{address ? `Switch wallet · ${address.slice(0, 6)}…` : "Connect testnet wallet"}</button>
    </section>
    {error && <p className="note err protected-error" role="alert">{error}</p>}
    <p className="protected-notice">Testnet demonstration. You pay network fees in test XLM. Arbitration fees are zero. Seller controls below are a payment-scoped demo delegation; rulings require the actual arbiter wallet.</p>
    {busy && <p role="status" className="note"><span className="spin" aria-hidden /> {busy} — waiting for wallet or network confirmation.</p>}
    <div className="d-grid"><section>
      <div className="step-row"><span className="step-num">01</span><div><h2>Agree and fund</h2><p>Authorize 10.00 DEMOUSD. Review closes 120s after each claim; disputes allow at least 60s for evidence, then 90s per arbiter stage. The session lasts six minutes.</p>
        <div className="protected-form">
          <label>Service agreement<textarea value={agreement} maxLength={10000} onChange={e => { setAgreement(e.target.value); setOffer(undefined); }} /></label>
          <label>Your preferred arbiter (optional)<input value={preferred} onChange={e => { setPreferred(e.target.value); setOffer(undefined); }} placeholder="G… or C…; blank uses project default" /></label>
          <label>Seller share if both arbiters time out (%)<input type="number" min="0" max="100" step="0.01" value={fallback} onChange={e => { setFallback(e.target.value); setOffer(undefined); }} /></label>
          <p className="muted">50% is an editable example, not a production policy. If no arbiter rules, this signed split applies to the disputed claim. Neither party can change it after funding.</p>
          <p className="muted">Seller preference: <code>{config?.sellerArbiter ?? "None"}</code>. Matching preferences select that arbiter; otherwise the project default handles the case.</p>
          <div className="acts">
            <button className="pill-btn" disabled={disabled} onClick={() => void work("Get DEMOUSD", async () => {
              const step = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "faucet", address }) }).then(r => r.json());
              if (!step.ok) throw new Error(step.error);
              if (!step.xdr) return step;
              const result = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", xdr: await wallet.signTransaction(step.xdr, address!) }) }).then(r => r.json());
              if (!result.ok) throw new Error(result.error); return result;
            })}>Get 10 DEMOUSD</button>
            <button className="pill-btn accent" disabled={disabled || !agreement.trim()} onClick={() => void work("Review terms", quote)}>Review terms</button>
          </div>
          {offer && <div className="protected-offer"><h3>Before you sign</h3><dl className="protected-details">
            <div><dt>Budget</dt><dd>{formatAmount(offer.terms.max_amount)} DEMOUSD</dd></div>
            <div><dt>Chosen arbiter</dt><dd><code>{selectedArbiter(offer.terms)}</code></dd></div>
            <div><dt>Project default</dt><dd><code>{offer.terms.default_arbiter}</code></dd></div>
            <div><dt>Funding closes</dt><dd>{deadline(offer.terms.fund_by)}</dd></div>
            <div><dt>Session closes</dt><dd>{deadline(offer.terms.delivery_deadline)}</dd></div>
            <div><dt>Timeout split</dt><dd>Seller {offer.terms.fallback_seller_bps / 100}%; buyer {100 - offer.terms.fallback_seller_bps / 100}%</dd></div>
          </dl><details><summary>Full signed terms</summary><pre>{JSON.stringify(offer.terms, null, 2)}</pre></details><button className="pill-btn accent" disabled={disabled || now >= offer.terms.fund_by} onClick={() => void work("Fund protected payment", fund)}>Sign and fund 10.00</button></div>}
        </div>
      </div></div>
      <div className="step-row"><span className="step-num">02</span><div><h2>Open or recover a payment</h2><p>The contract holds the authoritative state. Local history retains IDs and agreements; importing an ID grants no signing authority.</p><div className="protected-form">
        <label>Saved payments<select value={paymentId} onChange={e => setPaymentId(e.target.value)}><option value="">Choose a payment</option>{records.map(r => <option key={r.paymentId} value={r.paymentId}>{r.paymentId}</option>)}</select></label>
        <label>Payment ID<input value={importId} onChange={e => setImportId(e.target.value)} placeholder="64 lowercase hex characters" /></label>
        <button className="pill-btn" disabled={!!busy || !config || !importId} onClick={() => void work("Recover payment", async () => { assertHash(importId); setPaymentId(importId); const record = records.find(r => r.paymentId === importId); if (!record) remember({ paymentId: importId, agreement: "Imported payment; obtain the original agreement from the parties." }); })}>Read from contract</button>
      </div></div></div>
      {snapshot && <>
        <div className="step-row"><span className="step-num">03</span><div><h2>Record a delivery claim</h2><p>The seller reserves the stated cost. It stays in escrow until acceptance, review expiry, a ruling, or the agreed fallback.</p><div className="protected-form">
          <label>Claim amount (DEMOUSD)<input inputMode="decimal" value={claimAmount} onChange={e => setClaimAmount(e.target.value)} /></label>
          <label>Delivery description<textarea value={delivery} maxLength={10000} onChange={e => setDelivery(e.target.value)} placeholder="Describe the delivered result; save it for review." /></label>
          <button className="pill-btn" disabled={disabled || !sellerControl || !delivery.trim() || now >= snapshot.terms.delivery_deadline || BigInt(snapshot.state.available) === 0n} onClick={() => void work("Record claim", async () => transact({ type: "claim", paymentId, amount: parseAmount(claimAmount), delivery: await hashText(delivery) }))}>Seller records claim</button>
        </div></div></div>
        <div className="protected-claims"><h2>Claims and disputes</h2>{snapshot.claims.length === 0 && <p>No claims recorded.</p>}{snapshot.claims.map(item => <ClaimPanel key={`${paymentId}:${item.id}`} {...item} terms={snapshot.terms} paymentId={paymentId} address={address} sellerControl={sellerControl} now={now} busy={!!busy} run={run} />)}
          <div className="acts"><button className="pill-btn sm" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 20))}>Previous claims</button><button className="pill-btn sm" disabled={snapshot.nextOffset === null} onClick={() => setOffset(snapshot.nextOffset ?? offset)}>Next claims</button></div>
        </div>
      </>}
    </section><aside className="d-side" aria-label="Protected ledger"><div className="pstate"><span className="d-cap">This payment · DEMOUSD</span>{snapshot ? <>
      <dl className="protected-details">{([["available", "Unused"], ["reserved", "Reserved in claims"], ["paid_to_seller", "Paid to seller"], ["returned_to_buyer", "Returned to buyer"]] as const).map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{formatAmount(snapshot.state[field])}</dd></div>)}
        <div><dt>Session ends</dt><dd>{deadline(snapshot.terms.delivery_deadline)}</dd></div>
        <div><dt>Buyer</dt><dd><code>{snapshot.terms.payer}</code></dd></div><div><dt>Seller</dt><dd><code>{snapshot.terms.seller}</code></dd></div>
        <div><dt>Agreement hash</dt><dd><code>{snapshot.terms.agreement}</code></dd></div>
      </dl><div className="acts"><button className="pill-btn" disabled={disabled || !buyer || now < snapshot.terms.delivery_deadline || BigInt(snapshot.state.available) === 0n} onClick={() => void run("Reclaim unused funds", { type: "reclaim", paymentId })}>Reclaim unused funds</button>
      <button className="pill-btn" disabled={disabled || !sellerControl || BigInt(snapshot.state.available) === 0n} onClick={() => void run("Seller returns unused funds", { type: "void_unclaimed", paymentId })}>Seller returns unused funds</button></div>
      <p className="muted">Reserved claims remain locked when unused funds are returned.</p>
      {current?.agreement && <details><summary>Saved agreement</summary><p>{current.agreement}</p></details>}
    </> : <p className="muted">Fund a payment or import its ID. A saved ID is not proof that funding succeeded.</p>}</div>
      <div className="log"><span className="d-cap">Activity</span><ol>{log.length === 0 && <li className="muted">Confirmed transactions appear here.</li>}{log.map((entry, index) => <li key={index}><span>{entry.label}</span>{entry.tx ? <a href={`https://stellar.expert/explorer/testnet/tx/${entry.tx}`} target="_blank" rel="noreferrer">{entry.tx.slice(0, 10)}… ↗</a> : <span className={entry.error ? "bad" : "muted"}>{entry.error ?? "Ready"}</span>}</li>)}</ol></div>
      <p className="d-foot">Connected wallet <code>{address ?? "None"}</code><br />Protected escrow <code>{config?.contractId ?? "Not configured"}</code>{paymentId && <><br />Payment <code>{paymentId}</code></>}</p>
    </aside></div>
  </main></div>;
}
