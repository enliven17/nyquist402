import { amount, CAPABILITY, computePaymentId, validateTerms } from "./codec.ts";
import type { Claim, DemoConfig, PaymentTerms } from "./types.ts";
export type Quote = { protocol: string; terms: PaymentTerms; paymentId: string; capability: string };
export type QuoteInput = { payer: string; agreementHash: string; buyerArbiter: string | null; fallbackSellerBps: number };
export function claimActions(c: Claim, now: number) {
  return {
    accept: c.status === "Review", dispute: c.status === "Review" && now < c.review_until,
    evidence: c.status === "Disputed" && now < c.response_until,
    settle: c.status === "Review" && now >= c.review_until,
    rule: c.status === "Disputed" && now >= c.response_until && now < c.fallback_at,
    fallback: c.status === "Disputed" && now >= c.fallback_at,
  };
}
export function parseAmount(text: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,7})?$/.test(text)) throw new Error("Use a nonnegative DEMOUSD amount with at most 7 decimal places");
  const [whole, fraction = ""] = text.split(".");
  const value = (BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, "0"))).toString();
  amount(value, true); return value;
}
export function parsePercentBps(text: string): number {
  if (!/^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$/.test(text)) throw new Error("Use a percentage from 0 to 100 with at most two decimal places");
  const [whole, fraction = ""] = text.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (bps > 10000) throw new Error("Percentage must not exceed 100");
  return bps;
}
export function formatAmount(text: string): string {
  const value = BigInt(text);
  const whole = value / 10000000n;
  const fraction = (value % 10000000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
export async function validateQuote(q: Quote, c: DemoConfig, input: QuoteInput, now: number): Promise<void> {
  if (q.protocol !== CAPABILITY) throw new Error("Route does not offer protected settlement v1");
  validateTerms(q.terms, { contractId: c.contractId, defaultArbiter: c.defaultArbiter, now });
  const t = q.terms;
  if (t.payer !== input.payer || t.seller !== c.seller || t.token !== c.token || t.agreement !== input.agreementHash ||
      t.buyer_arbiter !== input.buyerArbiter || t.seller_arbiter !== c.sellerArbiter || t.fallback_seller_bps !== input.fallbackSellerBps ||
      t.max_amount !== c.preset.budget || t.review_seconds !== c.preset.review || t.response_seconds !== c.preset.response ||
      t.arbiter_seconds !== c.preset.custom || t.default_seconds !== c.preset.default ||
      t.delivery_deadline <= now || t.delivery_deadline > now + c.preset.session ||
      q.paymentId !== await computePaymentId(t, c.contractId, c.networkPassphrase)) throw new Error("Quote differs from the requested agreement or policy");
}
