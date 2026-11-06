import { Buffer } from "buffer";

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
