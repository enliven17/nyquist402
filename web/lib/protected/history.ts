import type { HistoryRecord } from "./types.ts";

export function historyKey(network: string, contractId: string, payer: string): string {
  return `nyquist402:protected:v1:${JSON.stringify([network, contractId, payer])}`;
}

export function readHistory(raw: string | null): HistoryRecord[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is HistoryRecord => !!v && typeof v === "object" &&
      typeof v.paymentId === "string" && /^[a-f0-9]{64}$/.test(v.paymentId) &&
      typeof v.agreement === "string" && v.agreement.length <= 10_000 &&
      (v.capability === undefined || (typeof v.capability === "string" && v.capability.length <= 4096)))
      .slice(0, 100);
  } catch { return []; }
}
