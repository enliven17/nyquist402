/** JSON-safe public types. Token amounts use integer base units, never JS numbers. */
export type PaymentTerms = {
  payer: string; seller: string; token: string; agreement: string; max_amount: string;
  fund_by: number; delivery_deadline: number; buyer_arbiter: string | null; seller_arbiter: string | null;
  default_arbiter: string; review_seconds: number; response_seconds: number;
  arbiter_seconds: number; default_seconds: number; fallback_seller_bps: number; salt: string;
};
export type PaymentState = {
  available: string; reserved: string; paid_to_seller: string; returned_to_buyer: string; next_claim_id: number;
};
export type Claim = {
  amount: string; delivery: string; commitment: string; review_until: number;
  status: "Review" | "Disputed" | "Settled"; opened_by: string | null;
  buyer_evidence: string | null; seller_evidence: string | null; revision: number;
  response_until: number; custom_until: number; fallback_at: number; seller_award: string;
};
export type ProtectedAction =
  | { type: "authorize"; terms: PaymentTerms }
  | { type: "claim"; paymentId: string; amount: string; delivery: string }
  | { type: "accept"; paymentId: string; claimId: number; commitment: string }
  | { type: "dispute" | "submit_evidence"; paymentId: string; claimId: number; party: string; evidence: string }
  | { type: "rule"; paymentId: string; claimId: number; sellerAmount: string; revision: number }
  | { type: "settle" | "finalize_fallback"; paymentId: string; claimId: number }
  | { type: "reclaim" | "void_unclaimed"; paymentId: string };
export type Prepared = { xdr: string; source: string; networkPassphrase: string; contractId: string };
export type HistoryRecord = { paymentId: string; agreement: string; capability?: string };
export type DemoArbiter = { name: string; address: string; isDefault: boolean };
export type DemoConfig = {
  contractId: string; networkPassphrase: string; rpcUrl: string; token: string; seller: string;
  defaultArbiter: string; sellerArbiter: string | null;
  /** Demo-operated arbiters; free and selectable by the buyer. */
  arbiters: DemoArbiter[];
  preset: { budget: string; session: number; review: number; response: number; custom: number; default: number };
};
export type Snapshot = {
  paymentId: string; terms: PaymentTerms; state: PaymentState;
  claims: { id: number; claim: Claim; arbiter: string | null }[]; nextOffset: number | null;
};
