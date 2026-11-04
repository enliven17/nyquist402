# Protected SDK and Demo Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. Steps use checkbox syntax for tracking.

**Goal:** Integrate the protected contract through a local reusable SDK and wallet demo without changing the basic x402 binding.

**Architecture:** Typed browser-compatible codec/client, narrowly scoped server seller authorization, and a separate protected UI. Chain state is authoritative; browser records retain agreement text and payment-scoped seller capabilities across reloads.

**Tech Stack:** TypeScript, Stellar SDK 16.4.1, Next/React, Node's test runner.

**Spec:** [Approved design](../specs/2026-11-04-protected-sdk-demo-design.md). User approved on 2026-11-04 and instructed continued implementation; execute inline in the current feature branch.

## Global Constraints

- Preserve basic demo/vendor ABI and landing product claims; configure protected deployment explicitly.
- Zero arbitration fees; fallback share explicit; wallet pays transaction fees.
- Never server-sign buyer/arbiter actions or arbitrary submitted transaction XDR.
- Seller delegation binds exact contract/network/payment and permitted demo actions; identity alone grants no authority.
- Recover terms, balances, claims and arbiter from chain. Preserve browser records per network/contract/payer. No claim of hosted evidence or upstream x402 standardization.

## Review Focus

- Malformed, oversized and integer-overflow inputs fail before signing.
- Wrong contract/network/default or tampered policy cannot silently downgrade protection.
- Stolen public payment hashes cannot authorize seller actions or obtain signatures over other transactions.
- Failed/pending submissions do not become successful UI payment history.
- Reloads or imported payments do not grant buyer/seller/arbiter identity; reserved funds remain visibly separate.

## Task 1: Typed SDK and encoding

**Files:** `web/lib/protected/{types,codec,client,index}.ts`, `web/tests/protected-sdk.test.ts`, `web/package.json`.
**Interfaces:** `ProtectedEscrowClient` exposes read/default/terms/state/claim/arbiter and prepare/submit for typed `ProtectedAction`; `termsToScVal`, `computePaymentId`, `hashText`, integer/identity validation.

- [x] Write failing encoding/identity, integer-boundary, policy and action tests. Run Node test runner with TypeScript support and observe missing exports.
- [x] Implement Soroban types, sorted-map terms encoding, enum decoding, identity hashing and explicit capability validation.
- [x] Implement simulation/assembly, bounded authorization callbacks, wallet envelope signing and confirmed result reads. Test using recorded RPC protocol fixtures where network is unavailable.
- [x] Verify codec against a Rust-produced vector; preserve all 45 Rust tests.

## Task 2: Seller boundary and protected API

**Files:** `web/lib/protected/{capability,demo}.ts`, `web/app/api/protected/route.ts`, `web/tests/protected-api.test.ts`, `web/.env.example`, `web/scripts/setup-demo.mjs`.
**Interfaces:** quote returns exact terms + bound seller capability; prepare accepts a discriminated action and caller address; authenticated seller preparation only, never generic server signing; GET reconstructs chain state.

- [x] Write failing tests for capability tampering, scope isolation, signing-invocation checks and malformed/oversized requests.
- [x] Implement HMAC capability signing/verifying with a stable server secret, complete term validation and strict action parsing.
- [x] Implement quoted funding and seller mutation preparation, publicly readable chain state with bounded pagination, and caller-signed transaction submission through SDK/browser RPC. Reject unsupported deployments visibly.
- [x] Add explicit configuration example and setup instructions. Do not overwrite existing demo credentials.

## Task 3: Protected UI and recovery

**Files:** `web/app/demo/protected/{page.tsx,protected.css}`, `web/lib/protected/history.ts`, `web/lib/wallet.ts`, `web/app/demo/page.tsx`, recovery tests.

- [x] Write failing history namespace/corruption and deadline/action availability tests.
- [x] Implement quote review before funding, explicit fallback share and both arbiter preferences, wallet transaction signing, seller delegated actions, claims, evidence and actual-wallet arbiter rulings.
- [x] Render independent available/reserved/paid/returned balances, all chain deadlines and recovery/import. Keep every claim independently addressable. No financial action based only on a UI-selected role.
- [x] Reuse existing visual language and link basic/protected demos. Refresh chain state after confirmed transactions and poll for external updates.

## Task 4: Documentation, review and verification

- [x] Document SDK use, protected demo config, example presets, signing, errors/recovery and remaining limitations. Update roadmap only for delivered capabilities.
- [x] Run SDK/API tests, TypeScript check, production Next build, Rust workspace tests, formatting and diff checks.
- [x] Request independent whole-change review; fix material findings with regression tests.
- [x] Record verified results and environment-dependent live wallet/network limitations. No automatic new commit or push unless requested.

## Execution and verification record

- User approved the design and requested continued implementation on 2026-11-04. Implemented inline on the existing feature branch without an additional worktree or initial publication. The user subsequently authorized moving the SDK/demo integration to `feat/update-sdk`, committing and pushing it.
- Dependency setup retained every locked package version. Installed pnpm 11 reads overrides/build policy from `pnpm-workspace.yaml`; migrated the existing override there and explicitly disabled optional dependency build scripts. Locked installation succeeded without running those scripts.
- Test-first implementation: observed missing SDK/API/policy/recovery/flow functions, then implemented them. Rust produced a shared canonical XDR/payment-ID fixture; TypeScript matches it byte-for-byte.
- Local source checks: 21 web tests cover terms/identity, exact amounts/percentages, API capability scopes, bounded streaming requests, role boundaries, review/case deadlines, archived-data handling, envelope integrity, legacy/AddressV2 signing, enforced custom-account auth resources and confirmed-return handling.
- Whole-change independent review found three issues: ordinary AddressV2 rejection, missing custom-account enforcement simulation, and floating-point fallback percentages. Each was reproduced by a failing regression test and fixed; the full 21-test web suite passes afterward. No actionable review findings deferred.
- Ruling: preserve the basic demo and vendor packages; expose local protected source under a distinct protocol label and contract configuration. Upstream x402 integration remains a separate deliverable selected out of scope by the user.
- Ruling: no deployed protected contract ID or credentials were supplied. Implement explicit configuration and an opt-in real testnet script; do not invent an ID, deploy mainnet, or claim live lifecycle verification. Deployment/real-wallet/archive recovery remain validation steps for the operator.
- Browser checks against the built app used explicit API fixtures: imported payment read-only behavior, no signing privileges from an ID, the $3 unused/$4 reserved/$3 paid ledger, desktop/mobile layout without horizontal overflow and no browser page errors. Screenshots were visually inspected. This was not a real extension or live testnet run.
- Verified production Next build and TypeScript. Rust workspace passes 46 tests (24 basic + 22 protected). Formatting and final checks recorded below after the review fixes.
- No financial contract logic or basic SDK tarball changed. The setup script now preserves existing funded credentials and creates new environment files with exclusive creation and mode 0600.

### Final verification after review fixes

- Locked pnpm 11 installation: succeeded, with all dependency versions unchanged and optional build scripts disabled explicitly.
- `pnpm test` (using the user Node runtime to invoke pnpm): 21 passed, zero failures/skips.
- `pnpm typecheck`: passed.
- `pnpm build`: passed; the existing site metadataBase warning remains unrelated to this integration.
- `cargo test --workspace --locked --offline`: 46 passed (24 basic + 22 protected), zero failures/skips.
- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked --offline -- -D warnings`, `git diff --check`: passed.
- Live testnet lifecycle, real wallet extension signing and archival restoration were not run: protected deployment configuration was not supplied. The optional script and operator instructions are included.
