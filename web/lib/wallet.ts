"use client";

import { Buffer } from "buffer";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";

const TESTNET = "Test SDF Network ; September 2015";

// The x402 Stellar client uses Node's Buffer for salts and signatures.
globalThis.Buffer ??= Buffer;

async function kit() {
  const [{ StellarWalletsKit }, { FreighterModule }, { xBullModule }, { HanaModule }, { Networks }] =
    await Promise.all([
      import("@creit.tech/stellar-wallets-kit"),
      import("@creit.tech/stellar-wallets-kit/modules/freighter"),
      import("@creit.tech/stellar-wallets-kit/modules/xbull"),
      import("@creit.tech/stellar-wallets-kit/modules/hana"),
      import("@creit.tech/stellar-wallets-kit/types"),
    ]);
  StellarWalletsKit.init({
    modules: [new FreighterModule(), new xBullModule(), new HanaModule()],
    network: Networks.TESTNET,
  });
  return StellarWalletsKit;
}

let ready: ReturnType<typeof kit> | undefined;
const getKit = () => (ready ??= kit());

/** Opens the wallet picker and returns the connected address. */
export async function connect(): Promise<string> {
  const k = await getKit();
  const { address } = await k.authModal();
  const { networkPassphrase } = await k.getNetwork().catch(() => ({ networkPassphrase: TESTNET }));
  if (networkPassphrase !== TESTNET) throw new Error("Switch your wallet to Testnet and connect again.");
  return address;
}

export async function disconnect(): Promise<void> {
  await (await getKit()).disconnect();
}

/** Signs a transaction envelope with the connected wallet. */
export async function signTransaction(xdr: string, address: string): Promise<string> {
  const { signedTxXdr } = await (await getKit()).signTransaction(xdr, { address, networkPassphrase: TESTNET });
  return signedTxXdr;
}

/** Builds and signs an x402 auth-capture payment with the connected wallet as payer. */
export async function createPayment(address: string, required: PaymentRequired): Promise<PaymentPayload> {
  const k = await getKit();
  const [{ x402Client }, { AuthCaptureStellarScheme }] = await Promise.all([
    import("@x402/core/client"),
    import("@x402/stellar/auth-capture/client"),
  ]);
  const signer = {
    address,
    signAuthEntry: (preimage: string, opts?: { networkPassphrase?: string }) =>
      k.signAuthEntry(preimage, { address, networkPassphrase: opts?.networkPassphrase ?? TESTNET }),
  };
  const client = new x402Client()
    .setSpendControls(false)
    .register("stellar:testnet", new AuthCaptureStellarScheme(signer));
  return client.createPaymentPayload(required);
}
