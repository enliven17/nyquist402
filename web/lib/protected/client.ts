import { Account, Address, BASE_FEE, Contract, Keypair, nativeToScVal, rpc, scValToNative, StrKey, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { actionToCall, addr, assertAddress, bytes, integer, jsonNative, validateTerms, fundingTotal, quoteScope, assertHash } from "./codec.ts";
import type { Claim, PaymentState, PaymentTerms, Prepared, ProtectedAction } from "./types.ts";

export type AuthorizationSigner = (address: string, entry: xdr.SorobanAuthorizationEntry, validUntilLedger: number) => Promise<xdr.SorobanAuthorizationEntry>;
export type ClientConfig = { contractId: string; rpcUrl: string; networkPassphrase: string; server?: rpc.Server };

function addressCredentials(entry: xdr.SorobanAuthorizationEntry): xdr.SorobanAddressCredentials {
  const credentials = entry.credentials();
  switch (credentials.switch().name) {
    case "sorobanCredentialsAddress": return credentials.address();
    case "sorobanCredentialsAddressV2": return credentials.addressV2();
    default: throw new Error("Unsupported delegated auth credentials");
  }
}

/** Validate the complete invocation tree before handing authority to a signer. */
export function assertAuthorization(entry: xdr.SorobanAuthorizationEntry, contractId: string, action: ProtectedAction, address: string): void {
  const credentials = addressCredentials(entry);
  if (Address.fromScAddress(credentials.address()).toString() !== address) throw new Error("Unexpected authorization identity");
  const call = actionToCall(action);
  const invoke = (contract: string, method: string, args: xdr.ScVal[], subs: xdr.SorobanAuthorizedInvocation[] = []) => new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(contract).toScAddress(), functionName: method, args,
    })), subInvocations: subs,
  });
  const subs = action.type === "authorize" && address === action.terms.payer ? [invoke(action.terms.token, "transfer", [
    addr(action.terms.payer), addr(contractId), nativeToScVal(BigInt(fundingTotal(action.terms)), { type: "i128" }),
  ])] : [];
  if (!entry.rootInvocation().toXDR().equals(invoke(contractId, call.method, call.args, subs).toXDR())) throw new Error("Unexpected authorization invocation");
}

export class ProtectedEscrowClient {
  readonly contractId: string;
  readonly networkPassphrase: string;
  readonly server: rpc.Server;
  constructor(config: ClientConfig) {
    assertAddress(config.contractId, true);
    if (!config.networkPassphrase) throw new Error("Network passphrase required");
    this.contractId = config.contractId; this.networkPassphrase = config.networkPassphrase;
    this.server = config.server ?? new rpc.Server(config.rpcUrl);
  }
  private raw(source: Account, method: string, args: xdr.ScVal[]): Transaction {
    return new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .setTimeout(120).addOperation(new Contract(this.contractId).call(method, ...args)).build();
  }
  private result(sim: rpc.Api.SimulateTransactionResponse): rpc.Api.SimulateTransactionSuccessResponse & { result: rpc.Api.SimulateHostFunctionResult } {
    if (rpc.Api.isSimulationRestore(sim)) throw new Error("Archived contract data requires restoration. Restore the footprint with the Stellar CLI, then retry; funds remain protected.");
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) throw new Error(`Protected simulation failed: ${"error" in sim ? sim.error : "no result"}`);
    return sim as rpc.Api.SimulateTransactionSuccessResponse & { result: rpc.Api.SimulateHostFunctionResult };
  }
  async read(method: "default_arbiter" | "payment_terms" | "payment_state" | "claim_state" | "case_arbiter" | "payment_hash" | "quote_scope" | "fee_quote" | "version", args: xdr.ScVal[] = []): Promise<unknown> {
    const sim = this.result(await this.server.simulateTransaction(this.raw(new Account(Keypair.random().publicKey(), "0"), method, args)));
    return jsonNative(scValToNative(sim.result.retval));
  }
  async defaultArbiter(): Promise<string> {
    const value = await this.read("default_arbiter"); assertAddress(value); return value;
  }
  async terms(paymentId: string): Promise<PaymentTerms> {
    const raw = await this.read("payment_terms", [bytes(paymentId)]) as PaymentTerms & Record<string,unknown>;
    const t = raw;
    if ("protocol_reserve" in raw) {
      t.fees = Object.fromEntries(["protocol_reserve","arbitration_reserve","protocol_bps","protocol_recipient","custom_fee","default_fee","case_fee_cap","custom_quote","default_quote"].map(key=>[key,raw[key]])) as PaymentTerms["fees"];
      for (const key of Object.keys(t.fees!)) delete raw[key];
    }
    for (const key of ["fund_by", "delivery_deadline", "review_seconds", "response_seconds", "arbiter_seconds", "default_seconds"] as const) t[key] = integer(Number(t[key]));
    return t;
  }
  async state(paymentId: string): Promise<PaymentState> { return await this.read("payment_state", [bytes(paymentId)]) as PaymentState; }
  async claimState(paymentId: string, claimId: number): Promise<Claim> {
    const raw = await this.read("claim_state", [bytes(paymentId), nativeToScVal(integer(claimId, 0, 0xffffffff), { type: "u32" })]) as Record<string, unknown>;
    const status = Array.isArray(raw.status) ? raw.status[0] : raw.status;
    if (!["Review", "Disputed", "Settled"].includes(String(status))) throw new Error("Unsupported claim status");
    for (const key of ["review_until", "response_until", "custom_until", "fallback_at"]) raw[key] = integer(Number(raw[key]));
    return { ...raw, status } as Claim;
  }
  async arbiter(paymentId: string, claimId: number): Promise<string | null> {
    return await this.read("case_arbiter", [bytes(paymentId), nativeToScVal(integer(claimId, 0, 0xffffffff), { type: "u32" })]) as string | null;
  }
  async prepare(source: string, action: ProtectedAction, signAuth?: AuthorizationSigner): Promise<Prepared> {
    if (!StrKey.isValidEd25519PublicKey(source)) throw new Error("Transaction fee source must be a Stellar account");
    if (action.type === "authorize") {
      validateTerms(action.terms, { contractId: this.contractId, defaultArbiter: await this.defaultArbiter(), now: Math.floor(Date.now() / 1000) });
      if (action.terms.fees) {
        const terms=action.terms, fees=terms.fees!, scope=await quoteScope(terms,this.contractId,this.networkPassphrase);
        for (const [id,arbiter,fee] of [[fees.default_quote,terms.default_arbiter,fees.default_fee],[fees.custom_quote,terms.buyer_arbiter,fees.custom_fee]]) {
          if (id === null && fee === "0") continue;
          assertHash(id);
          const quote=await this.read("fee_quote",[bytes(id)]) as Record<string,unknown>;
          if (quote.scope!==scope || quote.arbiter!==arbiter || quote.fee!==fee || Number(quote.valid_until)<terms.fund_by) throw new Error("Accepted arbiter quote is incompatible or stale");
        }
      }
    }
    const call = actionToCall(action);
    const tx = this.raw(await this.server.getAccount(source), call.method, call.args);
    const sim = this.result(await this.server.simulateTransaction(tx, undefined, "record"));
    const auth: xdr.SorobanAuthorizationEntry[] = [];
    for (const entry of sim.result.auth) {
      if (entry.credentials().switch().name === "sorobanCredentialsSourceAccount") { auth.push(entry); continue; }
      const address = Address.fromScAddress(addressCredentials(entry).address()).toString();
      assertAuthorization(entry, this.contractId, action, address);
      if (!signAuth) throw new Error(`Additional authorization required from ${address}`);
      const signed = await signAuth(address, entry, sim.latestLedger + 20);
      assertAuthorization(signed, this.contractId, action, address);
      if (signed.credentials().switch().name !== entry.credentials().switch().name || addressCredentials(signed).nonce().toString() !== addressCredentials(entry).nonce().toString()) throw new Error("Signer changed authorization credentials");
      auth.push(signed);
    }
    let prepared = rpc.assembleTransaction(tx, { ...sim, result: { ...sim.result, auth } }).build();
    if (auth.some(entry => entry.credentials().switch().name !== "sorobanCredentialsSourceAccount")) {
      // Recording mode does not execute custom-account __check_auth. Its policy
      // storage and verification resources must be included before envelope signing.
      const enforced = this.result(await this.server.simulateTransaction(prepared, undefined, "enforce"));
      prepared = rpc.assembleTransaction(prepared, enforced).build();
    }
    return { xdr: prepared.toXDR(), source, contractId: this.contractId, networkPassphrase: this.networkPassphrase };
  }
  async submit(prepared: Prepared, signedXdr: string): Promise<{ tx: string; value: unknown }> {
    if (prepared.contractId !== this.contractId || prepared.networkPassphrase !== this.networkPassphrase) throw new Error("Prepared transaction belongs to another contract/network");
    const original = TransactionBuilder.fromXDR(prepared.xdr, this.networkPassphrase);
    const signed = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    if (!original.hash().equals(signed.hash())) throw new Error("Wallet changed the prepared transaction");
    const sent = await this.server.sendTransaction(signed);
    if (sent.status === "ERROR") throw new Error(`Transaction rejected: ${sent.errorResult?.toXDR("base64") ?? sent.status}`);
    if (sent.status === "TRY_AGAIN_LATER") throw new Error("Network busy; retry this signed transaction before preparing a replacement");
    const done = await this.server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
    if (done.status !== "SUCCESS") throw new Error(`Transaction ${sent.hash}: ${done.status}. Check its status before retrying; it may still be pending.`);
    return { tx: sent.hash, value: done.returnValue ? jsonNative(scValToNative(done.returnValue)) : null };
  }
}
