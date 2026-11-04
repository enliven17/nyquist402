// Server-only cryptography. Never import this module from a browser entry point.
import { createHmac, timingSafeEqual } from "node:crypto";
import { actionToCall } from "./codec.ts";
import type { ProtectedAction } from "./types.ts";

type Scope = { network: string; contractId: string; paymentId: string };
function payload(scope: Scope): string {
  return JSON.stringify(["nyquist402:demo-seller:v1", scope.network, scope.contractId, scope.paymentId,
    ["authorize", "claim", "void_unclaimed", "dispute", "submit_evidence"]]);
}
function mac(scope: Scope, secret: string): Buffer {
  if (secret.length < 32) throw new Error("DEMO_SESSION_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(payload(scope)).digest();
}
/** Unforgeable bearer delegation for this demo seller and this exact payment only. */
export function issueCapability(scope: Scope, secret: string): string {
  return mac(scope, secret).toString("base64url");
}
export function verifyCapability(token: unknown, scope: Scope, secret: string): void {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Seller capability required");
  const supplied = Buffer.from(token, "base64url");
  const expected = mac(scope, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid seller capability");
}
export function parseRequest(value: unknown): ProtectedAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid protected action");
  const action = value as ProtectedAction;
  actionToCall(action); // Validates the discriminated action and each encoded argument.
  return action;
}
