# Protected escrow TypeScript client

The client connects buyer, seller and arbiter integrations to Soroban protected escrow. It validates terms, prepares exact authorized calls, reads payment state and tracks transaction confirmation. It supports browser wallet integrations and Node 24 signers.

For service behavior and integration guidance, see the [SDK guide](../../content/docs/sdk.mdx), [client reference](../../content/docs/testnet/sdk.mdx) and [signing example](../../content/docs/testnet/signing.mdx). SDK package distribution is **not fully implemented yet**; the installable release will provide versioned exports and compatibility declarations.

## Prepare and submit funding

Within this project, import the client from `index.ts` and configure the payment’s contract and network. Buyer and seller must agree the complete `terms` before this call:

```ts
import { authorizeEntry, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { ProtectedEscrowClient } from './index.ts';

const client = new ProtectedEscrowClient({
  contractId: protectedContractId,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

const prepared = await client.prepare(buyer.publicKey(), { type: 'authorize', terms },
  async (address, entry, untilLedger) => {
    if (address !== seller.publicKey()) throw new Error('Unexpected signer');
    return authorizeEntry(entry, seller, untilLedger, Networks.TESTNET);
  });
const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
tx.sign(buyer);
const { tx: transactionHash } = await client.submit(prepared, tx.toXDR());
```

Keep each secret key on its signer’s side. Browser integrations use a wallet adapter to sign `prepared.xdr`. `AuthorizationSigner` accepts callbacks for additional signers. Supported Stellar address authorization credentials are accepted; delegated CAP-71 trees are rejected pending validation support.

Preparation checks complete authorization invocation trees and re-simulates completed authorizations in enforcement mode. Submission rejects a changed transaction body and waits for confirmation. Contract checks remain authoritative if state or deadlines change after preparation.

## Terms and exact amounts

`termsToScVal` encodes canonical contract maps and exact i128 amounts. `computePaymentId` binds the full terms to the network and contract. Amounts use integer strings in base units; `parseAmount` handles seven-decimal USDC without floating-point arithmetic.

Protected payments include `terms.fees`, scoped arbiter quotes and separate protocol and arbitration reserves. `fundingTotal(terms)` includes principal and both reserves. Zero-fee offers use the same structure with zero reserve amounts. Each payment remains bound to its original signed agreement and contract.

## Actions and reads

Typed mutations: `authorize`, `claim`, `accept`, `settle`, `dispute`, `submit_evidence`, `rule`, `finalize_fallback`, `reclaim`, `void_unclaimed`.

Reads: `defaultArbiter`, `terms`, `state`, `claimState`, `arbiter`.

Claims are independent. Unused-fund returns preserve pending reservations, and a finalized claim cannot pay twice. A ruling binds the current evidence revision and is bounded by the case principal.

## Recovery and private case data

Retain payment IDs and transaction hashes before broadcast. Reconcile an unknown submission before constructing another claim or payout. Wallet rejection and simulation failures are not successful actions.

The case service authenticates participants with a signed, never-broadcast wallet challenge. Public payment IDs grant neither private evidence access nor signing authority. Evidence bodies are retained with previous versions and verified against their onchain commitments.

Automatic archive recovery is **not fully implemented yet**. Restore the required Soroban footprint explicitly when the client reports a restoration requirement, then prepare the action again. Restoration must preserve the original agreement.

## Run and verify the integration

Use the [repository development instructions](../../../README.md#development) for Node 24, pnpm and service configuration. Keep funded credentials in `.env`, with optional `.env.local` overrides, and back up the private service data directory. Restart the server after changing environment files.

```sh
pnpm test
pnpm typecheck
pnpm build
```

The optional testnet scripts create funded payments. Use them only when those test allocations are intended; fixture tests alone do not verify a live wallet or deployment.
