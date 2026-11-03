import "server-only";
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
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

/** The agent requests the paid resource; the server collects the hold before running the handler. */
export async function authorize(): Promise<StepResult> {
  const d = await getDemo();
  const accepts = await d.resourceServer.buildPaymentRequirements({
    scheme: "auth-capture",
    network: STELLAR_TESTNET_CAIP2,
    price: { amount: MAX_AMOUNT, asset: d.token },
    payTo: d.merchant,
    maxTimeoutSeconds: 120,
    extra: { paymentFlow: "escrow", captureMode: "deferred", captureDeadlineSeconds: 3600, refundDeadlineSeconds: 86400 },
  });
  const required = await d.resourceServer.createPaymentRequiredResponse(accepts, {
    url: "https://nyquist402.dev/api/demo/inference",
    description: "Metered inference, billed per token",
    mimeType: "application/json",
  });
  const payload: PaymentPayload = await d.client.createPaymentPayload(required);
  const requirements = d.resourceServer.findMatchingRequirements(accepts, payload) as PaymentRequirements;
  const settled = await d.resourceServer.settlePayment(payload, requirements, undefined, undefined, undefined, "before-handler");

  const extra = authCapture.parseAuthCaptureExtra(requirements.extra);
  if ("error" in extra) throw new Error(extra.message);
  const info = paymentInfoFromCollect(payload.payload as never, requirements, extra.value);
  return result(settled, computePaymentHash(info, ESCROW, Networks.TESTNET));
}

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

export async function status(paymentHash?: string) {
  const d = await getDemo();
  const [agent, merchant, escrow] = await Promise.all([
    tokenBalance(d, d.agent),
    tokenBalance(d, d.merchant),
    tokenBalance(d, ESCROW),
  ]);
  const state = paymentHash
    ? await authCapture.readPaymentState(d.rpc, Networks.TESTNET, ESCROW, paymentHash)
    : undefined;
  return {
    addresses: { agent: d.agent, merchant: d.merchant, escrow: ESCROW, token: d.token },
    balances: { agent, merchant, escrow },
    state: state && {
      collected: state.collected,
      capturable: state.capturable.toString(),
      refundable: state.refundable.toString(),
    },
  };
}
