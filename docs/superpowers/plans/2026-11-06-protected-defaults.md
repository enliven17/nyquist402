# Protected payment defaults implementation plan

**Goal:** Use the current deployed protected escrow for all new application payments and explain the service without contract-generation labels.

**Spec:** The user's request in this chat: pull all updates, use the current contract by default and remove public version labels.

**Architecture:** Centralize deployment defaults in `web/lib/deployment.ts`. Application configuration and setup consume the same defaults; payment identity encodings remain unchanged. Public documentation explains one payment model.

**Constraints:** Preserve existing edits and credentials. Do not deploy, fund accounts or submit payments. Preserve signed protocol identifiers and historical SDK fixtures.

## Tasks

- [x] Fetch and pull `origin/main` with fast-forward only; confirm HEAD matches the remote.
- [x] Add failing behavioral tests for default deployment resolution, explicit overrides, stale configuration rejection and quote downgrade rejection.
- [x] Implement `resolveProtectedDeployment(environment)` returning the current contract and schema version. Use it in the demo, setup and testnet scripts; defaults include fee terms even when amounts are zero.
- [x] Present one contract and payment model in public copy. Remove old version comparisons, heading labels and outdated deployment references.
- [x] Run all web tests, typecheck, production build, docs link validation and diff checks. Review configuration consumers and the complete change.

## Review focus

- A missing or blank contract setting resolves to the recorded deployment.
- Explicit alternate deployment addresses remain possible, with schema verification before offers.
- Explicit outdated or unsupported schema settings fail instead of silently signing the wrong agreement.
- Quotes without fee terms cannot downgrade the current payment model, even when all fees are zero.
- Setup scripts and runtime use matching defaults; documentation links survive heading changes.

## Execution notes

Implement directly in the existing checkout to preserve the running app and previous authorized edits. Leave changes uncommitted for review. The deleted environment example is a pre-existing user change and remains untouched.

Verification: 39 web tests, typecheck and production build pass; 67 documentation links validated across 27 pages. Independent review found no actionable issues. No payment or deployment transactions were submitted.
