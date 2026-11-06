import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { protectedClient } from "../lib/protected/demo.ts";
import { claimActions } from "../lib/protected/flow.ts";
import type { ProtectedAction } from "../lib/protected/types.ts";
import { db,track } from "./store.ts";

let running = false;
export async function reconcileTransactions(client=protectedClient()) {
  const rows=db().prepare("SELECT hash FROM transactions WHERE contract=? AND status='pending' ORDER BY created LIMIT 100").all(client.contractId) as {hash:string}[];
  for (const row of rows) {
    const tx=await client.server.getTransaction(row.hash);
    if (tx.status==="SUCCESS" || tx.status==="FAILED") db().prepare("UPDATE transactions SET status=? WHERE hash=?").run(tx.status.toLowerCase(),row.hash);
  }
}
export async function deadlineTick(client=protectedClient()) {
  if (running) return;
  running=true;
  try {
    await reconcileTransactions(client);
    if (process.env.DEMO_WORKER_ENABLED!=="true") return;
    const secret=process.env.DEMO_FACILITATOR_SECRET;
    if (!secret) throw new Error("Deadline worker needs a funded testnet facilitator signer");
    const signer=Keypair.fromSecret(secret);
    const payments=db().prepare("SELECT id FROM payments WHERE contract=? ORDER BY created DESC LIMIT 100").all(client.contractId) as {id:string}[];
    for (const payment of payments) {
      let state;
      try {state=await client.state(payment.id);} catch {continue;} // Unfunded offers are not funded payments.
      for (let claimId=0;claimId<state.next_claim_id;claimId++) {
        const claim=await client.claimState(payment.id,claimId), allowed=claimActions(claim,Math.floor(Date.now()/1000));
        const action=allowed.settle?"settle":allowed.fallback?"finalize_fallback":undefined;
        if (!action) continue;
        const key=[client.contractId,payment.id,claimId,action] as const;
        const existing=db().prepare("SELECT tx,status,xdr FROM worker_jobs WHERE contract=? AND payment=? AND claim=? AND action=?").get(...key) as {tx:string;status:string;xdr?:string}|undefined;
        if (existing) {
          if (existing.tx && existing.status==="pending") {
            const result=await client.server.getTransaction(existing.tx);
            if (result.status==="NOT_FOUND" && existing.xdr) {
              const original=TransactionBuilder.fromXDR(existing.xdr,Networks.TESTNET);
              if ("timeBounds" in original && original.timeBounds && Number(original.timeBounds.maxTime)>Date.now()/1000) await client.server.sendTransaction(original);
            }
            if (result.status==="SUCCESS" || result.status==="FAILED") db().prepare("UPDATE worker_jobs SET status=?,updated=? WHERE contract=? AND payment=? AND claim=? AND action=?").run(result.status.toLowerCase(),Date.now(),...key);
          }
          // A pending/unknown submission never produces a replacement payout.
          continue;
        }
        const prepared=await client.prepare(signer.publicKey(),{type:action,paymentId:payment.id,claimId} as ProtectedAction);
        const tx=TransactionBuilder.fromXDR(prepared.xdr,Networks.TESTNET);tx.sign(signer);
        const hash=tx.hash().toString("hex");
        const inserted=db().prepare("INSERT OR IGNORE INTO worker_jobs (contract,payment,claim,action,tx,status,updated,xdr) VALUES (?,?,?,?,?,'pending',?,?)").run(...key,hash,Date.now(),tx.toXDR());
        if (!inserted.changes) continue;
        track(hash,client.contractId,payment.id,signer.publicKey(),action);
        try {
          await client.submit(prepared,tx.toXDR());
          db().prepare("UPDATE worker_jobs SET status='success',updated=? WHERE contract=? AND payment=? AND claim=? AND action=?").run(Date.now(),...key);
          db().prepare("UPDATE transactions SET status='success' WHERE hash=?").run(hash);
        } catch {
          // The hash is durable even if broadcast or confirmation was interrupted.
          // Reconcile it on the next tick; manual actions remain available.
        }
      }
    }
  } finally {running=false;}
}
export function startWorker() {
  const timer=setInterval(()=>void deadlineTick().catch(error=>console.error("Payment reconciliation:",error instanceof Error?error.message:"failed")),15000);
  timer.unref();
  return ()=>clearInterval(timer);
}
