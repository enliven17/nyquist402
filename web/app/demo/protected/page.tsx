import { post,signIn,clearSession } from "@/lib/protected/service";
import { useEffect, useState } from "react";
import { Sk } from "@/components/Skeleton";
import * as wallet from "@/lib/wallet";
import { Toast } from "@/components/Toast";
import { USDC_FAUCET, USDC_ISSUER, USDC_CONTRACT } from "@/lib/usdc";
import { ProtectedEscrowClient } from "@/lib/protected/client";
import { assertHash, hashText, selectedArbiter, fundingTotal } from "@/lib/protected/codec";
import { formatAmount, parseAmount, parsePercentBps, validateQuote, type Quote } from "@/lib/protected/flow";
import { historyKey, readHistory } from "@/lib/protected/history";
import type { DemoConfig, HistoryRecord, Prepared, ProtectedAction, Snapshot } from "@/lib/protected/types";
import { ClaimPanel } from "./ClaimPanel";
import "../demo.css";
import "./protected.css";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const AGREEMENT = "Demonstration API delivery: each claim must describe its result and agreed cost. Buyer reviews each result; either party may dispute before review closes. No real inference service is included.";
export default function ProtectedDemo() {
  const [assetStatus,setAssetStatus] = useState<{balance:string;trustline:boolean}>();
  const [role,setRole] = useState<"buyer"|"seller"|"arbiter">("buyer");
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
  const assetLabel=snapshot && snapshot.terms.token!==USDC_CONTRACT ? "legacy asset" : "USDC";
  const buyer = !!address && address === snapshot?.terms.payer;
  const sellerControl = !!address && (!!current?.capability || address === snapshot?.terms.seller);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/protected", { signal: controller.signal }).then(r => r.json()).then(body => {
      if (!body.ok) throw new Error(body.error); setConfig(body.config);
    }).catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, []);
  useEffect(()=>{
    if(!address) return;
    let active=true;
    const read=()=>void post({operation:"usdc_status",address}).then(r=>{if(active)setAssetStatus(r);}).catch(e=>{if(active)setError(message(e));});
    read();const timer=setInterval(read,10000);
    return ()=>{active=false;clearInterval(timer);};
  },[address,reload]);
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
        if (active) {
          setSnapshot(result);
          void post({operation:"activity",paymentId}).then(activity=>{
            if (active && activity.records.length) setLog(activity.records.map((r:{label:string;tx:string;status:string})=>({label:r.label+" · "+r.status,tx:r.tx})));
          }).catch(()=>{});
        }
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
    if (action.type === "register_quote") throw new Error("Arbiter quotes use the arbiter client");
    if (!config || !address) throw new Error("Connect a testnet wallet first");
    const { prepared } = await post({ operation: "prepare", source: address, action, capability }) as { prepared: Prepared };
    const client = new ProtectedEscrowClient(config);
    const signed = await wallet.signTransaction(prepared.xdr,address);
    const recoveryId = action.type === "authorize" ? offer?.paymentId : action.paymentId;
    await post({operation:"track",paymentId:recoveryId,xdr:signed});
    return client.submit(prepared,signed);
  }
  async function quote() {
    if (!config || !address || !agreement.trim()) throw new Error("Connect a wallet and enter the agreement");
    const input = { payer: address, agreement, agreementHash: await hashText(agreement), buyerArbiter: preferred.trim() || null, fallbackSellerBps: parsePercentBps(fallback) };
    const quoted = await post({ operation: "quote", ...input }) as Quote;
    await validateQuote(quoted, config, input, Math.floor(Date.now() / 1000)); setOffer(quoted);
  }
  async function fund() {
    if (!offer || !config || !address) return;
    await validateQuote(offer, config, { payer: address, agreement, agreementHash: await hashText(agreement), buyerArbiter: preferred.trim() || null, fallbackSellerBps: parsePercentBps(fallback) }, Math.floor(Date.now() / 1000));
    // Retain the recovery ID even if the network accepts a transaction after polling times out.
    remember({ paymentId: offer.paymentId, agreement, capability: offer.capability });
    const result = await transact({ type: "authorize", terms: offer.terms }, offer.capability);
    setPaymentId(offer.paymentId); setOffer(undefined); return result;
  }
  const run = (label: string, action: ProtectedAction) => work(label, () => transact(action));
  const arbitrate = (claimId: number, sellerAmount: string, name: string) =>
    work(`${name} rules · claim ${claimId}`, () => post({ operation: "arbitrate", paymentId, claimId, sellerAmount, capability:current?.capability }) as Promise<{ tx: string }>);
  const deadline = (time: number) => `${new Date(time * 1000).toLocaleTimeString()} · ${Math.max(0, time - now)}s left`;
  const disabled = !!busy || !config || !address;
  const p = config?.preset;
  const chosen = preferred || config?.defaultArbiter;
  const setupTrustline = () => work("Add USDC trustline", async () => {
    if (!address) throw new Error("Connect a testnet wallet first");
    const step = await post({ operation: "trustline", address });
    if (!step.xdr) return;
    const signed = await wallet.signTransaction(step.xdr, address);
    return post({ operation: "submit_trustline", address, xdr: signed, expected: step.xdr });
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

    <section className="d-head"><div><h1>One budget.<br />Every delivery protected.</h1><p>Every delivery is a claim the buyer reviews. Disputes go to the arbiter you choose.</p></div>
      <button className="pill-btn accent" disabled={!!busy} onClick={() => void work("Connect wallet", async () => { clearSession();
        const connected = await wallet.connect();
        setAddress(connected);
        await signIn(connected);
        const saved = await post({operation:"history"});
        setRecords(items => [...items,...saved.records.filter((r: HistoryRecord)=>!items.some(i=>i.paymentId===r.paymentId))]); })}>{address ? `Connected · ${address.slice(0, 4)}…${address.slice(-4)}` : "Connect testnet wallet"}</button>
    </section>
    <nav className="demo-roles" aria-label="Payment role">{(["buyer","seller","arbiter"] as const).map(item=><button className={role === item ? "pill-btn accent" : "pill-btn"} aria-pressed={role===item} key={item} onClick={()=>setRole(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</nav>
    <p className="muted">Explore one payment from each role. Your connected wallet and the payment’s permissions determine which actions you can sign.</p>
    {config?.readiness && !config.readiness.ready && <p role="status" className="demo-setup-note">Demo setup pending: the seller or a fee recipient needs its USDC trustline. Funding is unavailable until the operator completes setup. You can explore the views and read the documentation.</p>}
    {busy && <p role="status" className="busy-bar"><span className="spin" aria-hidden /> {busy}…</p>}
    <div className="d-grid"><section>

      <div hidden={role !== "buyer"} className="step-row" data-state={snapshot ? "done" : "active"}><span className="step-num">{snapshot ? "✓" : "01"}</span><div>
        <h2>Agree and fund</h2>
        <p>Use Stellar Testnet in your wallet. Add the USDC trustline, then choose Stellar Testnet at Circle’s faucet and paste your wallet address. Test XLM pays network fees.</p>
        {address && <><p className="muted">Your address: <code>{address}</code></p>
        <p className="muted">USDC balance: {assetStatus?.balance ?? <Sk inline w={64} h={12} />} · Trustline: {assetStatus ? assetStatus.trustline ? "Ready" : "Add before using the faucet" : <Sk inline w={48} h={12} />}</p></>}
        <details><summary>USDC asset</summary><p>USDC · {USDC_ISSUER} · Stellar Testnet · 7 decimals</p></details>
        {!p && <ul className="chips" aria-busy="true" aria-label="Loading session presets">{[70, 64, 72, 86, 74].map((w, i) => <li key={i}><Sk inline w={w} h={12} /></li>)}</ul>}
        {p && <ul className="chips" aria-label="Session presets">
          <li><b>{formatAmount(p.budget)}</b> budget</li><li><b>{p.review}s</b> review</li><li><b>{p.response}s</b> evidence</li><li><b>{p.custom}s</b> per arbiter</li><li><b>{Math.round(p.session / 60)} min</b> session</li>
        </ul>}

        <fieldset className="arbiter-pick"><legend>Arbiter <span className="free">{config?.fees && (config.fees.custom_fee!=="0" || config.fees.default_fee!=="0") ? "quoted testnet fees" : "free on testnet"}</span></legend>
          <div className="arbiter-cards">{!config && !error && [0, 1, 2].map(i => <label key={i} aria-hidden><Sk w="70%" h={14} /><Sk w={80} h={11} style={{ marginTop: 8 }} /></label>)}{(config?.arbiters ?? []).map(a => <label key={a.address} className={chosen === a.address ? "on" : undefined}>
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
          <button className="pill-btn" disabled={disabled} onClick={() => void setupTrustline()}>Add USDC trustline</button>
          <a className="pill-btn" href={USDC_FAUCET} target="_blank" rel="noreferrer">Get test USDC from Circle ↗</a>
          <button className="pill-btn accent" disabled={disabled || config?.readiness?.ready===false || !agreement.trim()} onClick={() => void work("Review terms", quote)}>Review terms</button>
        </div>

        {offer && <div className="protected-offer"><h3>Before you sign</h3><dl className="protected-details">
          <div><dt>Work budget</dt><dd>{formatAmount(offer.terms.max_amount)} USDC</dd></div>
          <div><dt>Protocol reserve</dt><dd>{formatAmount(offer.terms.fees?.protocol_reserve ?? "0")} USDC</dd></div>
          <div><dt>Arbitration reserve</dt><dd>{formatAmount(offer.terms.fees?.arbitration_reserve ?? "0")} USDC</dd></div>
          <div><dt>Total to fund</dt><dd>{formatAmount(fundingTotal(offer.terms))} USDC</dd></div>
          <div><dt>Protocol policy</dt><dd>{(offer.terms.fees?.protocol_bps ?? 0)/100}% of the seller award; paid from the separate reserve</dd></div>
          <div><dt>Arbiter</dt><dd>{config?.arbiters.find(a => a.address === selectedArbiter(offer.terms))?.name ?? <code>{selectedArbiter(offer.terms)}</code>} · {offer.terms.fees ? formatAmount(selectedArbiter(offer.terms)===offer.terms.default_arbiter ? offer.terms.fees.default_fee : offer.terms.fees.custom_fee)+" USDC per valid ruling" : "free"}</dd></div>
          <div><dt>Funding closes</dt><dd>{deadline(offer.terms.fund_by)}</dd></div>
          <div><dt>Session closes</dt><dd>{deadline(offer.terms.delivery_deadline)}</dd></div>
          <div><dt>Timeout split</dt><dd>Seller {offer.terms.fallback_seller_bps / 100}% · buyer {100 - offer.terms.fallback_seller_bps / 100}%</dd></div>
        </dl><details><summary>Full signed terms</summary><pre>{JSON.stringify(offer.terms, null, 2)}</pre></details>
          <button className="pill-btn accent" disabled={disabled || now >= offer.terms.fund_by} onClick={() => void work("Fund protected payment", fund)}>Sign and fund {formatAmount(fundingTotal(offer.terms))}</button></div>}
      </div></div>

      <div hidden={role !== "seller"} className="step-row" data-state={snapshot ? (snapshot.claims.length ? "done" : "active") : "locked"}><span className="step-num">02</span><div>
        <h2>Record a delivery</h2>{!snapshot && <p>Choose Buyer to fund a payment first.</p>}<p>The seller reserves what the delivery cost. It stays in escrow until the buyer accepts or a case ends.</p>
        {snapshot && <div className="protected-form">
          <div className="row2">
            <label>Amount ({assetLabel})<input inputMode="decimal" value={claimAmount} onChange={e => setClaimAmount(e.target.value)} /></label>
            <label>Delivery<input value={delivery} maxLength={10000} onChange={e => setDelivery(e.target.value)} placeholder="What was delivered" /></label>
          </div>
          <div className="acts"><button className="pill-btn" disabled={disabled || !sellerControl || !delivery.trim() || now >= snapshot.terms.delivery_deadline || BigInt(snapshot.state.available) === 0n} onClick={() => void work("Record claim", async () => {
            const saved = await post({operation:"case_write",paymentId,claimId:snapshot.state.next_claim_id,party:snapshot.terms.seller,kind:"delivery",body:delivery,capability:current?.capability});
            return transact({ type:"claim",paymentId,amount:parseAmount(claimAmount),delivery:saved.hash });
          })}>Seller records claim</button></div>
        </div>}
      </div></div>

      {paymentId && !snapshot && <div className="protected-claims" aria-busy="true" aria-label="Reading payment from the contract"><h2>Claims</h2>{[0, 1].map(i => <div key={i} style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }}><Sk w="40%" h={14} /><Sk h={10} style={{ margin: "12px 0" }} /><Sk w="70%" h={11} /></div>)}</div>}
      {snapshot && <div className="protected-claims"><h2>Claims</h2>{snapshot.claims.length === 0 && <p className="muted">No claims yet.</p>}{snapshot.claims.filter(item=>role!=="arbiter" || item.claim.status==="Disputed").map(item => <ClaimPanel key={`${paymentId}:${item.id}`} {...item} terms={snapshot.terms} paymentId={paymentId} address={address} sellerControl={sellerControl} now={now} busy={!!busy} run={run} arbiters={config?.arbiters ?? []} arbitrate={arbitrate} capability={current?.capability} role={role} assetLabel={assetLabel} />)}
        {(offset > 0 || snapshot.nextOffset !== null) && <div className="acts"><button className="pill-btn sm" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 20))}>Previous</button><button className="pill-btn sm" disabled={snapshot.nextOffset === null} onClick={() => setOffset(snapshot.nextOffset ?? offset)}>Next</button></div>}
      </div>}
    </section>

    <aside className="d-side" aria-label="Protected ledger">
      <div className="pstate"><span className="d-cap">This payment</span>{snapshot ? <>
        <div className="pbar" role="img" aria-label={buckets.map(b => `${b.label} ${formatAmount(b.value.toString())}`).join(", ")}>
          {buckets.map(b => <i key={b.cls} className={b.cls} style={{ width: `${Number((b.value * 1000n) / total) / 10}%` }} />)}
        </div>
        <ul className="plegend">{buckets.map(b => <li key={b.cls}><i className={b.cls} />{b.label}<span>{formatAmount(b.value.toString())} {assetLabel}</span></li>)}</ul>
        {snapshot.terms.fees && <dl className="protected-details">
          <div><dt>Protocol held / paid / returned</dt><dd>{formatAmount((BigInt(snapshot.state.protocol_available??0)+BigInt(snapshot.state.protocol_reserved??0)).toString())} / {formatAmount(snapshot.state.protocol_paid??"0")} / {formatAmount(snapshot.state.protocol_returned??"0")} USDC</dd></div>
          <div><dt>Arbitration held / paid / returned</dt><dd>{formatAmount((BigInt(snapshot.state.arbitration_available??0)+BigInt(snapshot.state.arbitration_reserved??0)).toString())} / {formatAmount(snapshot.state.arbitration_paid??"0")} / {formatAmount(snapshot.state.arbitration_returned??"0")} USDC</dd></div>
        </dl>}
        <div className="kv"><span>Session ends</span><span>{Math.max(0, snapshot.terms.delivery_deadline - now)}s</span></div>
        <div className="acts">
          <button className="pill-btn sm" disabled={disabled || !buyer || now < snapshot.terms.delivery_deadline || (BigInt(snapshot.state.available)+BigInt(snapshot.state.protocol_available??0)+BigInt(snapshot.state.arbitration_available??0)) === 0n} onClick={() => void run("Reclaim unused funds", { type: "reclaim", paymentId })}>Reclaim unused</button>
          <button className="pill-btn sm" disabled={disabled || !sellerControl || (BigInt(snapshot.state.available)+BigInt(snapshot.state.protocol_available??0)+BigInt(snapshot.state.arbitration_available??0)) === 0n} onClick={() => void run("Seller returns unused funds", { type: "void_unclaimed", paymentId })}>Seller returns unused</button>
        </div>
        <details><summary>Payment details</summary><dl className="protected-details">
          <div><dt>Buyer</dt><dd><code>{snapshot.terms.payer}</code></dd></div><div><dt>Seller</dt><dd><code>{snapshot.terms.seller}</code></dd></div>
          <div><dt>Asset</dt><dd>{assetLabel} · <code>{snapshot.terms.token}</code></dd></div>
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
