import { NextResponse } from "next/server";
import { authorize, capture, refund, status, voidHold } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASH = /^[0-9a-f]{64}$/;
const AMOUNT = /^[1-9][0-9]{0,18}$/;

export async function GET(req: Request) {
  const hash = new URL(req.url).searchParams.get("paymentHash") ?? undefined;
  if (hash && !HASH.test(hash)) return NextResponse.json({ error: "invalid paymentHash" }, { status: 400 });
  try {
    return NextResponse.json(await status(hash));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { action, paymentHash, amount } = body;
  if (action !== "authorize" && (typeof paymentHash !== "string" || !HASH.test(paymentHash))) {
    return NextResponse.json({ error: "invalid paymentHash" }, { status: 400 });
  }
  if ((action === "capture" || action === "refund") && (typeof amount !== "string" || !AMOUNT.test(amount))) {
    return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  }
  try {
    switch (action) {
      case "authorize":
        return NextResponse.json(await authorize());
      case "capture":
        return NextResponse.json(await capture(paymentHash as string, amount as string, body.voidRemainder === true));
      case "void":
        return NextResponse.json(await voidHold(paymentHash as string));
      case "refund":
        return NextResponse.json(await refund(paymentHash as string, amount as string));
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
