"use client";
import { useState } from "react";
import { claimActions, formatAmount, parseAmount } from "@/lib/protected/flow";
import { hashText } from "@/lib/protected/codec";
import type { Claim, DemoArbiter, PaymentTerms, ProtectedAction } from "@/lib/protected/types";

export function ClaimPanel({ id, claim, arbiter, terms, paymentId, address, sellerControl, now, busy, run, arbiters, arbitrate }: {
  id: number; claim: Claim; arbiter: string | null; terms: PaymentTerms; paymentId: string;
  address?: string; sellerControl: boolean; now: number; busy: boolean;
  run: (label: string, action: ProtectedAction) => Promise<void>;
  arbiters: DemoArbiter[];
  arbitrate: (claimId: number, sellerAmount: string, name: string) => Promise<void>;
}) {
  const [evidence, setEvidence] = useState("");
  const [award, setAward] = useState("");
  const allowed = claimActions(claim, now);
  const buyer = address === terms.payer;
  const canRule = address === arbiter && allowed.rule;
  const desk = arbiters.find(a => a.address === arbiter);
  // The window the claim is waiting on right now, for the countdown bar.
  const window = claim.status === "Review" && now < claim.review_until
    ? { label: "Review closes", end: claim.review_until, span: terms.review_seconds }
    : claim.status === "Disputed" && now < claim.response_until
      ? { label: "Evidence closes", end: claim.response_until, span: Math.max(1, claim.response_until - claim.review_until + terms.review_seconds) }
      : claim.status === "Disputed" && now < claim.fallback_at
        ? { label: "Ruling window", end: claim.fallback_at, span: Math.max(1, claim.fallback_at - claim.response_until) }
        : undefined;
  const disabled = busy || !address;
  const deadline = (value: number) => `${new Date(value * 1000).toLocaleTimeString()} (${Math.max(0, value - now)}s left)`;
  async function evidenceAction(party: string, type: "dispute" | "submit_evidence") {
    if (!evidence.trim()) return;
    await run(`${type === "dispute" ? "Dispute" : "Evidence"} · claim ${id}`, {
      type, paymentId, claimId: id, party, evidence: await hashText(evidence),
    });
  }
  return <article className="protected-claim">
    <header><h3>Claim {id} <span className={`status status-${claim.status.toLowerCase()}`}>{claim.status}</span></h3><strong>{formatAmount(claim.amount)} DEMOUSD</strong></header>
    {window && <div className="countdown" aria-label={`${window.label}: ${Math.max(0, window.end - now)} seconds left`}>
      <div className="kv"><span>{window.label}</span><span>{Math.max(0, window.end - now)}s</span></div>
      <div className="bar time"><i style={{ width: `${Math.min(100, Math.max(0, ((window.end - now) / window.span) * 100))}%` }} /></div>
    </div>}
    <dl className="protected-details">
      <div><dt>Review closes</dt><dd>{deadline(claim.review_until)}</dd></div>
      <div><dt>Delivery commitment</dt><dd><code>{claim.delivery}</code></dd></div>
      {claim.status === "Disputed" && <>
        <div><dt>Evidence closes</dt><dd>{deadline(claim.response_until)}</dd></div>
        <div><dt>Custom arbiter closes</dt><dd>{deadline(claim.custom_until)}</dd></div>
        <div><dt>Final fallback</dt><dd>{deadline(claim.fallback_at)}</dd></div>
        <div><dt>Current arbiter</dt><dd>{arbiter ? desk?.name ?? <code>{arbiter}</code> : "Ruling window closed"}</dd></div>
        <div><dt>Evidence revision</dt><dd>{claim.revision}</dd></div>
      </>}
      {claim.buyer_evidence && <div><dt>Buyer evidence hash</dt><dd><code>{claim.buyer_evidence}</code></dd></div>}
      {claim.seller_evidence && <div><dt>Seller evidence hash</dt><dd><code>{claim.seller_evidence}</code></dd></div>}
      {claim.status === "Settled" && <div><dt>Final seller award</dt><dd>{formatAmount(claim.seller_award)} DEMOUSD</dd></div>}
    </dl>
    {claim.status !== "Settled" && <div className="acts">
      <button className="pill-btn" disabled={disabled || !buyer || !allowed.accept} onClick={() => void run(`Accept · claim ${id}`, { type: "accept", paymentId, claimId: id, commitment: claim.commitment })}>Accept and pay</button>
      <button className="pill-btn" disabled={disabled || !allowed.settle} onClick={() => void run(`Settle · claim ${id}`, { type: "settle", paymentId, claimId: id })}>Settle after review</button>
      <button className="pill-btn" disabled={disabled || !allowed.fallback} onClick={() => void run(`Fallback · claim ${id}`, { type: "finalize_fallback", paymentId, claimId: id })}>Apply agreed fallback</button>
    </div>}
    {(allowed.dispute || allowed.evidence) && (buyer || sellerControl) && <div className="protected-form">
      <label>Evidence text<textarea value={evidence} maxLength={10000} onChange={e => setEvidence(e.target.value)} placeholder="Describe the issue or response. Save a copy before submitting." /></label>
      <p className="muted">Only a hash is submitted. Keep the text and share it with the other party and arbiter through your agreed channel.</p>
      <div className="acts">
        <button className="pill-btn" disabled={disabled || !buyer || !evidence.trim()} onClick={() => void evidenceAction(terms.payer, allowed.dispute ? "dispute" : "submit_evidence")}>{allowed.dispute ? "Buyer disputes" : "Buyer responds"}</button>
        <button className="pill-btn" disabled={disabled || !sellerControl || !evidence.trim()} onClick={() => void evidenceAction(terms.seller, allowed.dispute ? "dispute" : "submit_evidence")}>{allowed.dispute ? "Seller disputes" : "Seller responds"}</button>
      </div>
    </div>}
    {desk && claim.status === "Disputed" && <div className="protected-form arbiter-desk">
      <p><strong>{desk.name}</strong> <span className="free">free</span></p>
      {allowed.rule ? <>
        <p className="muted">Decide the split after reading both sides. The remainder returns to the buyer.</p>
        <div className="acts">
          {[["Seller wins", 1n, 1n], ["Split 50/50", 1n, 2n], ["Buyer wins", 0n, 1n]].map(([label, num, den]) => {
            const sellerAmount = (BigInt(claim.amount) * (num as bigint) / (den as bigint)).toString();
            return <button key={label as string} className="pill-btn" disabled={busy} onClick={() => void arbitrate(id, sellerAmount, desk.name)}>{label as string} · {formatAmount(sellerAmount)} to seller</button>;
          })}
        </div>
      </> : <p className="muted">Rules once the evidence window closes ({Math.max(0, claim.response_until - now)}s).</p>}
    </div>}
    {canRule && !desk && <div className="protected-form">
      <label>Seller award (DEMOUSD)<input inputMode="decimal" value={award} onChange={e => setAward(e.target.value)} placeholder={`0 to ${formatAmount(claim.amount)}`} /></label>
      <button className="pill-btn accent" disabled={disabled || !award} onClick={() => {
        try {
          const sellerAmount = parseAmount(award);
          if (BigInt(sellerAmount) > BigInt(claim.amount)) return;
          void run(`Rule · claim ${id}`, { type: "rule", paymentId, claimId: id, sellerAmount, revision: claim.revision });
        } catch { /* input hint remains visible until the amount is valid */ }
      }}>Sign final ruling</button>
      <p className="muted">Your arbiter wallet signs revision {claim.revision}. The remainder returns to the buyer.</p>
    </div>}
  </article>;
}
