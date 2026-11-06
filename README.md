# Nyquist402

Protected API payments on Stellar: agree a budget, record delivery claims, review the work and resolve disputes under terms accepted before funding.

## One USDC demo

`/demo` provides Buyer, Seller and Arbiter views over one payment. `/demo/protected` redirects there. The demo uses Circle's official **Stellar testnet USDC**, not an issued demo token. Add the USDC trustline, then visit [Circle's faucet](https://faucet.circle.com/) and select **Stellar Testnet**.

Issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Source: [Circle contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses). Stellar USDC amounts use **seven decimals**. Test XLM is still needed for reserves and fees.

## Run locally

Node 24 and pnpm are required.

```sh
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Keep existing funded credentials in `web/.env.local`; configure settings from [web/.env.example](web/.env.example). The new demo pins the official USDC asset independently of historical DEMO_TOKEN settings.

`node scripts/setup-usdc.mjs` inspects recipient trustlines without changing accounts. Its explicit `--apply` mode adds missing testnet trustlines. `pnpm setup-demo` is only for a new environment and refuses to overwrite existing keys; it creates accounts/trustlines, never an issuer or token mint.

## Versions and availability

| Component | Status |
| --- | --- |
| Protected escrow v1 | Fee-free testnet deployment: `CCQLNKUMUSMJ2L7KAH7VJSCXW6FOBLI3VAPZO4ZLCDEQ4PL76FDXKCEW` |
| Protected escrow v2 | Separate [fee-capable source](contracts/protected-escrow-v2/README.md); requires separate deployment |
| TypeScript SDK | Local v1/v2 source; not an npm release or upstream protected x402 extension |
| Case/history service | Wallet-authenticated private SQLite storage and retained evidence versions |
| Deadline execution | Optional local worker with durable transaction/job reconciliation |
| Basic auth-capture | Historical separate contract/integration reference; no second demo |

No audit or mainnet readiness is claimed. V2 is never silently substituted for a funded v1 payment.

## Data, signing and recovery

The local service authenticates ordinary wallets using a signed, never-broadcast challenge. It checks private case access against onchain parties and the current arbiter. Demo seller/arbiter controls additionally require the exact payment delegation. A payment ID grants no signing authority.

Evidence and delivery bodies are retained privately in `web/.nyquist-data` (or DEMO_DATA_DIR) and checked against onchain hashes. Keep this directory out of Git and static hosting; operators must define backups/retention.

Transaction hashes are persisted before wallet broadcast. Production startup reconciles pending hashes. Optional settlement/fallback submission uses DEMO_WORKER_ENABLED and an explicitly configured funded signer. Unknown submissions reuse their exact signed transaction while valid; they do not create replacement payouts.

See [local SDK](web/lib/protected/README.md), [current docs](web/content/docs/roadmap.mdx), [setup](web/content/docs/setup.mdx) and [unified walkthrough](web/content/docs/quickstart.mdx).

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

The optional existing live testnet script creates funded payments; do not run it unless those test allocations are intended.

## Basic integration history

The separate basic contract is `CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI`. Vendored x402 basic integration and contracts remain available as reference. The [basic proposal](https://github.com/x402-foundation/x402/pull/4124) does not establish a released protected x402 binding.

MIT license.
