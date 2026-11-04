import { NextResponse } from "next/server";
import { readProtectedRequest } from "@/lib/protected/request";
import { config, prepare, quote, snapshot } from "@/lib/protected/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const paymentId = params.get("paymentId");
    return response({ ok: true, ...(paymentId ? await snapshot(paymentId, Number(params.get("offset") ?? 0)) : { config: await config() }) });
  } catch (error) { return response({ ok: false, error: error instanceof Error ? error.message : "Protected state unavailable" }, 400); }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) return response({ ok: false, error: "Cross-origin action rejected" }, 403);
    const body = await readProtectedRequest(req);
    if (body.operation === "quote") return response({ ok: true, ...await quote(body) });
    if (body.operation === "prepare") return response({ ok: true, prepared: await prepare(body) });
    return response({ ok: false, error: "Unsupported protected operation" }, 400);
  } catch (error) { return response({ ok: false, error: error instanceof Error ? error.message : "Protected action failed" }, 400); }
}
