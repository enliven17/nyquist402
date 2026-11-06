# Nyquist402

Protected API payments on Stellar. Agree a work budget, review delivery claims and resolve disputes under terms accepted before funding.

## How it works

1. Buyer and seller agree delivery criteria, budget, deadlines, arbiters, fees and a terminal fallback.
2. The buyer funds Soroban escrow under the exact signed terms.
3. The seller records delivery claims, each with its own reserved amount and review window.
4. The buyer accepts a claim or either party disputes it before review closes.
5. Acceptance, undisputed settlement, a valid ruling or the agreed fallback finalizes the claim. Unused funds return without consuming active reservations.

Protected escrow tracks principal, protocol-fee reserves and arbitration reserves separately. An arbiter can allocate only the disputed claim’s principal and earn only its accepted fee. A service cannot change the funded agreement or finalize a claim twice.

## Try the testnet demo

The `/demo` interface includes Buyer, Seller and Arbiter views for one payment. Connect a Stellar testnet wallet with test XLM, add the official USDC trustline and obtain USDC from [Circle’s faucet](https://faucet.circle.com/) using **Stellar Testnet**.

USDC issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Stellar USDC uses seven decimals. The protected testnet escrow is `CBX657PJAHLHBNVZASBJPRJFKWKYAGFCKMEE5A57I3ZNPWO5RPKPOMEH`. Every payment remains bound to its signed agreement and contract.

## Documentation

The website’s `/docs` explains the [payment model](web/content/docs/index.mdx), [API payment negotiation](web/content/docs/integration.mdx), [SDK integration](web/content/docs/sdk.mdx), [evidence access](web/content/docs/services/evidence.mdx) and [recovery](web/content/docs/protected/recovery.mdx).

Protected x402 negotiation, SDK package distribution, the public facilitator API, managed service guarantees and automatic storage recovery are **not fully implemented yet**. The [service roadmap](web/content/docs/roadmap.mdx) explains how these features will work. The testnet contracts are unaudited; mainnet service is not fully implemented yet.

## Development

Use Node 24 and pnpm:

```sh
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Configure testnet service credentials in `web/.env`; `web/.env.local` is an optional override. Set `DEMO_MERCHANT_SECRET`, a stable `DEMO_SESSION_SECRET` of at least 32 characters and `DEMO_ARBITER_SECRETS` for the operated arbitration accounts. Restart after configuration changes. Both development and production startup load these files; externally supplied environment variables take precedence.

Preserve existing funded keys and keep secrets out of Git. For a new environment, `pnpm setup-demo` creates testnet accounts and USDC trustlines and refuses to recreate credentials when either configuration file already exists.

`node scripts/setup-usdc.mjs` inspects recipient trustlines. Its explicit `--apply` mode adds missing testnet trustlines. The demo uses official USDC rather than minting a token.

Keep private service data in `web/.nyquist-data` (or `DEMO_DATA_DIR`) out of Git and static hosting. Wallet sign-in controls private history and evidence access; transaction signatures separately control fund movements. See the [client guide](web/lib/protected/README.md) for integration and verification details.

## Verify

```sh
cargo test --workspace --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
stellar contract build
cd web
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

The optional testnet scenario scripts allocate test funds; run them only for intended test payments.

MIT license.
