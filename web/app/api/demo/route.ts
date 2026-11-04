import { NextResponse } from "next/server";
import type { PaymentPayload } from "@x402/core/types";
import {
  authorize,
  capture,
  faucet,
  isAccount,
  pay,
  quote,
  reclaimTx,
  refund,
  status,
  submit,
  voidHold,
} from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = /^[0-9a-f]{64}$/;
const AMOUNT = /^[1-9][0-9]{0,18}$/;
const UUID = /^[0-9a-f-]{36}$/;
const MAX_XDR = 20_000;

const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const hash = params.get("paymentHash") ?? undefined;
  const payer = params.get("payer") ?? undefined;
  if (hash && !HASH.test(hash)) return bad("invalid paymentHash");
  if (payer && !isAccount(payer)) return bad("invalid payer");
  try {
    return NextResponse.json(await status(hash, payer));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { action, paymentHash, amount, address, quoteId, payload, xdr } = body;
  const hashOk = typeof paymentHash === "string" && HASH.test(paymentHash);
  const addressOk = typeof address === "string" && isAccount(address);
  const amountOk = typeof amount === "string" && AMOUNT.test(amount);
  try {
    switch (action) {
      case "authorize":
        return NextResponse.json(await authorize());
      case "quote":
        return NextResponse.json(await quote(true));
      case "pay":
        if (typeof quoteId !== "string" || !UUID.test(quoteId)) return bad("invalid quoteId");
        if (!payload || typeof payload !== "object") return bad("invalid payload");
        return NextResponse.json(await pay(quoteId, payload as PaymentPayload));
      case "faucet":
        if (!addressOk) return bad("invalid address");
        return NextResponse.json(await faucet(address as string));
      case "reclaim":
        if (!addressOk) return bad("invalid address");
        if (!hashOk) return bad("invalid paymentHash");
        return NextResponse.json(await reclaimTx(address as string, paymentHash as string));
      case "submit":
        if (typeof xdr !== "string" || xdr.length > MAX_XDR) return bad("invalid xdr");
        return NextResponse.json(await submit(xdr));
      case "capture":
        if (!hashOk) return bad("invalid paymentHash");
        if (!amountOk) return bad("invalid amount");
        return NextResponse.json(await capture(paymentHash as string, amount as string, body.voidRemainder === true));
      case "void":
        if (!hashOk) return bad("invalid paymentHash");
        return NextResponse.json(await voidHold(paymentHash as string));
      case "refund":
        if (!hashOk) return bad("invalid paymentHash");
        if (!amountOk) return bad("invalid amount");
        return NextResponse.json(await refund(paymentHash as string, amount as string));
      default:
        return bad("unknown action");
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
