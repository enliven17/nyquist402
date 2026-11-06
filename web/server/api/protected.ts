import { challenge,authenticate,accountFromRequest } from "../auth";
import { material,trackTransaction } from "../cases";
import { Networks } from "@stellar/stellar-sdk";
import { issueCapability } from "@/lib/protected/capability";
import { history,activity } from "../store";
import { protectedClient } from "@/lib/protected/demo";
import { trustline, submitTrustline, usdcStatus } from "../usdc";
import { readProtectedRequest } from "@/lib/protected/request";
import { arbitrate, config, prepare, quote, snapshot } from "@/lib/protected/demo";

const quoteRequests=new Map<string,{at:number;count:number}>();
function limitQuotes(account:string) {
  const now=Date.now();
  for(const [key,value] of quoteRequests) if(now-value.at>=60000) quoteRequests.delete(key);
  const current=quoteRequests.get(account);
  if(current && current.count>=5) throw new Error("Too many quote requests; wait one minute");
  if(quoteRequests.size>=5000 && !current) throw new Error("Quote service is busy");
  quoteRequests.set(account,{at:current?.at??now,count:(current?.count??0)+1});
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
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
    if (body.operation === "auth_challenge") return response({ ok:true,...challenge(body.address) });
    if (body.operation === "auth_verify") return response({ ok:true,...await authenticate(body.id,body.xdr) });
    if (body.operation === "history") {
      const account=accountFromRequest(req),client=protectedClient();
      const records=history(client.contractId,account) as {paymentId:string;agreement:string}[];
      return response({ok:true,records:records.map(r=>({...r,capability:issueCapability({network:Networks.TESTNET,contractId:client.contractId,paymentId:r.paymentId},process.env.DEMO_SESSION_SECRET??"")}))});
    }
    if (body.operation === "case_read" || body.operation === "case_write") return response({ ok:true,...await material(accountFromRequest(req),body) });
    if (body.operation === "track") return response({ ok:true,...await trackTransaction(accountFromRequest(req),body) });
    if (body.operation === "activity") {
      const account=accountFromRequest(req);
      const { caseAccess } = await import("../cases");
      await caseAccess(account,body.paymentId,0,body.capability);
      return response({ok:true,records:activity(protectedClient().contractId,body.paymentId as string)});
    }
    if (body.operation === "usdc_status") return response({ok:true,...await usdcStatus(body.address)});
    if (body.operation === "trustline") return response({ ok: true, ...await trustline(body.address) });
    if (body.operation === "submit_trustline") return response({ ok: true, ...await submitTrustline(body.address, body.xdr) });
    if (body.operation === "quote") {
      if (accountFromRequest(req)!==body.payer) return response({ok:false,error:"Quote payer must match the signed-in wallet"},403);
      limitQuotes(String(body.payer));
      return response({ok:true,...await quote(body)});
    }
    if (body.operation === "arbitrate") { const { tx, arbiter } = await arbitrate({...body, account:accountFromRequest(req)}); return response({ ok: true, tx, arbiter }); }
    if (body.operation === "prepare") return response({ ok: true, prepared: await prepare(body) });
    return response({ ok: false, error: "Unsupported protected operation" }, 400);
  } catch (error) { return response({ ok: false, error: error instanceof Error ? error.message : "Protected action failed" }, 400); }
}
