import { Asset, BASE_FEE, Horizon, Networks, Operation, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { USDC_ASSET } from "../lib/usdc.ts";
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");

export async function trustline(address: unknown) {
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address)) throw new Error("Invalid wallet address");
  const account = await horizon.loadAccount(address);
  if (account.balances.some(b => "asset_code" in b && b.asset_code === "USDC" && b.asset_issuer === USDC_ASSET.getIssuer())) return {};
  return { xdr: new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .setTimeout(120).addOperation(Operation.changeTrust({ asset: USDC_ASSET })).build().toXDR() };
}
export async function submitTrustline(address: unknown, xdr: unknown) {
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address) || typeof xdr !== "string" || xdr.length > 16000) throw new Error("Invalid trustline transaction");
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  if (!(tx instanceof Transaction) || tx.source !== address || tx.operations.length !== 1 || tx.memo.type !== "none" || tx.sequence === "0") throw new Error("Only a wallet trustline transaction is accepted");
  const op = tx.operations[0];
  if (op.type !== "changeTrust" || (op.source && op.source !== address) || !(op.line instanceof Asset) || !op.line.equals(USDC_ASSET) || op.limit === "0") throw new Error("Only the official testnet USDC trustline is accepted");
  const result = await horizon.submitTransaction(tx);
  return { tx: result.hash };
}

export async function usdcStatus(address:unknown) {
  if(typeof address!=="string" || !StrKey.isValidEd25519PublicKey(address)) throw new Error("Invalid wallet address");
  const account=await horizon.loadAccount(address);
  const line=account.balances.find(b=>"asset_code" in b && b.asset_code==="USDC" && b.asset_issuer===USDC_ASSET.getIssuer());
  return {trustline:!!line,balance:line?.balance??"0",asset:"USDC",issuer:USDC_ASSET.getIssuer(),network:"Stellar Testnet"};
}
