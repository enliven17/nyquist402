import { verifyCapability } from "./capability.ts";
import type { ProtectedAction } from "./types.ts";

/** Returns whether a narrowly scoped seller authorization must be added. */
export function authorizeDemoAction(
  action: ProtectedAction, source: string, parties: { payer: string; seller: string }, token: unknown,
  scope: { network: string; contractId: string; paymentId: string }, secret: string, currentArbiter?: string | null,
): boolean {
  const delegate = () => { verifyCapability(token, scope, secret); return true; };
  switch (action.type) {
    case "register_quote": throw new Error("Use the arbiter SDK to publish its authenticated fee quote");
    case "authorize":
      if (source !== parties.payer) throw new Error("Only the buyer can fund these terms");
      return delegate();
    case "claim": case "void_unclaimed": return source === parties.seller ? false : delegate();
    case "dispute": case "submit_evidence":
      if (action.party !== parties.payer && action.party !== parties.seller) throw new Error("Evidence party is not a payment party");
      if (source === action.party) return false;
      if (action.party === parties.seller) return delegate();
      throw new Error("Buyer actions require the buyer wallet");
    case "accept": case "reclaim":
      if (source !== parties.payer) throw new Error("This action requires the buyer wallet");
      return false;
    case "rule":
      if (!currentArbiter || currentArbiter !== source) throw new Error("Rulings require the current arbiter wallet");
      return false;
    case "settle": case "finalize_fallback": return false;
  }
}
