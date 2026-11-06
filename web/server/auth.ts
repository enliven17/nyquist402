import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Account, BASE_FEE, Horizon, Keypair, Networks, Operation, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { consumeChallenge, getChallenge, saveChallenge } from "./store.ts";

const now = () => Math.floor(Date.now() / 1000);
function secret() {
  const value = process.env.DEMO_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Configure a stable DEMO_SESSION_SECRET of at least 32 characters");
  return value;
}
function mac(value: string) { return createHmac("sha256", secret()).update(value).digest(); }
export async function challenge(address: unknown) {
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address)) throw new Error("Account wallet required for service sign-in");
  const id = randomBytes(24).toString("hex");
  const tx = new TransactionBuilder(new Account(address, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .setTimeout(300).addOperation(Operation.manageData({ name: "Nyquist402 service sign-in", value: Buffer.from(id, "hex") })).build();
  await saveChallenge(id, { address, xdr: tx.toXDR(), expires: now() + 300 });
  return { id, xdr: tx.toXDR(), message: "Sign in to private testnet payment history and evidence. This challenge is never submitted." };
}
export async function authenticate(id: unknown, signedXdr: unknown, loadAccount = (address:string)=>new Horizon.Server("https://horizon-testnet.stellar.org").loadAccount(address)) {
  if (typeof id !== "string" || typeof signedXdr !== "string" || signedXdr.length > 16000) throw new Error("Invalid sign-in");
  const item = await getChallenge(id);
  if (!item || item.expires <= now()) throw new Error("Sign-in challenge expired or already used");
  const signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  const original = TransactionBuilder.fromXDR(item.xdr, Networks.TESTNET);
  if (!(signed instanceof Transaction) || !signed.hash().equals(original.hash()) ||
    !signed.signatures.some(s => Keypair.fromPublicKey(item.address).verify(signed.hash(), s.signature()))) throw new Error("Invalid wallet signature");
  const account=await loadAccount(item.address);
  const master=account.signers.find(s=>s.type==="ed25519_public_key" && s.key===item.address);
  if (!master || master.weight===0 || master.weight<account.thresholds.med_threshold) throw new Error("Service sign-in requires an ordinary account whose master key meets its medium threshold");
  if (!await consumeChallenge(id)) throw new Error("Sign-in challenge expired or already used");
  const value = Buffer.from(JSON.stringify({ v: 1, account: item.address, network: Networks.TESTNET, expires: now() + 1800 })).toString("base64url");
  return { token: value + "." + mac(value).toString("base64url"), expires: now() + 1800 };
}
export function accountFromRequest(req: Request): string {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const [value, signature, extra] = token.split(".");
  if (!value || !signature || extra || token.length > 2048) throw new Error("Sign in with your wallet to access private payment data");
  const supplied = Buffer.from(signature, "base64url"), expected = mac(value);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid service session");
  const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (data.v !== 1 || data.network !== Networks.TESTNET || data.expires <= now() || !StrKey.isValidEd25519PublicKey(data.account)) throw new Error("Service session expired");
  return data.account;
}
