import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  payments: defineTable({ contract: v.string(), id: v.string(), buyer: v.string(), seller: v.string(), agreement: v.string() })
    .index("by_payment_id", ["contract", "id"]).index("by_buyer", ["contract", "buyer"]).index("by_seller", ["contract", "seller"]).index("by_contract", ["contract"]),
  bodies: defineTable({ contract: v.string(), payment: v.string(), hash: v.string(), party: v.string(), kind: v.string(), claim: v.number(), body: v.string() })
    .index("by_payment", ["contract", "payment", "claim"]),
  transactions: defineTable({ hash: v.string(), contract: v.string(), payment: v.string(), account: v.string(), action: v.string(), status: v.string() })
    .index("by_hash", ["hash"]).index("by_payment", ["contract", "payment"]).index("by_status", ["contract", "status"]),
  jobs: defineTable({ contract: v.string(), payment: v.string(), claim: v.number(), action: v.string(), tx: v.string(), status: v.string(), xdr: v.string() })
    .index("by_key", ["contract", "payment", "claim", "action"]),
  challenges: defineTable({ id: v.string(), address: v.string(), xdr: v.string(), expires: v.number() })
    .index("by_cid", ["id"]).index("by_expires", ["expires"]),
  // Contract event copy and running totals (events.ts).
  chain: defineTable({ cursor: v.string(), startLedger: v.number(), totals: v.any() }),
  events: defineTable({
    eid: v.string(), kind: v.string(), ledger: v.number(), at: v.number(), tx: v.string(), paymentId: v.string(),
    claimId: v.union(v.number(), v.null()), payer: v.optional(v.string()), arbiter: v.optional(v.string()),
    amount: v.optional(v.string()), seller: v.optional(v.string()), buyer: v.optional(v.string()), reason: v.optional(v.string()),
  }).index("by_eid", ["eid"]),
  seen: defineTable({ kind: v.string(), key: v.string() }).index("by_key", ["kind", "key"]),
  bins: defineTable({ at: v.number(), transactions: v.number() }).index("by_at", ["at"]),
  // One scheduled scenario run against the hosted API (tester.ts).
  runs: defineTable({ seq: v.number(), name: v.string(), ok: v.boolean(), txs: v.number(), ms: v.number(), buyer: v.string(), paymentId: v.optional(v.string()), error: v.optional(v.string()) })
    .index("by_seq", ["seq"]),
});
