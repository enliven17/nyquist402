import { Address, StrKey } from "@stellar/stellar-sdk";
export const keys = [1, 2, 3, 4].map(n => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n)));
export const contract = Address.contract(Buffer.alloc(32, 5)).toString();
export const terms = {
  payer: keys[0], seller: keys[1], token: Address.contract(Buffer.alloc(32, 6)).toString(),
  agreement: "08".repeat(32), max_amount: "100000000", fund_by: 1800000060,
  delivery_deadline: 1800000360, buyer_arbiter: keys[2], seller_arbiter: keys[2], default_arbiter: keys[3],
  review_seconds: 120, response_seconds: 60, arbiter_seconds: 90, default_seconds: 90,
  fallback_seller_bps: 2500, salt: "07".repeat(32),
};
