# Protected SDK and demo integration

## Intent and selected approach

Connect the implemented protected escrow to a reusable local TypeScript SDK and a working wallet demo. The user selected local SDK + demo; changing the separate x402 fork or publishing upstream packages is outside this task.

Approaches considered: extending the local client preserves the current x402 packages and makes protected actions usable immediately; changing the x402 fork requires separate package/spec releases; replacing the basic integration would break compatibility. Selected: local SDK and separate protected demo, preserving the basic demo.

## Implementation boundary

- Add a browser/server-compatible TypeScript client under `web/lib/protected/`. Export typed terms, claims, payment state, exact Soroban encoding, identity computation, read APIs, transaction preparation/signing/submission and all protected mutations. Document how another application imports the client. This is local source, not a published npm package or standardized x402 protection extension.
- Add `/demo/protected` and `/api/protected`. Link from the basic demo. Reuse its visual language, wallet adapter and faucet. Preserve the landing page's final-product messaging.
- Configure `DEMO_PROTECTED_ESCROW` explicitly. Never substitute the basic address. Query `default_arbiter` and fail visibly on missing/incompatible deployment. The request says deployment is okay; no protected ID is currently present in the checkout, so configuration accepts the deployed ID without guessing one or claiming deployment was verified.
- No new protocol/arbitration fees, contract changes, hosted evidence service, payment-wide cases, real inference service, upstream fork changes or mainnet deployment.

## Funding and authority

Buyer and demo seller authorize the identical terms. The buyer signs a prepared transaction envelope; the server signs only the required seller authorization entry. The wallet pays network transaction fees in this first integration; disclose that before signing. Provide a standalone SDK keypair/auth callback path for arbitrary sellers and arbiters.

Funding terms include exact budget/token, agreement text hash, both arbiter preferences, onchain default, fund-by/session deadlines, review/response/custom/default durations, salt and explicit fallback seller share. Display them before the wallet signs. Explain matching preferences select a custom arbiter and disagreements use the default. Show the zero-fee scope and signed fallback split.

Demo-only timing preset (implementation choice, not a production policy): short funding/session/review/response/ruling windows published in the interface. Fallback share must be a visible input, with a clearly labeled example value; no server-only economic decision. Agreement/delivery/evidence bodies stay offchain in the user's browser, with only hashes submitted.

Seller controls are a demonstration delegation scoped to a newly quoted payment through a cryptographically signed capability. Knowing an address/payment hash is insufficient to obtain seller signatures. The capability binds the network, contract, full payment identity and permitted seller actions. It cannot sign buyer or arbiter actions. Bind it to a validated onchain payment before preparing mutations. Do not add an unauthenticated arbiter-signing endpoint or accept arbitrary methods/transaction XDR for server signing.

Buyer actions use the connected payer wallet. Arbiter rulings require the connected wallet to equal the current onchain arbiter and sign the exact award and evidence revision. Timeout settlement/fallback are permissionless transactions. Contract authorization remains the final authority.

## Lifecycle and recovery

1. Connect a testnet wallet and acquire DEMOUSD using the existing faucet.
2. Request/display jointly authorized terms and prepare funding; buyer signs and submits.
3. Seller records independently reserved delivery claims. Buyer may accept the exact commitment or either side may dispute before review expiry.
4. Each party may commit evidence during the response window. Show all review/response/custom/default/fallback deadlines and current arbiter.
5. Undisputed expired claims settle permissionlessly. Current arbiter can submit a bounded split award with the current revision. Expired arbitration uses the signed terminal allocation.
6. After session expiry, reclaim returns only unused budget. Show available, reserved, paid and returned balances independently; never label reserved money reclaimable.
7. Persist payment IDs, exact agreement and scoped seller capability locally, keyed by network/contract/payer. Reload terms/state/claims from chain rather than server Maps. Permit importing a payment ID for direct buyer/arbiter actions without the seller capability. Do not pretend an imported ID grants a role.
8. Simulate before mutations, surface restoration requirements rather than silently dropping protection, wait for confirmed success and refresh chain state. Show pending/failed transactions and transaction links. Complete restoration automation and hosted indexing remain roadmap operations work unless supported directly by the SDK's preparation path.

## Verification and acceptance

Meaningful tests must check encoding/identity against Rust vectors, integer precision, explicit capability/version/policy checks, server signing boundaries, caller roles, independent claims and restart recovery. Exercise the $10/$3 paid/$4 disputed/$3 reclaimable accounting path through an integration harness where network configuration is available; never claim a mocked run is live testnet verification.

Run TypeScript checks, SDK/API tests, a production Next build and existing Rust tests. Review changed code independently before reporting completion. Document exact commands and distinguish locally verified flows from wallet-extension/testnet checks that require external configuration. Update roadmap status only for implemented and verified pieces.
