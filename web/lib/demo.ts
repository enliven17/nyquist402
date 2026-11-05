import { randomUUID } from "node:crypto";
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Networks,
  Operation,
  rpc,
  scValToNative,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { authCapture, createEd25519Signer, STELLAR_TESTNET_CAIP2 } from "@x402/stellar";
import { AuthCaptureStellarScheme as AuthCaptureClient } from "@x402/stellar/auth-capture/client";
import { AuthCaptureStellarScheme as AuthCaptureFacilitator } from "@x402/stellar/auth-capture/facilitator";
import {
  AuthCaptureStellarScheme as AuthCaptureServer,
  computePaymentHash,
  paymentInfoFromCollect,
  type AuthCaptureLifecycleManager,
} from "@x402/stellar/auth-capture/server";

const RPC_URL = "https://soroban-testnet.stellar.org";
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FAUCET_AMOUNT = "10";
const QUOTE_TTL_MS = 5 * 60_000;
// Short capture window so a wallet user can see reclaim become available.
const WALLET_CAPTURE_SECONDS = 180;
export const ESCROW = authCapture.AUTH_CAPTURE_ESCROW_ADDRESSES[STELLAR_TESTNET_CAIP2];
export const MAX_AMOUNT = "10000000"; // 1.0 DEMOUSD (7 decimals)

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run: node scripts/setup-demo.mjs`);
  return value;
}

type Demo = {
  token: string;
  agent: string;
  agentKeypair: Keypair;
  merchant: string;
  resourceServer: x402ResourceServer;
  client: x402Client;
  lifecycle: AuthCaptureLifecycleManager;
  rpc: rpc.Server;
};

let demo: Promise<Demo> | undefined;

// ponytail: one in-process facilitator and in-memory payment store; payments are lost on
// restart. Replace with a hosted facilitator and persistent storage for a shared deployment.
function getDemo(): Promise<Demo> {
  demo ??= (async () => {
    const agent = createEd25519Signer(requireEnv("DEMO_AGENT_SECRET"));
    const merchant = createEd25519Signer(requireEnv("DEMO_MERCHANT_SECRET"));
    const operator = createEd25519Signer(requireEnv("DEMO_FACILITATOR_SECRET"));
    const facilitator = new x402Facilitator().register(
      STELLAR_TESTNET_CAIP2,
      new AuthCaptureFacilitator([operator]),
    );
    const facilitatorClient: FacilitatorClient = {
      verify: (p, r) => facilitator.verify(p, r),
      settle: (p, r) => facilitator.settle(p, r),
      getSupported: async () => facilitator.getSupported() as never,
    };
    const scheme = new AuthCaptureServer({ consentSigner: merchant });
    const resourceServer = new x402ResourceServer(facilitatorClient).register(STELLAR_TESTNET_CAIP2, scheme);
    await resourceServer.initialize();
    const client = new x402Client()
      .setSpendControls(false)
      .register(STELLAR_TESTNET_CAIP2, new AuthCaptureClient(agent));
    return {
      token: requireEnv("DEMO_TOKEN"),
      agent: agent.address,
      agentKeypair: Keypair.fromSecret(requireEnv("DEMO_AGENT_SECRET")),
      merchant: merchant.address,
      resourceServer,
      client,
      lifecycle: scheme.createLifecycleManager(facilitatorClient),
      rpc: new rpc.Server(RPC_URL),
    };
  })();
  return demo;
}

export type StepResult = { ok: boolean; tx?: string; amount?: string; paymentHash?: string; error?: string };

function result(r: { success: boolean; transaction?: string; amount?: string; errorReason?: string; errorMessage?: string }, paymentHash?: string): StepResult {
  return r.success
    ? { ok: true, tx: r.transaction, amount: r.amount, paymentHash }
    : { ok: false, error: `${r.errorReason ?? "failed"} ${r.errorMessage ?? ""}`.trim() };
}

// ponytail: in-memory quotes and payment infos, lost on restart like the facilitator store.
const quotes = new Map<string, { accepts: PaymentRequirements[]; expires: number }>();
const payments = new Map<string, ReturnType<typeof paymentInfoFromCollect>>();

/** Builds the 402 response for the metered inference route and remembers its requirements. */
export async function quote(wallet: boolean): Promise<{ quoteId: string; paymentRequired: PaymentRequired }> {
  const d = await getDemo();
  const accepts = await d.resourceServer.buildPaymentRequirements({
    scheme: "auth-capture",
    network: STELLAR_TESTNET_CAIP2,
    price: { amount: MAX_AMOUNT, asset: d.token },
    payTo: d.merchant,
    maxTimeoutSeconds: 120,
    extra: {
      paymentFlow: "escrow",
      captureMode: "deferred",
      captureDeadlineSeconds: wallet ? WALLET_CAPTURE_SECONDS : 3600,
      refundDeadlineSeconds: 86400,
    },
  });
  const paymentRequired = await d.resourceServer.createPaymentRequiredResponse(accepts, {
    url: "https://nyquist402.dev/api/demo/inference",
    description: "Metered inference, billed per token",
    mimeType: "application/json",
  });
  const now = Date.now();
  for (const [id, q] of quotes) if (q.expires < now) quotes.delete(id);
  const quoteId = randomUUID();
  quotes.set(quoteId, { accepts, expires: now + QUOTE_TTL_MS });
  return { quoteId, paymentRequired };
}

/** Settles a signed payload against a quote: the escrow collects the hold before the handler runs. */
export async function pay(
  quoteId: string,
  payload: PaymentPayload,
): Promise<StepResult & { captureDeadline?: number }> {
  const d = await getDemo();
  const q = quotes.get(quoteId);
  if (!q) return { ok: false, error: "quote expired, try again" };
  quotes.delete(quoteId);
  const requirements = d.resourceServer.findMatchingRequirements(q.accepts, payload);
  if (!requirements) return { ok: false, error: "payload does not match the quote" };
  const settled = await d.resourceServer.settlePayment(
    payload,
    requirements,
    undefined,
    undefined,
    undefined,
    "before-handler",
  );
  if (!settled.success) return result(settled);

  const extra = authCapture.parseAuthCaptureExtra(requirements.extra);
  if ("error" in extra) throw new Error(extra.message);
  const info = paymentInfoFromCollect(payload.payload as never, requirements, extra.value);
  const paymentHash = computePaymentHash(info, ESCROW, Networks.TESTNET);
  payments.set(paymentHash, info);
  return { ...result(settled, paymentHash), captureDeadline: extra.value.captureDeadline };
}

/** Server-agent mode: the demo's own agent key pays. */
export async function authorize(): Promise<StepResult> {
  const d = await getDemo();
  const { quoteId, paymentRequired } = await quote(false);
  return pay(quoteId, await d.client.createPaymentPayload(paymentRequired));
}

async function demoAsset(d: Demo): Promise<Asset> {
  const account = await new Horizon.Server(HORIZON_URL).loadAccount(d.agent);
  for (const b of account.balances) {
    if ("asset_code" in b && b.asset_code === "DEMOUSD") {
      const asset = new Asset(b.asset_code, b.asset_issuer);
      if (asset.contractId(Networks.TESTNET) === d.token) return asset;
    }
  }
  throw new Error("demo agent holds no DEMOUSD");
}

async function loadOrFund(horizon: Horizon.Server, address: string) {
  try {
    return await horizon.loadAccount(address);
  } catch {
    const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (!res.ok) throw new Error("friendbot could not fund the account");
    return horizon.loadAccount(address);
  }
}

/**
 * Funds a wallet with testnet XLM and DEMOUSD. Returns a transaction for the wallet to sign when it
 * still needs a trustline; otherwise pays directly.
 */
export async function faucet(address: string): Promise<StepResult & { xdr?: string }> {
  const d = await getDemo();
  const horizon = new Horizon.Server(HORIZON_URL);
  const asset = await demoAsset(d);
  const account = await loadOrFund(horizon, address);
  const line = account.balances.find(
    b => "asset_code" in b && b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  );
  if (line && Number(line.balance) >= Number(FAUCET_AMOUNT)) return { ok: true };

  // ponytail: the faucet draws from the demo agent's DEMOUSD; mint from the issuer if it runs dry.
  const payment = Operation.payment({ source: d.agent, destination: address, asset, amount: FAUCET_AMOUNT });
  if (line) {
    const tx = new TransactionBuilder(await horizon.loadAccount(d.agent), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .setTimeout(60)
      .addOperation(payment)
      .build();
    tx.sign(d.agentKeypair);
    const sent = await horizon.submitTransaction(tx);
    return { ok: true, tx: sent.hash };
  }
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .setTimeout(300)
    .addOperation(Operation.changeTrust({ asset }))
    .addOperation(payment)
    .build();
  tx.sign(d.agentKeypair);
  return { ok: true, xdr: tx.toXDR() };
}

/** Builds the payer's `reclaim` transaction for a payment made in this server's lifetime. */
export async function reclaimTx(address: string, paymentHash: string): Promise<StepResult & { xdr?: string }> {
  const d = await getDemo();
  const info = payments.get(paymentHash);
  if (!info) return { ok: false, error: "unknown payment" };
  if (info.payer !== address) return { ok: false, error: "only the payer can reclaim" };
  const tx = new TransactionBuilder(await d.rpc.getAccount(address), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .setTimeout(300)
    .addOperation(new Contract(ESCROW).call("reclaim", authCapture.paymentInfoToScVal(info)))
    .build();
  try {
    return { ok: true, xdr: (await d.rpc.prepareTransaction(tx)).toXDR(), paymentHash };
  } catch (e) {
    const message = String(e);
    return { ok: false, error: message.includes("#14") ? "the capture deadline has not passed yet" : message };
  }
}

/** Relays a wallet-signed testnet transaction and waits for the result. */
export async function submit(signedXdr: string): Promise<StepResult> {
  const d = await getDemo();
  const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  const sent = await d.rpc.sendTransaction(tx);
  if (sent.status === "ERROR") return { ok: false, error: "transaction rejected by the network" };
  const done = await d.rpc.pollTransaction(sent.hash, { attempts: 30 });
  return done.status === "SUCCESS" ? { ok: true, tx: sent.hash } : { ok: false, error: `transaction ${done.status}` };
}

export const isAccount = (address: string) => StrKey.isValidEd25519PublicKey(address);

export async function capture(paymentHash: string, amount: string, voidRemainder: boolean): Promise<StepResult> {
  const d = await getDemo();
  return result(await d.lifecycle.capture(paymentHash, { amount, voidRemainder }), paymentHash);
}

export async function voidHold(paymentHash: string): Promise<StepResult> {
  const d = await getDemo();
  return result(await d.lifecycle.voidPayment(paymentHash), paymentHash);
}

export async function refund(paymentHash: string, amount: string): Promise<StepResult> {
  const d = await getDemo();
  return result(await d.lifecycle.refund(paymentHash, { amount }), paymentHash);
}

async function tokenBalance(d: Demo, address: string): Promise<string> {
  const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), "0"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .setTimeout(30)
    .addOperation(new Contract(d.token).call("balance", Address.fromString(address).toScVal()))
    .build();
  const sim = await d.rpc.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) return "0";
  return String(scValToNative(sim.result.retval));
}

export async function status(paymentHash?: string, payer?: string) {
  const d = await getDemo();
  const [agent, merchant, escrow] = await Promise.all([
    tokenBalance(d, payer ?? d.agent),
    tokenBalance(d, d.merchant),
    tokenBalance(d, ESCROW),
  ]);
  const state = paymentHash
    ? await authCapture.readPaymentState(d.rpc, Networks.TESTNET, ESCROW, paymentHash)
    : undefined;
  return {
    addresses: { agent: payer ?? d.agent, merchant: d.merchant, escrow: ESCROW, token: d.token },
    balances: { agent, merchant, escrow },
    state: state && {
      collected: state.collected,
      capturable: state.capturable.toString(),
      refundable: state.refundable.toString(),
    },
  };
}
