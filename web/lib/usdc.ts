import { Asset, Networks } from "@stellar/stellar-sdk";

/** Circle's official Stellar testnet asset, not mainnet USDC. Seven decimals on Stellar. */
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USDC_ASSET = new Asset("USDC", USDC_ISSUER);
export const USDC_CONTRACT = USDC_ASSET.contractId(Networks.TESTNET);
export const USDC_FAUCET = "https://faucet.circle.com/";
export const USDC_DECIMALS = 7;
export const USDC_SOURCE = "https://developers.circle.com/stablecoins/usdc-contract-addresses";
