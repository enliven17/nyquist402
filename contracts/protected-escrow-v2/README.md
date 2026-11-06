# Protected escrow v2

Fee-capable version of the protected claim lifecycle. Deployed on Stellar testnet at `CBX657PJAHLHBNVZASBJPRJFKWKYAGFCKMEE5A57I3ZNPWO5RPKPOMEH` (Wasm `5255843a…630c`). The v1 contract and its deployment are unchanged. Not audited.

Both parties authorize the full agreement; the payer transfers principal + protocol reserve + arbitration reserve. Each claim reserves disjoint principal and fee capacity. Reclaim/early return touches only free buckets.

## Fee policy

- Protocol fee: floor(seller award × protocol basis points / 10000), paid on finalization from its separate reserve.
- Claim capacity: floor(claim amount × basis points / 10000), plus the maximum applicable custom/default ruling fee.
- A valid ruling earns exactly one accepted arbiter fee. A timed-out arbiter earns none.
- Unused case fee capacity returns to the buyer at finalization. Unallocated reserves can be returned with unused principal.
- The funded arbitration reserve and per-case cap bound exposure; insufficient capacity rejects a new claim.
- All economic effects are atomic and shared by direct/relayed finalization paths.

## Quotes

`register_quote(FeeQuote)` requires the quoted arbiter's authorization. A quote contains scope, arbiter, fee, valid_until and salt. Its ID is SHA-256 of its canonical Soroban XDR.

`quote_scope(terms)` binds the network ID, deployment and complete terms (with quote identifiers cleared) under `nyquist402:quote-scope:v2`. Funding checks the exact fee, authority, scope and expiry through fund_by. Payment uniqueness/salt prevents unrelated reuse. Zero-fee arbitration can omit a quote.

Additional entry points: `version()`, `fee_quote(id)`, `register_quote(quote)`, `quote_scope(terms)`. Existing claim lifecycle method names are preserved with versioned terms/state encodings. The SDK groups extra term fields under `fees` and flattens them onchain.

## Verification

```sh
cargo test --workspace --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
stellar contract build
```

Rust/TypeScript parity vectors cover the v2 canonical terms and payment identity. Tests cover principal/fee conservation, quote authority/binding, insufficient capacity, custom-to-default escalation, unearned returns and duplicate payout rejection.

A new deployment, USDC recipient trustlines, operational retention/recovery and independent review are required before activating paid settlement. Existing v1 records cannot be interpreted using v2 terms.
