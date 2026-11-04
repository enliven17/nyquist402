# Nyquist402

Refundable x402 payments on Stellar. Soroban escrow for the x402 [`auth-capture`](https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture.md) scheme on Stellar.

A payer authorizes a maximum amount once. The resource server can then capture part or all of it, void the remainder, and refund captured funds within a deadline. If the hold is never captured, the payer reclaims it after the capture deadline.

## Status

Work in progress. Not audited.

| Contract | Testnet |
| --- | --- |
| `AuthCaptureEscrow` | `CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI` |
| `ProtectedEscrow` | `CCQLNKUMUSMJ2L7KAH7VJSCXW6FOBLI3VAPZO4ZLCDEQ4PL76FDXKCEW` |

`ProtectedEscrow` default arbiter on testnet: `GDNHZLVUYH5AHUBQWMSB3BK7ZYCSCOZRQQT7CJT3REDJGRK2SI7ZV67B`.

## Layout

```
contracts/auth-capture-escrow/   Soroban contract
contracts/protected-escrow/     Protected settlement contract (testnet)
web/                             Landing page and testnet demo
```

## Contract

| Function | Authorized by | Effect |
| --- | --- | --- |
| `authorize(payment_info)` | operator, payer | Moves `max_amount` into escrow as a hold |
| `charge(payment_info, amount, fee_amount, fee_receiver)` | operator, payer, consent | Pays `amount` and returns the rest to the payer |
| `capture(payment_info, amount, fee_amount, fee_receiver, void_remainder)` | operator, consent | Pays `amount` from the hold; optionally releases the rest |
| `void(payment_info)` | operator, consent | Returns the remaining hold to the payer |
| `refund(payment_info, amount, funder)` | operator, consent, funder | Moves `amount` from `funder` to the payer |
| `reclaim(payment_info)` | payer | Returns the hold after `authorization_expiry` |

The payer authorizes `[payment_info]` only, with the token transfer into the escrow as a sub-invocation. The consent address is `receiver_authorizer`, or `receiver` when unset, and authorizes the exact call arguments.

## Protected settlement contract

[`contracts/protected-escrow`](contracts/protected-escrow/README.md) implements a separate, versioned contract with per-claim reservations. Both parties approve the funding terms and arbiter policy. Each seller claim has an independent review period; either party can dispute it, and the agreed arbiter (or pinned project default) can allocate only that claim's funds.

After the session expires, `reclaim` returns only unused funds. Claims under review or dispute stay reserved. For example, after 300 units are paid and 400 are disputed from a 1,000-unit deposit, reclaim returns only the unused 300 units.

The contract also implements evidence commitments, custom-to-default arbiter deadline escalation and permissionless execution of a jointly signed timeout-allocation policy. It charges zero arbitration fees in this version. The local [TypeScript SDK and protected demo](web/lib/protected/README.md) now expose that lifecycle at `/demo/protected`. The basic `/demo` and vendored x402 packages retain their original behavior. It is deployed on testnet and not audited. Configure `DEMO_PROTECTED_ESCROW` explicitly with the protected address listed above. Hosted arbitration, fee support, pre-claim cases, upstream x402 integration and a formal audit remain roadmap work.

## Build

The workspace pins Rust 1.91.1 with `rust-toolchain.toml`: Soroban SDK 29.0.1 needs at least Rust 1.91, and Stellar CLI rejects the 1.91.0 compiler for contract builds. It includes the `wasm32v1-none` target, rustfmt and Clippy. `make build` additionally uses stellar-cli 25.2 or later.

```bash
make build
make test
```

Soroban SDK 29 requires Stellar CLI's spec-shaking build step. Use `make build` / `stellar contract build`; a plain `cargo build --target wasm32v1-none` is not a deployable-contract build for this SDK.

## Demo

`web/` includes a testnet payment-lifecycle demo at `/demo`: a payer authorizes a budget, and the server captures, voids, or refunds it. Capture amounts are controlled by the demo; an actual metered API is still planned. The demo uses the basic `@x402/stellar` auth-capture mechanism from the x402 fork, packed into `web/vendor/`.

```bash
cd web
pnpm install
pnpm setup-demo   # once: funds accounts, issues DEMOUSD; preserves existing credentials
pnpm dev          # http://localhost:3000/demo
```

For the protected flow, add the settings from [`web/.env.example`](web/.env.example), then open `/demo/protected`. The [local SDK guide](web/lib/protected/README.md) covers signing, claims/disputes, arbiter actions, restart recovery and the optional live testnet script. Browser/imported payment IDs grant no signing authority.

```sh
cd web
pnpm test
pnpm typecheck
pnpm build
```

## License

MIT
