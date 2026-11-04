# Nyquist402 — SCF Build Award (Open Track) draft

Updated 2026-11-04 for bilateral disputes, custom arbiters with a Nyquist402 default, and protected repeated captures. The claim-level onchain foundation is now implemented locally in a separate protected contract; deployment, paid arbitration, service/UI integration and remaining product policy are still open. Checked work below means implemented source, not mainnet readiness. Fields marked `TODO` need a team decision or supporting evidence.

## Summary

Nyquist402 brings the x402 `auth-capture` payment scheme to Stellar: payments for AI agents and apps that can be authorized up to a maximum, captured for the final cost, cancelled, and voluntarily refunded. The existing escrow implements that basic payment lifecycle.

The next product layer adds protected settlement. Money stays in escrow while the buyer reviews the delivered API result. Either buyer or seller can open a dispute and submit evidence; the other party can respond in the same case. Opening a dispute does not itself transfer money. An arbiter decides whether the seller gets paid, the buyer gets their held funds back, or the money is divided for partial delivery.

Each party may have its own preferred arbiter. If both parties agree on an arbiter, that arbiter handles the case. If they cannot agree, the Nyquist402-operated default arbiter handles it. Proposed timing: fix the preferences, selection outcome and default identity in the accepted terms before funding, so disagreement cannot delay an existing case indefinitely.

The arbiter normally intervenes only in a dispute. Accepted or unchallenged delivery claims settle under rules agreed before payment. Protection covers funds still held in escrow; voluntary refunds after final payout are a separate operation and do not provide an enforced chargeback.

## Problem

- Fixed, final API payments do not accommodate work whose cost is known only after execution or a review period before payout.
- Immediate seller capture does not protect a buyer from invalid delivery. An unconditional buyer refund button does not protect a seller from a buyer who receives useful work and then refuses to pay.
- A separate approver signature is insufficient unless the contract prevents capture, cancellation, reclaim and every other withdrawal from bypassing an active dispute.
- Disputes need evidence, deadlines, a decision maker both sides know in advance, and a bounded fallback if that decision maker does not act.
- Buyers and sellers may prefer different arbiters. A declared project-operated default prevents arbiter-selection deadlock; it introduces trust in Nyquist402's arbitration process that must be explicit.

## Solution, users and alternatives

The product combines the Soroban payment escrow, a Stellar x402 binding, client/server/facilitator SDK mechanisms, a reusable hosted facilitator and OpenZeppelin integration, and the protected arbitration layer described below. Basic payment integration remains useful independently of the new protection capability.

Target users are API/data/inference sellers, agent tool servers and paying agent frameworks. Facilitators and arbiter operators are integration partners; naming an ecosystem provider is not evidence of a confirmed partnership.

Soroban provides authorization of exact contract calls and token sub-invocations. The existing escrow uses that to enforce merchant consent onchain and accept a separately authorized refund funder. Compared with the EVM delegated model, this removes reliance on facilitator-only checking for that consent; it does not imply that every feature of a general policy/arbitration system is already implemented. EVM delegated refunds also permit explicit out-of-band funding agreements. See the [EVM binding](https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture_evm.md).

| Alternative | Distinction to validate/document |
| --- | --- |
| Stellar `exact` | Fixed payment without this escrow lifecycle or a dispute review period |
| Stellar `upto` proposals | Compare per-request variable settlement with retained funds, later lifecycle actions and bilateral dispute enforcement; cite specific proposal versions before submission |
| XRPL `auth-capture` proposal | Its native-escrow profile is full-capture-only, without partial capture, early void, refunds or fees; see [proposal #3977](https://github.com/x402-foundation/x402/issues/3977) |
| Ad-hoc Soroban escrows | Compare actual x402 interoperability, SDK/facilitator support and dispute rules; assess individual projects before asserting incompatibility |

## Existing work and implementation status

### Completed baseline

Checked items mean the stated source/artifact exists; they do not claim a fresh passing test run, production hosting, formal audit or upstream release.

- [x] Implement the basic escrow lifecycle: authorize, charge, partial/repeated capture, void, externally funded refund and payer reclaim.
- [x] Implement basic fee/expiry checks, payment accounting, onchain consent and lifecycle events.
- [x] Add 24 contract unit tests, including authorization-tree and randomized invariant tests.
- [x] Package the fork's TypeScript client/server/facilitator mechanisms and integrate them into the demo.
- [x] Submit the existing Stellar binding as spec-only PR #4124. Upstream merge/release remains separate.
- [x] Implement wallet authorization integration for Freighter, xBull and Hana, plus server-agent mode.
- [x] Build the basic payment-lifecycle demo, faucet and payment/balance display.
- [x] Build the product website and introductory developer docs.

Basic repeated capture is implemented. The new contract below also implements independent protected claims; connecting those capabilities to the SDK and product remains planned.

### Implemented protected contract foundation (local code)

Source and API reference: [`contracts/protected-escrow`](contracts/protected-escrow/README.md). This contract is not deployed, audited or connected to the existing demo/SDK.

- [x] Jointly authenticated funding terms, including an agreement hash, pinned default/custom preferences, review/response/ruling durations and explicit terminal allocation.
- [x] Independent repeated claims, reserved versus unclaimed balances and exact-claim buyer acceptance.
- [x] Reservation-aware reclaim/early return: unused funds can return while reviewed/disputed claims stay locked, including after session expiry.
- [x] Either-party claim disputes, evidence commitments/revisions and scoped arbiter awards; no losing-party or facilitator veto.
- [x] Matching custom selection or deployment-pinned default, fixed custom-to-default authority windows and permissionless signed-policy fallback.
- [x] Protected lifecycle events, direct authenticated contract actions and accounting tests for multiple payments/claims.

Paid arbitration, concrete product presets, pre-claim/payment-level cases, authenticated evidence bodies, SDK/wallet/console integration, network archive/restore testing, audit and deployment remain open. The contract currently charges zero arbitration fees. Its fallback seller share is a jointly signed parameter, not a published project-wide default.

| Component | Present today | Remaining work |
| --- | --- | --- |
| Basic Soroban escrow | `authorize`, `charge`, partial/repeated `capture`, `void`, externally funded `refund`, payer `reclaim`; fee/expiry validation and events | Preserve compatibility; basic payments remain explicitly unprotected |
| Protected Soroban escrow | Separate contract with joint terms, repeated claim reservations, bilateral disputes, evidence commitments, scoped rulings, default escalation and fallback | Product integration, paid arbitration, payment-level cases, audit and deployment |
| Contract tests | 24 unit tests, including authorization-tree checks and a randomized invariant test | Dispute accounting, authorization, deadline/race, recovery and fuzz coverage |
| Stellar binding | Spec-only PR [x402-foundation/x402 #4124](https://github.com/x402-foundation/x402/pull/4124), tracked in [issue #4122](https://github.com/x402-foundation/x402/issues/4122) | Separately propose protected capabilities; no assumption of upstream acceptance |
| TypeScript mechanism | Client/server/facilitator packed from the fork into `web/vendor/` | Protected terms/actions, recovery, version negotiation and upstream review |
| Wallet integration | Freighter, xBull and Hana signing, plus server-agent mode | Real extension verification, protected actions and hosted onboarding |
| Web demo | Payment-lifecycle controls, faucet, state/balances, capture/release, void, refund and reclaim | Actual metered API, distinct party roles, disputes and durable history |
| Docs | Introductory client/server/facilitator examples and contract reference | Complete setup, dispute, recovery and error references |
| Hosted infrastructure | In-process SDK facilitator adapter | Public endpoints, durable payment/case storage, indexing, monitoring and deadline jobs |
| Arbitration | Basic consent hook plus new claim-level onchain selection, evidence commitments, rulings and fallback enforcement | Hosted default/custom adapters, private evidence service, paid arbitration and payment-level cases |
| Other deliverables | No merchant console, Python implementation or OpenZeppelin plugin in this checkout | Implement against finalized capabilities |
| Mainnet | Existing documented address is testnet only | Audit, protected deployment, service and seller integrations |

Existing basic testnet escrow: `CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI`. It has no dispute protection. Existing payments cannot acquire protection retroactively.

The original contract has 24 tests and the new protected contract has 21 tests. The fork separately reports 317 SDK unit tests and four testnet integration tests; those suites are outside this checkout. TODO: pin the source commits behind vendor packages and link commands/CI results. TODO: substantiate the previously claimed independent security review with reviewer, reviewed commit, report and remediation links. The protected source received an implementation code review, which is not a formal audit.

## Agreed product rules and planning assumptions

**Agreed with the team:** either buyer or seller can open a case; both can present evidence and contest the requested outcome; opening a dispute does not award money. Each party may prefer its own arbiter. A mutually agreed arbiter decides the case; without agreement, Nyquist402's default arbiter decides it.

**Current contract choice:** bind arbiter selection before funding and retain claim reservations in a separate versioned protected escrow. Repeated claims, configurable timing and jointly signed fallback allocation are implemented at contract level. Public policy presets, fee support and end-to-end protected SDK/product integration remain deliverables. The payment-level/pre-claim dispute flow below is still a product requirement; the current contract only opens cases against recorded claims.

## Protected payment flow

1. **Agree before payment.** Buyer and seller authenticate the same offer: asset, maximum budget, pricing/delivery criteria, their arbiter preferences, selected/default arbiter, policy version, deadlines, fees and timeout fallback. The buyer sees the result before signing. Parties who reject the default arbitration terms do not enter a protected payment.
2. **Select the arbiter deterministically.** If both accept the same arbiter, bind that identity. Otherwise bind the published Nyquist402 default identity/version. Different preferred arbiters do not each issue competing binding rulings. No additional selection negotiation is required when a case opens.
3. **Fund escrow.** The buyer authorizes the maximum. Protected funds stay in the contract. Immediate `charge` or ordinary capture cannot skip review.
4. **Deliver and claim payment.** Before the delivery deadline, the seller records a delivery reference and amount for an invoice/tranche within the remaining authorized budget. Reserve that amount so it cannot be claimed twice. Each claim starts its own full buyer review period. Recording a claim proves what was asserted, not that the delivered work was correct.
5. **Settle an undisputed claim.** The buyer can accept that exact claim and end its review early. If review expires without a dispute, anyone may trigger its settlement under the accepted policy. The seller receives the allowed amount. A final invoice returns eligible unused budget; a continuing session keeps unclaimed budget available under its agreed deadline. Neither path releases other pending reservations. The buyer cannot block payment just by refusing to click Accept.
6. **Open a case from either side.** Before final settlement and within the agreed deadlines, buyer or seller can open a case and submit evidence. A tranche case binds its payment ID, claim ID/revision and contested amount; only one binding case/ruling may settle that claim. A payment-level case may also open before a delivery claim exists, for example over non-delivery or a seller's assertion that work was performed: bind it to the funded agreement, an explicit no-claim-yet state and requested allocation within still-held funds. Prevent overlapping cases from allocating the same funds. The other party responds in the same case; a seller does not need a second dispute against the buyer's case. A disputed reference is evidence, not an automatic finding against either party.
7. **Freeze the covered funds.** The protected contract reserves money per claim and a tranche case locks that reservation. Payment-level case locking remains to be implemented. Settlement and unused-fund return respect existing claim reservations; no unrestricted charge/capture path exists in this contract. Unaffected eligible claims may settle independently, without spending a disputed reservation or another payment's money.
8. **Resolve and execute.** The selected arbiter signs a ruling allocating only its case-covered held funds between seller payment, buyer return and explicitly authorized fees. The contract verifies identity, case, claim revision, scope and amounts, then executes exactly once. Execution does not require the losing party's signature or discretionary permission from the facilitator.
9. **Handle absence and finality.** When the delivery/session deadline passes, return only eligible unclaimed funds. Timely claims under review and active cases, including pre-claim cases, follow their own deadlines; ordinary session expiry cannot empty those reservations. Final payout ends protection for that tranche, not future unsettled tranches. Later refunds of released funds remain voluntary unless a separately funded guarantee is added.

Deadline settlement needs a transaction; contracts do not wake themselves up. Provide monitored finalization jobs and direct submission tools for either party if the service is unavailable.

### Arbiter selection and trust

- Anyone may propose or operate an arbiter compatible with the agreed interface. Choosing a personal arbiter does not make that arbiter binding on the counterparty without agreement.
- Record both parties' authenticated acceptance of the selected arbiter or the default-selection policy. Bind the selected identity and policy/version to the payment before funds are collected. A seller's advertised arbiter alone is not bilateral agreement.
- The Nyquist402 default must be published with its operator, signing/contract identity, service terms, fees and availability expectations. It is operated by the project; describe that trust honestly rather than claiming the default is decentralized or automatically neutral.
- After funding, neither party, the facilitator nor an admin can replace the arbiter or alter the default for that payment. If mutually signed replacement is later supported, it must be explicit, versioned and unable to reset deadlines or revive a finalized payment.
- Recommend an explicit pre-agreed escalation from an unavailable custom arbiter to the pinned Nyquist402 default. This availability fallback is additional to the agreed no-selection-agreement default and requires consent before funding. It must not permit a losing party to appeal a valid completed ruling to the default.
- The default arbiter can also fail to respond. A terminal fallback allocation and deadline remain mandatory; simply appointing the project does not solve indefinite fund locking.

### Protected release scope and implementation order

- The single-invoice foundation and repeated claim-level accounting are implemented locally. Full seller payment, full buyer return and split awards are supported.
- Each protected tranche has a unique claim ID/revision, reserved amount, review period, acceptance and case outcome. Accepting or paying one tranche does not approve later tranches. Product/SDK integration of this contract remains open.
- One binding case per tranche is enforced, with both parties responding in that case. Add payment-level case scope/precedence separately without allowing overlapping allocation or deadline resets.
- Previously paid tranches remain final. A later case can allocate only funds still held for that case. Document session closure and returning unclaimed funds without releasing pending reservations.
- Keep authorized funds, seller awards, unused-budget returns, dispute awards and voluntary post-payout refunds distinct in accounting and documentation.
- Initial funding has a payer authorization; acceptance, disputes and evidence require additional authenticated actions. Do not promise one signature for an entire disputed lifecycle.
- Escrow enforces the agreed process and allocation limits. It does not prove that an arbiter's delivery judgment is objectively correct.

## Architecture and alternatives

| Approach | Consequence | Assessment |
| --- | --- | --- |
| Only replace `receiver_authorizer` with an arbiter | Gates seller operations, but payer `reclaim` has no dispute check and there is no case state or ruling allocation | Insufficient by itself |
| Separate custody/wrapper contract | Can enforce cases, but adds custody accounting and changes signer/recipient/x402 interactions across contracts | Possible alternative with additional integration and invariant work |
| Versioned escrow with dispute guards on every payout path | Keeps held money, case state and deadline rules together; requires signed-term, SDK, test, audit and deployment changes | Recommended planning baseline |

A new field in `PaymentInfo` changes its encoded representation and payment hash. Publish an explicit new version/capability and contract ID; do not silently reinterpret old payloads. Preserve the existing binding while proposing protected extensions upstream. Clients requiring protection must reject routes lacking that capability before signing.

```text
Buyer / agent / wallet                  Seller / API provider
  | fund, accept, dispute, evidence        | claim delivery, dispute, evidence
  +-------------------+--------------------+
                      v
       Public facilitator / transaction relay
                      |
                      v
        Protected escrow: funds + case state
                      ^
                      | signed ruling, only for disputes
        Mutually agreed arbiter
                  OR
        Pinned Nyquist402 default if no agreement

Durable payment/case index -> party consoles and deadline jobs
Either party retains a direct authorized transaction path.
```

The facilitator may remain stateless about business records when payloads carry the required terms. Seller/case storage and event indexing must be durable. Onchain state is authoritative for balances, active cases and deadlines; restarts must not erase access to a hold or case. Maintain storage for the full possible review, arbitration and fallback lifetime, accounting for network TTL limits and restoration.

### Proposed fix for reclaim and payout bypasses

Today's `reclaim` authenticates the payer and checks only `authorization_expiry` before returning the remaining hold. That is valid for the existing basic lifecycle. Protected settlement adds claim reservations and case locks that expiry alone cannot override.

- [x] Store authoritative payment/claim/case state: available and reserved funds, review/case deadlines, pinned arbiters, evidence revision and terminal outcome.
- [x] Guard claim finalization and unused-fund returns with shared reservation accounting and review/case eligibility checks. The protected contract has no immediate `charge` or unrestricted `capture` entry point.
- [x] Make protected `reclaim` return only expired, eligible unclaimed funds; reservations remain locked and an empty available balance reports reserved funds explicitly. Session expiry does not resolve claims/cases.
- [x] Restrict `void_unclaimed` and session timeout returns to unclaimed funds. Review-expiry finalization settles only its eligible claim; it cannot empty other reservations.
- [x] Implement acceptance, undisputed review expiry, scoped rulings and jointly signed fallback finalization without losing-party/facilitator veto.
- [x] Permit direct authenticated claim/case/response submission and permissionless already-authorized finalization.
- [x] Add reclaim/expiry, bilateral case, repeated payout, escalation, rollback, maximum-amount and multi-payment accounting tests.
- [ ] Extend these guards to pre-claim/payment-wide cases once that distinct scope and precedence are implemented.
- [ ] Connect the protected SDK/demo and demonstrate archival restoration and network-level operation before deployment.

Checking only `dispute_active` in reclaim would still allow expiry to bypass a timely claim's review window, or another payout path to drain the same reservation. The new contract implements reservation accounting and eligible finalization/return paths. The existing basic testnet deployment remains unchanged; using protection requires deploying and integrating the new version.

### Required project changes

| Current area | Required change |
| --- | --- |
| `contracts/protected-escrow/src/types.rs` | Implemented: jointly signed agreement/policy, arbiter preferences/default, claim deadlines/revisions and available/reserved balances. Remaining: paid-arbitration and payment-wide case types. Original basic types remain compatible. |
| `contracts/protected-escrow/src/lib.rs` | Implemented: authenticated claims/acceptance, either-party claim disputes, evidence, scoped rulings, escalation/fallback and reservation-aware reclaim/void. Remaining: payment-wide/pre-claim cases and fee integration. |
| `contracts/protected-escrow/src/events.rs` | Implemented: funded terms, claim/case updates, evidence commitments and final allocation/return events. Remaining: indexing and new scope/fee events as those features ship. |
| `contracts/protected-escrow/src/test.rs` | Implemented: claim-level timing, authority, accounting, rollback, repeated claims and cross-payment invariants; original 24 tests still apply to the basic contract. Remaining: network archive/restore and product integration suites. |
| New arbiter adapter and default service | Common ruling interface for third-party arbiters; Nyquist402 default case intake, evidence review, decisions and signed rulings; pinned identities, restricted key access and audit trails |
| SDK fork and spec | Protection capability negotiation, policy/arbiter validation before signing, claim/case actions, direct submission, ruling verification and cross-language encoding vectors; change/test source, then repack vendor artifacts with provenance |
| `web/lib/demo.ts` | Durable payment/case storage and event reconciliation instead of Maps/default in-memory lifecycle records; real metered work and protected actions |
| `web/app/api/demo/route.ts` | Authenticated role-specific claim/dispute/evidence endpoints; a supplied address or known hash is not permission to act as a party or arbiter |
| `web/lib/wallet.ts` and `web/app/demo/page.tsx` | Display and sign arbiter agreement/default, acceptance and dispute actions; show review/case deadlines, evidence responses and outcomes; preserve history across reloads |
| Buyer, merchant and arbiter consoles | Party-owned payment/case lists, delivery claims, evidence/response access, deadlines, decisions and audit history; show when the project default is responsible |
| Deployment and docs | New IDs/version checks, relay endpoints, indexes/finalization jobs, recovery runbooks and direct action tools; clarify fee sponsorship/reserve requirements; document basic versus protected flows |

### Required contract/protocol guarantees

- Only the funded payment's buyer or seller can initiate its payment/tranche case. Both have a bounded evidence opportunity; initiating a case does not award funds.
- Matching, jointly accepted arbiter choices select that arbiter. Conflicting choices deterministically select the pre-agreed Nyquist402 default. Pending cases cannot be redirected through an updated global default.
- Only the pinned case arbiter may rule, subject to any pre-agreed unavailability escalation. Arbiters cannot award more than held funds, exceed fee bounds or pay arbitrary recipients.
- Acceptances and decisions bind payment, network/contract, claim revision, case and policy. Stale or replayed instructions cannot settle a changed or frozen claim.
- Active cases block every competing payout from their covered funds, including post-expiry reclaim. A valid ruling executes without losing-party consent. Parties can directly open/respond to cases if the relay censors or fails.
- Delivery, review, response, ruling and fallback deadlines have explicit ordering and exact boundary behavior. A late claim cannot eliminate review time, and repeated actions cannot extend deadlines.
- Rulings cannot finalize before the opposing evidence window closes unless both parties explicitly close it early. Seller-initiated cases cannot shorten an already-promised buyer review period. Define the final evidence snapshot bound by a ruling and the effect of late submissions.
- Fallback behavior is agreed before funding. Neither the project nor another admin can invent a new allocation after funds lock. Unavailability fallback is not an appeal against a valid ruling.
- Held money plus completed seller payments, buyer returns and fees reconciles to the authorized deposit. One payment cannot consume another payment's funds; finalized allocations cannot execute twice.
- Repeated claims reserve disjoint budget allocations and have independent review periods. Session expiry, final-invoice remainder release and disputes over another tranche cannot consume a pending reservation. Tranche-level rulings cannot award unrelated reservations; payment-level cases follow explicit scope/precedence rules.
- Unprotected immediate settlement, old contracts and unsupported policy versions cannot be silently substituted for protected settlement.
- Server restart, index lag, relay outage and entry archival/restoration preserve the authoritative case state and both parties' permitted actions.

### Policy definition and implementation backlog

The following are explicit roadmap deliverables. Select the exact values and rules within these work packages, bind them into accepted terms, implement them and verify them before accepting protected funds. They are not requests to finalize every parameter in this discussion.

- [ ] **D1 — Review, response and resolution deadlines (Tranche 1).** Define configurable delivery/session, per-claim review, opposing-response, custom-ruling, default-ruling and terminal-fallback windows; add validated presets and signed-policy fields. Implement deadline jobs and contract boundaries. Verify just-before/at/after behavior, late claims, inactive parties, downtime and attempts to reset or shorten windows. Publish the actual presets with their rationale once selected.
- [ ] **D2 — Arbitration fees and funding (Tranches 1–2).** Define custom/default fees, who funds them, signed caps, separate service/arbitration accounting, split/full-return outcomes and any abuse bonds. Implement fee quotes/reservations and settlement. Verify no hidden charge, duplicate fee or claim above the signed total budget; document who pays if a custom arbiter escalates or never rules. Fee-pool custody must not consume another claim's protected principal.
- [ ] **D3 — Arbiter outage and terminal fallback (Tranches 1–2).** Define fixed custom/default response windows, pre-agreed escalation to the pinned project default, and a bounded terminal allocation if the default also does not respond. Select and document that final rule as part of this deliverable; do not silently invent its economic outcome now. Implement authority-stage changes and transaction-triggered fallback so old arbiters cannot issue late conflicting rulings. Demonstrate both arbiters offline, no indefinite locking, no post-funding admin allocation and exactly-once payout.
- [ ] **D4 — Protected partial/repeated captures (Tranche 2).** Add unique claim IDs/revisions, disjoint reservations, independent reviews and per-tranche cases under one authorization. Define payment-level case precedence and session closure. Verify multiple captures, acceptance of one claim without approving the next, mixed settled/pending/disputed tranches, split awards, remainder release, expired sessions and recovery. Preserve the maximum budget and prior payout finality.

Contract progress: D1 has configurable timing and boundary enforcement; D3 has custom/default windows and a jointly signed fallback-share mechanism; D4 has repeated claim reservations and claim-level adjudication. These work packages remain open for product presets, payment-wide scope, SDK/services/UI and deployment verification. D2 is not implemented; the new contract is fee-free.

| Decision | Status / planning recommendation |
| --- | --- |
| Arbiter selection | Agreed: each party may prefer its own; agreement selects that arbiter, otherwise Nyquist402 handles the case. Recommendation: authenticate selection/default consent before funding. |
| Default arbiter identity and operations | TODO: publish the project operator, identity/version, availability target, review process and signing-key controls. |
| Delivery criteria | TODO: define promised output, price calculation, delivery references, objective checks and discretion for subjective quality. |
| Window durations | Planned in D1: choose, publish and implement configurable durations/presets with exact boundary tests. |
| Buyer silence | Recommend settling a timely recorded claim after the full review window if no case is open; explicit acceptance can settle earlier. |
| Custom arbiter silence | Planned in D3: define/implement pre-agreed escalation, trigger/evidence handoff and rejection of late conflicting rulings. |
| Default arbiter silence | Planned in D3: select/implement a bounded terminal allocation. Automatically paying the case initiator, indefinite freezing or a newly chosen admin outcome are not acceptable substitutes. No universal timeout rule guarantees a correct judgment without evidence. |
| Arbitration fees/abuse controls | Planned in D2: define/implement funding, quotes, caps, outcome accounting and any bonds before protected launch. |
| Evidence privacy/retention | TODO: access rules, storage limits, retention and confidentiality; restricted bodies offchain, minimal commitments onchain, availability throughout response periods. |
| Repeated captures | Planned in D4: multiple reviewed claims under one authorization; the existing basic repeated-capture implementation is not dispute protection. |
| Finality | Proposed policy: one final ruling/fallback per claim, no recursive disputes/appeals; distinct future claims retain their own protection. Define payment-level closure/precedence in D4. |

## Milestones

The former five-month / 1,040-hour estimate predates this scope and must be re-estimated. TODO: name owners, team capacity, tranche dates and external dependencies. Sequence policy agreement -> protected contract/spec/SDK -> integrated dispute demo -> audit -> mainnet.

SCF disbursement is Tranche 0 (10% on award), MVP (20%), Testnet (30%), Mainnet (40%). These are payout shares, not engineering effort shares. See the [SCF budget and deliverable guidelines](https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines).

### Tranche 1 — Protected MVP (20%)

| Deliverable | Verification |
| --- | --- |
| Final bilateral policy and arbiter preference/agreement/default selection | Versioned terms and authenticated selection; no assumption that existing consent hooks already enforce disputes |
| D1: deadline parameters/presets and review/response/resolution enforcement | Published values/rationale, signed-policy validation, scheduler and exact-boundary tests |
| D2: fee/funding policy and D3: default-arbiter outage/final fallback policy | Published caps/funding/outcome rules and bounded final allocation selected before coding fund disposition |
| Deploy and integrate the implemented protected escrow foundation on testnet; complete remaining protected policy work | Existing source/tests plus a new testnet ID and network traces for reserved reclaim, review/case enforcement and final allocation |
| TypeScript source changes and spec/capability proposal | Pinned commits, PRs, CI and vendor provenance; distinguish submitted, merged and released |
| Public testnet facilitator and durable payment/case recovery infrastructure | `/supported`, `/verify`, `/settle`, direct case-action path and restart-recovery demonstration |
| Extend existing wallet demo with protected agreement and signed party actions | Hosted flow and real extension verification; existing wallet integration is not funded twice |
| Extend docs with setup, complete protected lifecycle, errors and recovery | Install-to-running quickstart and action/error reference |

### Tranche 2 — Integrated dispute testnet (30%)

| Deliverable | Verification |
| --- | --- |
| Third-party arbiter adapter plus Nyquist402 default case/evidence/ruling service | Same-choice custom arbiter case, conflicting-choice default case, and authenticated evidence access |
| D2: integrate fee quotes, funding and arbitration outcome accounting | Full/split returns, escalation costs, signed caps and exactly-once fees |
| D3: integrate custom/default outage handling and terminal finalization | Custom offline, default offline, evidence handoff, late-ruling rejection and bounded recovery without a new admin decision |
| D4: integrate the implemented repeated-claim core with SDK/services/interfaces and complete payment-level case scope | Hosted/network flows for independent reviews, mixed balances, safe reclaim/remainder release and preserved budget/finality |
| Buyer, merchant and arbiter consoles, history and deadline alerts | Hosted flows with separate credentials and restart recovery |
| Real metered API with HTTP payment handling and protected settlement | Hosted route/video for acceptance, silence, buyer/seller disputes, opposing evidence and split award |
| OpenZeppelin Relayer plugin for negotiated capabilities | Plugin PR/testnet run; identify any case actions outside standard x402 settlement |
| Python client/server for finalized lifecycle/protection terms | Source/package release, cross-language vectors and integration tests |
| Invariant/fuzz suite, threat model and Audit Bank application | Reproducible tests, bypass/race cases and declared full audit scope |

Required scenarios: honest seller paid despite buyer inactivity; invalid delivery returns buyer funds; seller wins against a false buyer claim; seller-initiated case; partial award; no delivery; custom arbiter chosen by agreement; conflicting preferences select Nyquist402; unavailable custom arbiter escalates only under the agreed policy; unavailable default follows the terminal fallback; active cases and review windows cannot be bypassed by capture or reclaim; repeated claims cannot oversubscribe funds or lose protection after an earlier claim settles.

### Tranche 3 — Audited mainnet product (40%)

| Deliverable | Verification |
| --- | --- |
| Audit final escrow, repeated-claim accounting, selection/default/fallback authority, fees and relevant SDK/service boundaries; resolve findings | Audited commits, report, fixes and re-verification covering D1–D4 and all arbitration/payout paths |
| Deploy audited protected escrow and publish IDs/policy/capabilities | Mainnet code verification and updated deployment/spec documentation |
| Release facilitator, custom adapter, Nyquist402 default service and deadline execution | Supported capabilities, successful traces, key/recovery/outage runbooks and accountable default operator |
| Tested onboarding and party dispute interfaces | Usability evidence for agreement, claim, response and outcome flows |
| At least three independently operated sellers using protected settlement | Named integrations and mainnet traces distinguishing protected/basic payments |

Upstream merges, partner integration, audit allocation and seller onboarding are dependencies. TODO: confirm contacts, scheduling and contingency dates. An open PR or Audit Bank application is not acceptance or a reserved audit slot.

## Success metrics

- Distinct independently operated sellers with finalized protected payments; target at least three at launch.
- Separate authorized volume, seller-paid volume, unused funds returned, dispute awards and voluntary refunds. Authorization volume is not revenue.
- Protected payments, buyer/seller case initiations, custom versus project-default assignments, full/split outcomes and settlement time. High dispute volume alone is not success.
- Timeout/escalation/fallback completions, unresolved-case count/age, and recovery after interruptions.
- Protected captures per authorization, independently reviewed tranche counts and fee-cap compliance; distinguish these from basic repeated captures.
- Reconcile contract events and the durable case index over 60 days after mainnet launch. TODO: set volume, adoption and response-time targets; separate team/self-generated traffic from organic use.

## Budget and timeline re-estimation

The original baseline was 1,040 hours / USD 72,800 at USD 70/hour: MVP 240 hours, Testnet 550 hours, Mainnet 250 hours. This is historical context, not an estimate for the expanded scope. The former 140-hour arbiter-interface line does not substantiate the contract, evidence, bilateral UX, project-default service and operational changes now required.

TODO: estimate these packages with named owners before submitting a revised total or launch date. Fund only remaining work; basic lifecycle code, the local protected claim-level core, wallet integration and introductory docs already exist.

| Tranche | Work package | Revised hours / cost |
| --- | --- | --- |
| 1 | Remaining protected policy/payment-wide extensions, integration and deployment tests | TODO — exclude the implemented claim-level core |
| 1 | D1–D3 policy definition, parameter validation, fee/fallback and reclaim-bypass enforcement | TODO — account within related contract/service packages without double-counting |
| 1 | Spec/TypeScript source changes, compatibility, review and CI | TODO |
| 1 | Public facilitator, durable payment/case storage and recovery | TODO |
| 1 | Remaining wallet integration and operational docs | TODO |
| 2 | Third-party adapter and Nyquist402 default/evidence/ruling service | TODO |
| 2 | D2–D3 fee accounting, custom/default outages and bounded terminal recovery | TODO — account within related service packages without double-counting |
| 2 | D4 SDK/UI integration, payment-level precedence and network tests around the implemented repeated-claim core | TODO |
| 2 | Buyer, merchant and arbiter interfaces, history and notifications | TODO |
| 2 | Actual metered API and role-separated end-to-end demonstrations | TODO |
| 2 | OpenZeppelin plugin and Python integration | TODO |
| 2 | Fuzz/invariant testing, threat model and audit preparation | TODO |
| 3 | Audit remediation, audited deployment and production recovery | TODO |
| 3 | Infrastructure/monitoring engineering and seller integrations | TODO |
| | **Revised total and schedule** | **TODO — original estimate is superseded** |

USD 70/hour also remains a draft assumption. Separate engineering from recurring hosting, relay, evidence-storage and arbitration costs; identify funding for the project-operated default. Do not assume general operations are grant-eligible. Audit cost is excluded from the engineering request and depends on Audit Bank eligibility/allocation. Include the 10/20/30/40 payout schedule in a cash-flow plan.

## Team

TODO: names, roles, links, prior work and capacity for revised scope. Assign contract, SDK/backend, interfaces, arbitration/evidence, key management and independent review responsibilities. Substantiate relevant background: Stellar products built (Gemetra), 17 hackathon wins.

TODO: team video. Identify the operator and accountability of Nyquist402's default arbiter, including disclosure of any relationship to participating sellers or buyers.

## AI disclosure

Parts of code, tests and documentation were written with AI assistance and reviewed by the team. Tests cover selected lifecycle, authorization, claim/dispute, deadline and accounting behavior; exhaustive coverage is not claimed. Claim-level protection is implemented locally; the full service/UI/payment-wide dispute product and audited deployment remain planned.

## Links

- Repository: [enliven17/nyquist402](https://github.com/enliven17/nyquist402). TODO: confirm public access before submission.
- Upstream issue: [x402-foundation/x402 #4122](https://github.com/x402-foundation/x402/issues/4122)
- Existing spec-only PR: [x402-foundation/x402 #4124](https://github.com/x402-foundation/x402/pull/4124)
- Existing binding: [Stellar auth-capture fork](https://github.com/enliven17/x402/blob/feat/stellar-auth-capture/specs/schemes/auth-capture/scheme_auth_capture_stellar.md)
- Existing basic testnet escrow: [Stellar Lab](https://lab.stellar.org/r/testnet/contract/CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI)
- Protected spec/source/deployment, audit and CI artifacts: TODO as each deliverable ships.
