# Nyquist402

Refundable x402 payments on Stellar. Soroban escrow for the x402 [`auth-capture`](https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture.md) scheme on Stellar.

A payer authorizes a maximum amount once. The resource server can then capture part or all of it, void the remainder, and refund captured funds within a deadline. If the hold is never captured, the payer reclaims it after the capture deadline.

## Status

Work in progress. Not audited. Not deployed.

## Layout

```
contracts/auth-capture-escrow/   Soroban contract
web/                             Landing page
```

## Build

Requires Rust with the `wasm32v1-none` target.

```bash
make build
make test
```

## License

MIT
