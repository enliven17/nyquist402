# Protected Escrow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. Steps use checkbox syntax for tracking.

**Goal:** Implement the agreed $10 example: already paid funds stay paid, unused funds become reclaimable at session expiry, and claim/dispute reservations remain locked until authorized settlement.

**Architecture:** Add `contracts/protected-escrow` as a separately deployed, explicitly versioned Soroban contract. Preserve the original contract ABI and vendored SDK. Buyer and seller authenticate the complete funding terms; matching custom arbiter preferences select that arbiter, otherwise the deployment's immutable default is selected. Reserve each claim from available budget and adjudicate it independently.

**Tech Stack:** Rust 1.91.1, Soroban SDK 29.0.1, existing Cargo workspace.

**Spec:** [roadmap.md](../../../roadmap.md), especially payout eligibility, bilateral disputes, selected/default arbiters, and repeated-claim accounting. This task implements the onchain foundation, not the remaining hosted SDK/console/service roadmap.

## Global Constraints

- Existing testnet deployment and basic contract APIs remain unchanged.
- Protected payment identity commits to network, new contract and full signed terms; both buyer and seller authorize funding.
- `PaymentTerms` contains payer, seller, token, max_amount, funding/session deadlines, buyer/seller preferred arbiters, pinned default, review/response/custom/default durations, fallback seller share in basis points, and salt.
- Fallback allocation is an explicit jointly signed term; no hardcoded economic outcome or administrator discretion. The first contract has zero service/arbitration fees; paid arbitration remains D2.
- Claims have a monotonically assigned ID, immutable amount/delivery commitment and review deadline. Pending claims reserve funds; accepting one never approves another.
- Either party may dispute a pending claim before review expiry, submit evidence during a bounded response period, and access the contract without operator cooperation.
- The response period cannot cut short the original review period. Custom authority expires before default authority; default authority expires before permissionless terminal fallback. Late rulings are rejected.
- This foundation covers claim-level disputes. Pre-claim/payment-wide cases and product-level fee configuration remain explicitly tracked as future work.
- No deployment, mainnet transaction or change to website product claims. Branch publication is authorized separately by the user.

## Review Focus

- Session expiry/remainder return while reservations exist must return only the unclaimed balance.
- Concurrent claims and repeated calls must never oversubscribe or spend the same reservation twice.
- Nonparties, stale acceptance commitments, stale evidence revisions and expired arbiter authority must not move funds.
- All parties offline must still permit transaction-triggered, pre-agreed bounded fallback; no losing-party veto.
- Timestamp/amount overflow, fee-free conservation, rollback and cross-payment isolation must remain correct at extreme inputs.

## Task 1: Test harness and reserved balances

**Files:** `contracts/protected-escrow/{Cargo.toml,src/lib.rs,src/types.rs,src/test.rs}`, workspace lockfile, `rust-toolchain.toml`.

**Interfaces:** `authorize(terms) -> payment_id`; `claim(payment_id, amount, delivery_hash) -> claim_id`; `payment_state(payment_id)`; `claim_state(payment_id, claim_id)`; `accept(payment_id, claim_id, commitment)`; `settle(payment_id, claim_id)`; `reclaim(payment_id)`; `void_unclaimed(payment_id)`.

- [x] Write failing tests for separate available/reserved accounting and the $10/$3/$4/$3 example.
- [x] Observe missing protected API failure, then implement terms validation, authorization, immutable claim commitments and escrow transfer/accounting.
- [x] Verify claim settlement and reclaim preserve reservations, including review crossing the session deadline, repeated claims, oversubscription and zero/negative amounts.

## Task 2: Bilateral disputes and bounded resolution

**Interfaces:** `dispute(payment_id, claim_id, party, evidence)`; `submit_evidence(payment_id, claim_id, party, evidence)`; `rule(payment_id, claim_id, seller_amount, expected_revision)`; `finalize_fallback(payment_id, claim_id)`; `case_arbiter(payment_id, claim_id)`.

- [x] Write failing tests for both-party dispute initiation, reserved-fund locking, agreed/default selection, evidence windows and exact authority boundaries.
- [x] Implement authenticated case/evidence state, immutable deadline ordering, scoped rulings and deterministic default escalation/fallback.
- [x] Verify partial awards, no duplicate payout, stale revisions/commitments, unauthorized actions and maximum-integer-safe fallback calculation.

## Task 3: Regression, events and operational verification

- [x] Add lifecycle events sufficient to reconstruct policy, claim and case state without exposing evidence bodies.
- [x] Add exact authorization-tree tests and a mixed-operation accounting invariant test across multiple payments/claims.
- [x] Run all workspace tests, Rust formatting, Clippy with warnings denied, and `stellar contract build --locked` (SDK 29 requires spec shaking).
- [x] Request an independent code review, address material findings with reproducing tests and rerun relevant verification.

## Task 4: Documentation and accurate roadmap status

- [x] Document protected APIs, direct submission, jointly signed timeout allocation, zero-fee scope and separate contract deployment/SDK requirements.
- [x] Update roadmap only for verified implemented contract pieces; hosted services, fee policy, pre-claim cases, SDK integration, audit and mainnet remain open.
- [x] Record actual test/build evidence and limitations. Leave reviewable changes on `feat/protected-escrow-reclaim` without publishing or deploying.

## Execution record

User authorized implementation following review of the roadmap. Execute inline on a dedicated branch in the existing clean checkout; no worktree created. Initial baseline was blocked by missing dependencies and Rust 1.90 versus the locked SDK's Rust 1.91 minimum. Fetch locked dependencies and install the required toolchain without changing the dependency versions.

### Review and environment record

- Baseline: all 24 original tests passed on Rust 1.91.0. New API tests initially failed on missing exports before implementation. Agreement-binding test failed on the absent field before it was added.
- The independent reviewer found no actionable code defect in the frozen protected contract. Added follow-up coverage for failed second-transfer rollback, explicit permissionless review settlement, and fallback endpoints. The transfer-failure test initially failed because the test issuer lacked AUTH_REVOCABLE; enabled that flag in the test fixture, then verified full rollback and successful retry. No production logic changed for this fixture correction.
- Ruling: scope is the requested onchain claim/reservation/reclaim foundation, with zero arbitration fees and no pre-claim/payment-wide cases or SDK/UI/service deployment. These remain tracked in the roadmap; claiming the full product is implemented would be incorrect.
- Ruling: the terminal seller share is a jointly signed input, not a hidden product default. A production preset must be chosen/disclosed separately.
- Ruling: use Rust 1.91.1, because the locked SDK needs at least 1.91 and Stellar CLI rejects compiler 1.91.0 for Wasm builds. Use actual Stellar CLI spec shaking rather than bypassing the SDK check. Official CLI 25.2.0 was downloaded to /private/tmp and verified against the official release SHA-256.
- Deferred verification: network-like archival/restoration testing remains a deployment prerequisite; local code documents TTL caps and restores as a caller/operations responsibility. No claim of network recovery verification or formal audit.

### Final verification

- Rust 1.91.1: `cargo test --workspace --locked --offline` — 45 passed (24 basic + 21 protected), zero failures/ignored tests.
- `cargo fmt --all -- --check` and `git diff --check` — clean.
- Rust 1.91.1: `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` — passed.
- Official Stellar CLI 25.2.0 with `CARGO_NET_OFFLINE=true`: `stellar contract build --locked` — both contracts built with spec shaking. Protected Wasm: 26,582 bytes, SHA-256 `012e25ee123a0c269c7842e8682f3606a5b697db90fc7cbe3668433c0460989e`.
- No original contract source or vendored SDK code changed. No deployment performed. The user subsequently requested committing and pushing this work on `feat/arbiter-reclaims`.
- Updated the original parent-workspace roadmap (outside this Git checkout) to mark implemented contract pieces and preserve the remaining product/deployment work.
