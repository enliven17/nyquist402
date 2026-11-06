import { Buffer } from "buffer";
import { Address, nativeToScVal, StrKey, xdr } from "@stellar/stellar-sdk";
import type { PaymentTerms, ProtectedAction, FeeQuote } from "./types.ts";

export const CAPABILITY = "nyquist402:protected:v1";
export function assertHash(v: unknown): asserts v is string {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) throw new Error("Expected a lowercase 32-byte hash");
}
export function assertAddress(v: unknown, contractOnly = false): asserts v is string {
  if (typeof v !== "string" || !(StrKey.isValidContract(v) || (!contractOnly && StrKey.isValidEd25519PublicKey(v)))) throw new Error("Invalid Stellar address");
}
export function integer(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) throw new Error("Invalid integer");
  return v;
}
export function amount(v: unknown, zero = false): bigint {
  if (typeof v !== "string" || !/^(0|[1-9][0-9]{0,38})$/.test(v)) throw new Error("Amount must be integer base units");
  const n = BigInt(v);
  if (n > (1n << 127n) - 1n || (!zero && n === 0n)) throw new Error("Amount out of i128 range");
  return n;
}
export function bytes(v: string): xdr.ScVal { assertHash(v); return xdr.ScVal.scvBytes(Buffer.from(v, "hex")); }
export function addr(v: string): xdr.ScVal { assertAddress(v); return Address.fromString(v).toScVal(); }
const uint = (v: number, type: "u32" | "u64" = "u32") => nativeToScVal(integer(v, 0, type === "u32" ? 0xffffffff : Number.MAX_SAFE_INTEGER), { type });
const money = (v: string, zero = false) => nativeToScVal(amount(v, zero), { type: "i128" });

/** Contract structs are symbol-keyed maps sorted by field name. */
export function termsToScVal(t: PaymentTerms): xdr.ScVal {
  if (!t || typeof t !== "object") throw new Error("Invalid terms");
  const fields: Record<string,xdr.ScVal> = {
    payer: addr(t.payer), seller: addr(t.seller), token: addr(t.token), agreement: bytes(t.agreement),
    max_amount: money(t.max_amount), fund_by: uint(t.fund_by, "u64"), delivery_deadline: uint(t.delivery_deadline, "u64"),
    buyer_arbiter: t.buyer_arbiter === null ? xdr.ScVal.scvVoid() : addr(t.buyer_arbiter),
    seller_arbiter: t.seller_arbiter === null ? xdr.ScVal.scvVoid() : addr(t.seller_arbiter),
    default_arbiter: addr(t.default_arbiter), review_seconds: uint(t.review_seconds, "u64"),
    response_seconds: uint(t.response_seconds, "u64"), arbiter_seconds: uint(t.arbiter_seconds, "u64"),
    default_seconds: uint(t.default_seconds, "u64"), fallback_seller_bps: uint(t.fallback_seller_bps), salt: bytes(t.salt),
  };
  if (t.fees) {
    const f=t.fees;
    for (const key of ["protocol_reserve","arbitration_reserve","custom_fee","default_fee","case_fee_cap"] as const) fields[key]=money(f[key],true);
    fields.protocol_bps=uint(f.protocol_bps);
    fields.protocol_recipient=addr(f.protocol_recipient);
    fields.custom_quote=f.custom_quote === null ? xdr.ScVal.scvVoid() : bytes(f.custom_quote);
    fields.default_quote=f.default_quote === null ? xdr.ScVal.scvVoid() : bytes(f.default_quote);
  }
  return xdr.ScVal.scvMap((Object.keys(fields) as (keyof typeof fields)[]).sort().map(k =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] })));
}
export function selectedArbiter(t: PaymentTerms): string {
  return t.buyer_arbiter && t.buyer_arbiter === t.seller_arbiter ? t.buyer_arbiter : t.default_arbiter;
}
export function validateTerms(t: PaymentTerms, p: { contractId: string; defaultArbiter: string; now?: number }): void {
  termsToScVal(t); assertAddress(p.contractId, true); assertAddress(t.token, true);
  if (t.default_arbiter !== p.defaultArbiter || t.payer === t.seller || [t.payer, t.seller, t.token].includes(p.contractId) ||
      t.fund_by >= t.delivery_deadline || (p.now !== undefined && t.fund_by <= p.now) || t.fallback_seller_bps > 10000) throw new Error("Invalid protected payment policy");
  for (const v of [t.review_seconds, t.response_seconds, t.arbiter_seconds, t.default_seconds]) integer(v, 1);
  integer(t.delivery_deadline + t.review_seconds + t.response_seconds + t.arbiter_seconds + t.default_seconds);
  if (t.fees) {
    const f=t.fees;
    const principal=amount(t.max_amount), protocol=amount(f.protocol_reserve,true), arbitration=amount(f.arbitration_reserve,true);
    integer(f.protocol_bps,0,10000); assertAddress(f.protocol_recipient);
    if (f.protocol_recipient === p.contractId || principal+protocol+arbitration > (1n<<127n)-1n ||
        protocol < principal*BigInt(f.protocol_bps)/10000n || amount(f.custom_fee,true)>amount(f.case_fee_cap,true) ||
        amount(f.default_fee,true)>amount(f.case_fee_cap,true) ||
        (selectedArbiter(t) === t.default_arbiter && (f.custom_fee !== "0" || f.custom_quote !== null)) ||
        (f.default_fee !== "0" && !f.default_quote) || (f.custom_fee !== "0" && !f.custom_quote)) throw new Error("Invalid protected fee policy");
  }
  for (const a of [selectedArbiter(t), t.default_arbiter]) if ([t.payer, t.seller, p.contractId].includes(a)) throw new Error("Arbiter cannot be a party or escrow");
}
async function digest(data: Uint8Array): Promise<string> {
  return Buffer.from(await crypto.subtle.digest("SHA-256", new Uint8Array(data))).toString("hex");
}
export async function hashText(text: string): Promise<string> { return digest(new TextEncoder().encode(text)); }
export async function computePaymentId(t: PaymentTerms, contractId: string, network: string): Promise<string> {
  assertAddress(contractId, true);
  return digest(Buffer.concat([Buffer.from(t.fees ? "nyquist402:protected:v2" : CAPABILITY), Buffer.from(await hashText(network), "hex"), addr(contractId).toXDR(), termsToScVal(t).toXDR()]));
}
export function actionToCall(a: ProtectedAction): { method: string; args: xdr.ScVal[] } {
  if (!a || typeof a !== "object") throw new Error("Invalid protected action");
  if (a.type === "register_quote") return {method:a.type,args:[feeQuoteToScVal(a.quote)]};
  if (a.type === "authorize") return { method: a.type, args: [termsToScVal(a.terms)] };
  const id = bytes((a as { paymentId: string }).paymentId);
  switch (a.type) {
    case "claim": return { method: a.type, args: [id, money(a.amount), bytes(a.delivery)] };
    case "accept": return { method: a.type, args: [id, uint(a.claimId), bytes(a.commitment)] };
    case "dispute": case "submit_evidence": return { method: a.type, args: [id, uint(a.claimId), addr(a.party), bytes(a.evidence)] };
    case "rule": return { method: a.type, args: [id, uint(a.claimId), money(a.sellerAmount, true), uint(a.revision)] };
    case "settle": case "finalize_fallback": return { method: a.type, args: [id, uint(a.claimId)] };
    case "reclaim": case "void_unclaimed": return { method: a.type, args: [id] };
    default: throw new Error("Unsupported protected action");
  }
}
export function jsonNative(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v === undefined || v === null) return null;
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  if (Array.isArray(v)) return v.map(jsonNative);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, jsonNative(item)]));
  return v;
}

export function fundingTotal(t:PaymentTerms):string {
  return (BigInt(t.max_amount)+BigInt(t.fees?.protocol_reserve??"0")+BigInt(t.fees?.arbitration_reserve??"0")).toString();
}
export async function quoteScope(t:PaymentTerms,contractId:string,network:string):Promise<string> {
  if (!t.fees) throw new Error("Fee-capable terms required");
  const clean={...t,fees:{...t.fees,custom_quote:null,default_quote:null}};
  return digest(Buffer.concat([Buffer.from("nyquist402:quote-scope:v2"),Buffer.from(await hashText(network),"hex"),addr(contractId).toXDR(),termsToScVal(clean).toXDR()]));
}


export function feeQuoteToScVal(q:FeeQuote):xdr.ScVal {
  const f:Record<string,xdr.ScVal>={scope:bytes(q.scope),arbiter:addr(q.arbiter),fee:money(q.fee,true),valid_until:uint(q.valid_until,"u64"),salt:bytes(q.salt)};
  return xdr.ScVal.scvMap(Object.keys(f).sort().map(key=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(key),val:f[key]})));
}
export async function quoteId(q:FeeQuote):Promise<string> { return digest(feeQuoteToScVal(q).toXDR()); }
