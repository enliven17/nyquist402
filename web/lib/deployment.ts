import { StrKey } from "@stellar/stellar-sdk";

/** Verified Stellar testnet deployment, source hash checked after creation. */
export const PROTECTED_CONTRACT = "CBX657PJAHLHBNVZASBJPRJFKWKYAGFCKMEE5A57I3ZNPWO5RPKPOMEH";
export const PROTECTED_WASM = "5255843a1c91758b3a4e1b157170387d1a70df613fe9be217bdb5a2d7f02630c";
export const PROTECTED_DEPLOY_TX = "10c4d3ffbe586b975a5b20d34fe42f867b711c35396f0e0ec5479dde35ae0ea1";

export function resolveProtectedDeployment(environment: {
  DEMO_PROTECTED_ESCROW?: string;
  DEMO_PROTECTED_VERSION?: string;
}): { contractId: string; version: 2 } {
  const configuredVersion = environment.DEMO_PROTECTED_VERSION?.trim();
  if (configuredVersion && configuredVersion !== "2") throw new Error("Unsupported protected payment schema configuration");
  const contractId = environment.DEMO_PROTECTED_ESCROW?.trim() || PROTECTED_CONTRACT;
  if (!StrKey.isValidContract(contractId)) throw new Error("Invalid protected escrow contract address");
  return { contractId, version: 2 };
}
