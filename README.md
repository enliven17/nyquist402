# Nyquist402

Refundable x402 payments on Stellar. Soroban escrow for the x402 [`auth-capture`](https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture.md) scheme on Stellar.

A payer authorizes a maximum amount once. The resource server can then capture part or all of it, void the remainder, and refund captured funds within a deadline. If the hold is never captured, the payer reclaims it after the capture deadline.

## Status

Work in progress. Not audited.

| Network | `AuthCaptureEscrow` |
| --- | --- |
| Testnet | `CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI` |

## Layout

```
contracts/auth-capture-escrow/   Soroban contract
web/                             Landing page and testnet demo
docs/                            SCF application draft
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

## Build

Requires Rust with the `wasm32v1-none` target and stellar-cli 25.2 or later.

```bash
make build
make test
```

## Demo

`web/` includes a testnet demo at `/demo`: an agent pays a metered API with `auth-capture`, and the server captures, voids, or refunds. The demo uses the `@x402/stellar` auth-capture mechanism from the x402 fork, packed into `web/vendor/`.

```bash
cd web
pnpm install
pnpm setup-demo   # funds testnet accounts, issues DEMOUSD, writes .env.local
pnpm dev          # http://localhost:3000/demo
```

## License

MIT
