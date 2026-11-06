# Legacy protected escrow

Contract foundation for reviewable, disputed partial payments. This is a separate contract from `AuthCaptureEscrow`; the published basic testnet contract and existing x402 vendor packages do not gain these rules automatically. Deployed on testnet at `CCQLNKUMUSMJ2L7KAH7VJSCXW6FOBLI3VAPZO4ZLCDEQ4PL76FDXKCEW` with default arbiter `GDNHZLVUYH5AHUBQWMSB3BK7ZYCSCOZRQQT7CJT3REDJGRK2SI7ZV67B`. Not audited.

## Terms and identity

Deploy with the Nyquist402 default arbiter address. Both payer and seller authorize `authorize(PaymentTerms)`, including the exact default, both custom preferences, budget, session deadline, review/response/ruling durations and last-resort seller allocation in basis points. The `agreement` hash commits to the API offer's promised delivery and pricing criteria; both parties and the arbiter must retain the corresponding agreement offchain. Matching nonempty preferences select that custom arbiter; otherwise the deployment default is selected. The network, contract and complete terms determine payment identity.

`fallback_seller_bps` is a jointly accepted last-resort allocation, not a finding that work was delivered. For a 400-unit claim, 2,500 basis points pays 100 to the seller and returns 300 to the payer if neither arbiter rules. Choose and disclose this economic rule before funding; there is no privileged administrator who can change it later.

This legacy contract charges no protocol or arbitration fees and is retained for its original payment records. New application payments use the deployed protected escrow described in the [service documentation](../../web/content/docs/index.mdx).

## API

| Call | Authorization | Effect |
| --- | --- | --- |
| `authorize(terms)` | Payer and seller | Collect the maximum; return payment ID |
| `claim(payment_id, amount, delivery_hash)` | Seller | Reserve unclaimed budget; return claim ID and begin review |
| `claim_state(payment_id, claim_id)` | Public | Read commitment, review/case deadlines, evidence references and status |
| `accept(payment_id, claim_id, commitment)` | Payer | Accept the exact delivery claim and pay its reservation |
| `settle(payment_id, claim_id)` | Anyone | Pay an undisputed claim after its review deadline |
| `dispute(payment_id, claim_id, party, evidence_hash)` | Named payer or seller | Freeze that reservation and open a bilateral evidence period |
| `submit_evidence(payment_id, claim_id, party, evidence_hash)` | Named payer or seller | Update that party's evidence commitment before response closes |
| `case_arbiter(payment_id, claim_id)` | Public | Read the current authority, or none when settled/fallback is due |
| `rule(payment_id, claim_id, seller_amount, expected_revision)` | Current arbiter only | Pay the bounded seller award and return the rest of that claim |
| `finalize_fallback(payment_id, claim_id)` | Anyone | Apply the signed allocation once the final ruling window closes |
| `reclaim(payment_id)` | Payer | Return only unclaimed funds after session expiry |
| `void_unclaimed(payment_id)` | Seller | Return unclaimed funds early without touching reservations |
| `payment_state(payment_id)` | Public | Read available/reserved funds and cumulative payouts |

No immediate `charge` or unrestricted `capture` entry point exists on this contract. Its settlement functions all consume a specific eligible claim, and returning unused funds only consumes the available bucket.

## Deadlines and finality

- A new claim must be recorded strictly before the session deadline. Its review can finish after that deadline; reclaim still cannot consume it.
- A case must open strictly before the claim's review deadline. The response deadline is the later of the original review deadline and the case-opening time plus the response duration.
- Custom authority runs after response closes until its ruling deadline. Then the pinned default may rule until the final deadline. If the selected arbiter was already the default, it receives one default window, without an extra custom delay.
- At the final deadline, arbiter rulings expire and anyone may execute the pre-agreed fallback. Late custom rulings cannot override default authority. Evidence revisions prevent settling against an outdated evidence snapshot.
- Finalized claims cannot reopen or pay twice. Accepting one claim does not approve another. A dispute over one claim cannot claw back a previously released claim.

All timeouts require a transaction. Parties can directly submit contract actions without facilitator authorization; a relay may sponsor fees, but sponsorship and wallet UI are separate integration work. Store only hashes of delivery/evidence onchain; the evidence itself needs an authenticated, durable offchain service.

Persistent records are TTL-extended with a buffer through the maximum policy lifetime, subject to network TTL limits. Clients must simulate/restore archived entries when necessary; TTL estimation is not a wall-clock guarantee. Contract instance/code TTL must also be maintained by deployment operations.

## Example

Authorize 1,000 units. Accept and pay a 300-unit claim. Reserve and dispute a second 400-unit claim. After session expiry, reclaim returns only the remaining 300 available units; the disputed 400 stays in escrow. The current arbiter can award 250 to the seller and return 150 to the buyer. Previously paid 300 units are unaffected.

## Verification

Use the workspace-pinned Rust toolchain:

```sh
cargo test --workspace --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
stellar contract build
```

Stellar CLI 25.2.0 or newer is required for SDK 29's spec-shaking step. Do not bypass its build-system check with an environment variable and publish an unprocessed Wasm file.
