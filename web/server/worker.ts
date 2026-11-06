import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { protectedClient } from "../lib/protected/demo.ts";
import { claimActions } from "../lib/protected/flow.ts";
import type { ProtectedAction } from "../lib/protected/types.ts";
import { addJob,job,pendingTransactions,recentPayments,setJobStatus,setTransactionStatus,track } from "./store.ts";

let running = false;
export async function reconcileTransactions(client=protectedClient()) {
  for (const hash of await pendingTransactions(client.contractId)) {
    const tx=await client.server.getTransaction(hash);
    if (tx.status==="SUCCESS" || tx.status==="FAILED") await setTransactionStatus(hash,tx.status.toLowerCase());
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
    for (const paymentId of await recentPayments(client.contractId)) {
      const payment={id:paymentId};
      let state;
      try {state=await client.state(payment.id);} catch {continue;} // Unfunded offers are not funded payments.
      for (let claimId=0;claimId<state.next_claim_id;claimId++) {
        const claim=await client.claimState(payment.id,claimId), allowed=claimActions(claim,Math.floor(Date.now()/1000));
        const action=allowed.settle?"settle":allowed.fallback?"finalize_fallback":undefined;
        if (!action) continue;
        const key=[client.contractId,payment.id,claimId,action] as const;
        const existing=await job(...key);
        if (existing) {
          if (existing.tx && existing.status==="pending") {
            const result=await client.server.getTransaction(existing.tx);
            if (result.status==="NOT_FOUND" && existing.xdr) {
              const original=TransactionBuilder.fromXDR(existing.xdr,Networks.TESTNET);
              if ("timeBounds" in original && original.timeBounds && Number(original.timeBounds.maxTime)>Date.now()/1000) await client.server.sendTransaction(original);
            }
            if (result.status==="SUCCESS" || result.status==="FAILED") await setJobStatus(key,result.status.toLowerCase());
          }
          // A pending/unknown submission never produces a replacement payout.
          continue;
        }
        const prepared=await client.prepare(signer.publicKey(),{type:action,paymentId:payment.id,claimId} as ProtectedAction);
        const tx=TransactionBuilder.fromXDR(prepared.xdr,Networks.TESTNET);tx.sign(signer);
        const hash=tx.hash().toString("hex");
        if (!await addJob(key,hash,tx.toXDR())) continue;
        await track(hash,client.contractId,payment.id,signer.publicKey(),action);
        try {
          await client.submit(prepared,tx.toXDR());
          await setJobStatus(key,"success");
          await setTransactionStatus(hash,"success");
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
