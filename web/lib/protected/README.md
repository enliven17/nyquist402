# Local protected escrow SDK

Reusable TypeScript source for `contracts/protected-escrow`, usable in a browser or Node 24. It uses the project's locked Stellar SDK 16.4.1. Import `index.ts` into another TypeScript application along with its Stellar SDK dependency, or use the same imports inside this app. This is not a published npm package or an upstream x402 protection extension. The vendored basic `auth-capture` packages are unchanged.

## Run the demo

```sh
cd web
pnpm install --frozen-lockfile
pnpm setup-demo # once; refuses to overwrite existing funded credentials
```

For an existing `.env.local`, keep its keys/token. Set `DEMO_PROTECTED_ESCROW=CCQLNKUMUSMJ2L7KAH7VJSCXW6FOBLI3VAPZO4ZLCDEQ4PL76FDXKCEW` (the testnet deployment recorded in the repository README) and `DEMO_SESSION_SECRET` (a stable random secret of at least 32 characters; use the generator in `.env.example`). Optionally add `DEMO_SELLER_ARBITER` for the seller's custom preference. Restart the server after configuration changes.

```sh
pnpm dev
# http://localhost:3000/demo
```

The app reads the deployment's default arbiter and verifies its `payment_hash` against the SDK before quoting. Missing, archived or incompatible deployments fail visibly; the app never falls back to the basic contract. The repository records the protected testnet address and default arbiter in the root README. The integration still requires explicit deployment configuration.

Connect a testnet wallet and acquire 10 USDC. Request a quote, review the exact agreement/policy and sign the funding transaction. The wallet pays network fees in test XLM. This demo has zero protocol/arbitration fees.

The six-minute session uses a 120-second claim review, at least a 60-second evidence response, and 90 seconds per applicable arbiter stage. These are demonstration presets, not production recommendations. A 50% seller fallback share is an editable example shown before funding. Both parties sign its exact value; neither an API caller nor the project can change it afterward.

Seller controls delegate only this test payment to its browser holder using an unforgeable capability. They demonstrate the seller side; production sellers retain their own signing policy. Buyer actions require the buyer's wallet. Before funding, the buyer picks an arbiter from the demo roster (`DEMO_ARBITER_SECRETS`); the demo seller agrees to any listed arbiter, so the contract selects it. Listed arbiters are operated by the demo server and charge no fee: after evidence closes, the `arbitrate` operation signs a bounded ruling only as the arbiter that currently holds the case. Arbiters outside the roster still rule from their own wallet.

Claims are independent. Accept one, dispute another, and let the session expire: reclaim returns only unused funds while reviewed/disputed reservations stay locked. Seller early return uses the same available bucket. After an arbitration timeout, anyone can submit the jointly agreed fallback.

## Use the SDK

```ts
import { authorizeEntry, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { ProtectedEscrowClient } from './lib/protected/index.ts';

const client = new ProtectedEscrowClient({
  contractId: protectedContractId,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

// The fee source's account authority is provided by its transaction-envelope signature.
// Additional parties sign their exact authorization entries through this callback.
const prepared = await client.prepare(buyer.publicKey(), { type: 'authorize', terms },
  async (address, entry, untilLedger) => {
    if (address !== seller.publicKey()) throw new Error('Unexpected signer');
    return authorizeEntry(entry, seller, untilLedger, Networks.TESTNET);
  });
const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
tx.sign(buyer);
const { tx: transactionHash } = await client.submit(prepared, tx.toXDR());
```

For wallets, call `signTransaction(prepared.xdr, connectedAddress)` instead of keypair signing. `AuthorizationSigner` accepts a callback for external/custom account signers; Ed25519 keypairs can use Stellar's `authorizeEntry`. Ordinary legacy and AddressV2 credentials are supported. Delegated CAP-71 credential trees are explicitly rejected in this first SDK; a future integration must validate their expanded authority before enabling them.

`termsToScVal` encodes sorted contract maps, exact i128 amounts and optional addresses. `computePaymentId` binds full terms to the network and contract. A committed Rust-produced fixture checks byte-for-byte encoding and identity. Amounts use integer strings; do not convert them to floating point. The demo's `parseAmount` handles seven-decimal USDC values exactly.

Typed mutations: `authorize`, `claim`, `accept`, `settle`, `dispute`, `submit_evidence`, `rule`, `finalize_fallback`, `reclaim`, `void_unclaimed`. Reads: `defaultArbiter`, `terms`, `state`, `claimState`, `arbiter`. `prepare` validates full authorization invocation trees before additional signatures and re-simulates completed authorizations in enforcement mode to include custom-account authentication footprints/resources; `submit` rejects a changed wallet envelope and waits for confirmed success. Contract checks remain authoritative when state/deadlines change between preparation and submission.

## Recovery and errors

Browser history is scoped to network/contract/connected account and preserves payment IDs, agreement text and demo seller capabilities. Keep capabilities private: possession intentionally grants the listed seller demo controls. Anyone may import an ID to read state; importing it grants no role. After reload or server restart, terms/balances/claims come from the contract, not an in-memory payment registry. Claims are paginated, 20 at a time. SQLite also retains transaction activity and authenticated payment history across sessions. Reconnect and sign the service challenge to access private records; imported IDs alone grant only public reads.

Funding IDs are saved before submission so a delayed confirmation remains recoverable. A saved ID is not proof of funding. A pending transaction error includes its transaction hash: check that hash or read the payment/claim before rebuilding, to avoid accidentally creating a second claim. Wallet rejection and simulation failures do not produce a success entry.

Delivery/evidence bodies are now stored privately in the local SQLite service before their hashes are submitted. Retrieval checks payment membership/current arbiter authority; old body versions are retained and the UI verifies their hashes. The operator must back up the private data directory and define retention. This is a local/self-hosted implementation, not a managed public service.

Archived entries produce an explicit restoration error before requesting an additional signature. Restore the required contract/record footprint with Stellar tooling and prepare again. Automated restoration, instance/code TTL maintenance, hosted event indexing/deadline jobs and real extension verification remain operational work. This SDK does not silently submit restoration transactions or claim tested archive recovery.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build
# Optional real testnet flow; requires configured/funded demo credentials and deployment:
node --env-file=.env.local --experimental-strip-types scripts/e2e-protected.ts --reclaim
```

The live script creates a 10-unit payment, pays 3, disputes 4, recovers state with a fresh client, and optionally waits for session expiry before reclaiming exactly the unused 3. It leaves the disputed claim reserved and prints a recovery ID. Do not run it against funds you did not intend to allocate to this test. Unit/RPC-fixture tests are not live testnet or browser-wallet verification.


## Unified USDC demo and v2

The one demo is `/demo`, with Buyer, Seller and Arbiter views. Add the official Circle Stellar testnet USDC trustline, then visit https://faucet.circle.com/ and choose Stellar Testnet. No issuer or mint operation is used. Existing environment keys are preserved; `node scripts/setup-usdc.mjs` reports missing recipient trustlines without changing accounts.

V1 stays fee-free. Separate `contracts/protected-escrow-v2` source adds `terms.fees`, canonical v2 encoding, scoped onchain arbiter quotes, extra funding reserves and exactly-once fee payouts. Set `DEMO_PROTECTED_VERSION=2` only with a matching separately deployed v2 address. `fundingTotal(terms)` includes principal and both reserves. Paid demo quotes require configured arbiter signers.

The private service uses a wallet-signed, never-broadcast challenge. Service sign-in currently supports ordinary accounts whose master key meets their medium threshold. Transaction signatures still determine contract authority. The production server reconciles pending hashes; optional deadline submission requires `DEMO_WORKER_ENABLED=true` and an intentionally configured funded signer.
