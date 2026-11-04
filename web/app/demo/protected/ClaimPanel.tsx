"use client";
import { useState } from "react";
import { claimActions, formatAmount, parseAmount } from "@/lib/protected/flow";
import { hashText } from "@/lib/protected/codec";
import type { Claim, PaymentTerms, ProtectedAction } from "@/lib/protected/types";

export function ClaimPanel({ id, claim, arbiter, terms, paymentId, address, sellerControl, now, busy, run }: {
  id: number; claim: Claim; arbiter: string | null; terms: PaymentTerms; paymentId: string;
  address?: string; sellerControl: boolean; now: number; busy: boolean;
  run: (label: string, action: ProtectedAction) => Promise<void>;
}) {
  const [evidence, setEvidence] = useState("");
  const [award, setAward] = useState("");
  const allowed = claimActions(claim, now);
  const buyer = address === terms.payer;
  const canRule = address === arbiter && allowed.rule;
  const disabled = busy || !address;
  const deadline = (value: number) => `${new Date(value * 1000).toLocaleTimeString()} (${Math.max(0, value - now)}s left)`;
  async function evidenceAction(party: string, type: "dispute" | "submit_evidence") {
    if (!evidence.trim()) return;
    await run(`${type === "dispute" ? "Dispute" : "Evidence"} · claim ${id}`, {
      type, paymentId, claimId: id, party, evidence: await hashText(evidence),
    });
  }
  return <article className="protected-claim">
    <header><h3>Claim {id} <span className="d-cap">{claim.status}</span></h3><strong>{formatAmount(claim.amount)} DEMOUSD</strong></header>
    <dl className="protected-details">
      <div><dt>Review closes</dt><dd>{deadline(claim.review_until)}</dd></div>
      <div><dt>Delivery commitment</dt><dd><code>{claim.delivery}</code></dd></div>
      {claim.status === "Disputed" && <>
        <div><dt>Evidence closes</dt><dd>{deadline(claim.response_until)}</dd></div>
        <div><dt>Custom arbiter closes</dt><dd>{deadline(claim.custom_until)}</dd></div>
        <div><dt>Final fallback</dt><dd>{deadline(claim.fallback_at)}</dd></div>
        <div><dt>Current arbiter</dt><dd><code>{arbiter ?? "Ruling window closed"}</code></dd></div>
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
    {canRule && <div className="protected-form">
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
