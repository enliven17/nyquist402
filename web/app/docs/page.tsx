import type { Metadata } from "next";
import {
  ArbiterSelectionDiagram,
  ArchitectureDiagram,
  BasicLifecycleDiagram,
  BucketsDiagram,
  ClaimStateDiagram,
  DeadlineDiagram,
} from "@/components/docs/Diagrams";
import "./docs.css";

export const metadata: Metadata = { title: "Docs · Nyquist402" };

const BASIC = "CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI";
const PROTECTED = "CCQLNKUMUSMJ2L7KAH7VJSCXW6FOBLI3VAPZO4ZLCDEQ4PL76FDXKCEW";
const DEFAULT_ARBITER = "GDNHZLVUYH5AHUBQWMSB3BK7ZYCSCOZRQQT7CJT3REDJGRK2SI7ZV67B";
const SPEC_PR = "https://github.com/x402-foundation/x402/pull/4124";
const FORK = "https://github.com/enliven17/x402/tree/feat/stellar-auth-capture";
const contractUrl = (id: string) => `https://stellar.expert/explorer/testnet/contract/${id}`;

const toc = [
  ["overview", "Overview"],
  ["architecture", "Architecture"],
  ["basic", "Basic payments"],
  ["protected", "Protected payments"],
  ["arbiters", "Arbiters"],
  ["deadlines", "Deadlines"],
  ["funds", "Fund safety"],
  ["quickstart", "Quickstart"],
  ["reference", "Contract reference"],
  ["security", "Security model"],
  ["roadmap", "Roadmap"],
  ["deployments", "Deployments"],
] as const;

const sellerCode = `import { x402ResourceServer } from "@x402/core/server";
import { createEd25519Signer } from "@x402/stellar";
import { AuthCaptureStellarScheme } from "@x402/stellar/auth-capture/server";

const scheme = new AuthCaptureStellarScheme({
  // Signs consent for charge, capture, void and refund.
  consentSigner: createEd25519Signer(process.env.RECEIVER_PRIVATE_KEY!),
});
const server = new x402ResourceServer(facilitatorClient).register("stellar:testnet", scheme);

// Route accepts entry
{
  scheme: "auth-capture",
  network: "stellar:testnet",
  price: "$0.10",
  payTo: receiverAddress,
  extra: { paymentFlow: "escrow", captureMode: "deferred",
           captureDeadlineSeconds: 3600, refundDeadlineSeconds: 86400 },
}`;

const agentCode = `import { x402Client } from "@x402/core/client";
import { createEd25519Signer } from "@x402/stellar";
import { AuthCaptureStellarScheme } from "@x402/stellar/auth-capture/client";

const client = new x402Client().register(
  "stellar:testnet",
  new AuthCaptureStellarScheme(createEd25519Signer(process.env.AGENT_PRIVATE_KEY!)),
);`;

const lifecycleCode = `const lifecycle = scheme.createLifecycleManager(facilitatorClient);

await lifecycle.capture(paymentHash, { amount: "6000000", voidRemainder: true });
await lifecycle.refund(paymentHash, { amount: "2000000" });`;

const protectedCode = `import { authorizeEntry, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { ProtectedEscrowClient } from "./lib/protected";

const escrow = new ProtectedEscrowClient({
  contractId: PROTECTED_ESCROW,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
});

// The buyer is the fee source; the seller co-signs the exact terms.
const prepared = await escrow.prepare(buyer.publicKey(), { type: "authorize", terms },
  async (address, entry, untilLedger) =>
    authorizeEntry(entry, seller, untilLedger, Networks.TESTNET));

const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
tx.sign(buyer);
await escrow.submit(prepared, tx.toXDR());`;

const basicApi = [
  ["authorize(payment_info)", "operator, payer", "Hold max_amount in escrow"],
  ["charge(payment_info, amount, fee_amount, fee_receiver)", "operator, payer, consent", "Pay amount now, return the rest"],
  ["capture(payment_info, amount, fee_amount, fee_receiver, void_remainder)", "operator, consent", "Pay from the hold"],
  ["void(payment_info)", "operator, consent", "Release the hold"],
  ["refund(payment_info, amount, funder)", "operator, consent, funder", "Return captured funds"],
  ["reclaim(payment_info)", "payer", "Recover the hold after the capture deadline"],
];

const protectedApi = [
  ["authorize(terms)", "payer, seller", "Collect the budget; return the payment ID"],
  ["claim(payment_id, amount, delivery)", "seller", "Reserve budget for one delivery and start its review"],
  ["accept(payment_id, claim_id, commitment)", "payer", "Pay that exact claim"],
  ["settle(payment_id, claim_id)", "anyone", "Pay an undisputed claim after review"],
  ["dispute(payment_id, claim_id, party, evidence)", "payer or seller", "Freeze the claim and open a case"],
  ["submit_evidence(payment_id, claim_id, party, evidence)", "payer or seller", "Update evidence before it closes"],
  ["rule(payment_id, claim_id, seller_amount, revision)", "current arbiter", "Pay the award, return the rest"],
  ["finalize_fallback(payment_id, claim_id)", "anyone", "Apply the signed split after every ruling window"],
  ["reclaim(payment_id)", "payer", "Return unclaimed funds after the session"],
  ["void_unclaimed(payment_id)", "seller", "Return unclaimed funds early"],
];

const roadmap = [
  ["live", "Escrow contracts", "Basic auth-capture and protected settlement on testnet, with claim-level disputes and arbiter windows."],
  ["live", "TypeScript integration", "x402 auth-capture client, server and facilitator, a protected escrow SDK and wallet demos."],
  ["next", "Installable SDK and facilitator", "Versioned packages, a public facilitator API and a reference metered API with usage receipts."],
  ["next", "Recoverable case service", "Durable case index, deadline jobs, archived-state restoration and private evidence storage."],
  ["next", "Quoted Arbitration", "The selected arbiter's price is quoted and reserved before funding. Buyers fund it; no fee without a ruling, unused reserves return."],
  ["next", "Role consoles", "Buyer, seller and arbiter workspaces with quotes, evidence, history and deadline alerts."],
  ["next", "Reviewed mainnet release", "Independent security review, mainnet deployment, operating runbooks and seller integrations."],
] as const;

export default function Docs() {
  return (
    <div className="docs">
      <main>
        <article>
          <section id="overview">
            <span className="eyebrow">Documentation</span>
            <h1>Pay for work, then settle what it cost.</h1>
            <p className="lead">
              Nyquist402 brings refundable, reviewable payments to x402 on Stellar. A buyer authorizes a maximum, the
              seller is paid for the work actually delivered, and every step settles in Soroban escrow.
            </p>
            <div className="modes">
              <div>
                <h3>Basic auth-capture <span className="tag tag-live">testnet</span></h3>
                <p>
                  The x402 <code>auth-capture</code> scheme. Hold a budget, capture the real price, void the rest and
                  refund later. The seller decides the final amount.
                </p>
              </div>
              <div>
                <h3>Protected settlement <span className="tag tag-live">testnet</span></h3>
                <p>
                  Each delivery becomes a claim the buyer reviews. Either side can dispute, an agreed arbiter rules,
                  and signed timeouts guarantee every claim ends.
                </p>
              </div>
            </div>
          </section>

          <section id="architecture">
            <h2>Architecture</h2>
            <p>
              Payment logic lives in two Soroban contracts. Offchain parties only submit signed calls: the contract
              checks every authorization, deadline and amount itself.
            </p>
            <figure className="fig">
              <figcaption><span>Fig 1 · system</span><span>arrows show who calls what</span></figcaption>
              <div className="fig-scroll"><ArchitectureDiagram /></div>
            </figure>
            <ul className="points">
              <li><strong>Buyer or agent</strong> signs one Soroban authorization per payment. It holds the token; the facilitator can pay network fees.</li>
              <li><strong>Seller API</strong> prices the request and returns HTTP 402. In protected mode it records delivery claims.</li>
              <li><strong>Facilitator</strong> verifies and submits basic payments. It can never move its own funds through the escrow.</li>
              <li><strong>Arbiter</strong> rules only on disputed claims, only inside its window, and only up to the claim amount.</li>
            </ul>
          </section>

          <section id="basic">
            <h2>Basic payments</h2>
            <p>
              The escrow holds up to the authorized maximum. The seller captures what the work cost and releases the
              rest; captured funds stay refundable until the refund deadline. If the seller does nothing, the payer
              reclaims the hold after the capture deadline.
            </p>
            <figure className="fig">
              <figcaption><span>Fig 2 · balances over one payment</span><span>1.00 DEMOUSD</span></figcaption>
              <div className="fig-scroll"><BasicLifecycleDiagram /></div>
            </figure>
            <ul className="points">
              <li><strong>Seller consent</strong> is a separate Soroban authorization over the exact call arguments, from <code>receiver_authorizer</code> or the receiver.</li>
              <li><strong>Replay protection</strong> comes from Soroban nonces and expiry ledgers, so each consent is single-use.</li>
              <li><strong>Payment identity</strong> is <code>sha256(network ‖ escrow ‖ payment_info)</code>; one authorization cannot fund two payments.</li>
            </ul>
          </section>

          <section id="protected">
            <h2>Protected payments</h2>
            <p>
              Buyer and seller sign the full terms before funding: budget, deadlines, arbiter preferences and a
              fallback split. The seller then records one claim per delivery. Each claim reserves its own amount and
              moves through review independently, so accepting one never approves another.
            </p>
            <figure className="fig">
              <figcaption><span>Fig 3 · one claim</span><span>every path ends settled</span></figcaption>
              <div className="fig-scroll"><ClaimStateDiagram /></div>
            </figure>
            <ul className="points">
              <li><strong>Accept</strong> pays the exact claim the buyer reviewed, bound by its commitment hash.</li>
              <li><strong>Silence</strong> is not a dispute: after review, anyone can settle the claim to the seller.</li>
              <li><strong>Disputes</strong> can be opened by either party. Both submit evidence hashes; the evidence itself stays offchain.</li>
              <li><strong>Rulings</strong> pay any split of the claim. A finalized claim cannot reopen or pay twice.</li>
            </ul>
          </section>

          <section id="arbiters">
            <h2>Arbiters</h2>
            <p>
              Both parties name a preferred arbiter in the signed terms. Matching preferences select that arbiter;
              otherwise the project default, pinned when the contract was deployed, handles the case. No one can swap
              the arbiter after funding.
            </p>
            <figure className="fig">
              <figcaption><span>Fig 4 · selection</span><span>decided before funding</span></figcaption>
              <div className="fig-scroll"><ArbiterSelectionDiagram /></div>
            </figure>
            <p>
              In the testnet demo the buyer picks from a roster of demo-operated arbiters, the seller agrees, and
              arbiters rule for free. Fee-bearing arbitration is on the <a href="#roadmap">roadmap</a>.
            </p>
          </section>

          <section id="deadlines">
            <h2>Deadlines</h2>
            <p>
              Every window is fixed in the signed terms. A dispute must open before review ends. Evidence closes at
              the later of the review end and the response window. The chosen arbiter rules next, then the default;
              when both have passed, anyone can apply the fallback split. Each step needs a transaction, which anyone
              can submit.
            </p>
            <figure className="fig">
              <figcaption><span>Fig 5 · windows for one disputed claim</span><span>not to scale</span></figcaption>
              <div className="fig-scroll"><DeadlineDiagram /></div>
            </figure>
            <p>
              The fallback is a split both parties accepted before funding, not a finding of fault. Late rulings
              cannot override a later stage or a final outcome.
            </p>
          </section>

          <section id="funds">
            <h2>Fund safety</h2>
            <p>
              A protected payment tracks four buckets: available, reserved, paid to seller and returned to buyer.
              Ending the session only releases the available bucket. A claim under review or dispute keeps its
              reservation until it settles.
            </p>
            <figure className="fig">
              <figcaption><span>Fig 6 · reclaim after the session</span><span>10.00 budget</span></figcaption>
              <div className="fig-scroll"><BucketsDiagram /></div>
            </figure>
          </section>

          <section id="quickstart">
            <h2>Quickstart</h2>
            <p>
              Basic payments use the <code>auth-capture</code> mechanism in <code>@x402/stellar</code>. Until the{" "}
              <a href={SPEC_PR}>upstream PR</a> merges, install it from the <a href={FORK}>fork</a>.
            </p>
            <h3>Seller</h3>
            <pre><code>{sellerCode}</code></pre>
            <h3>Capture and refund later</h3>
            <pre><code>{lifecycleCode}</code></pre>
            <h3>Agent</h3>
            <pre><code>{agentCode}</code></pre>
            <h3>Protected escrow</h3>
            <p>
              The protected SDK ships in the repository under <code>web/lib/protected</code>. It encodes terms
              exactly, checks the payment identity against the contract and validates every authorization before
              asking for a signature.
            </p>
            <pre><code>{protectedCode}</code></pre>
          </section>

          <section id="reference">
            <h2>Contract reference</h2>
            <h3>AuthCaptureEscrow</h3>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Function</th><th>Authorized by</th><th>Effect</th></tr></thead>
                <tbody>
                  {basicApi.map(([fn, auth, effect]) => (
                    <tr key={fn}><td><code>{fn}</code></td><td>{auth}</td><td>{effect}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>ProtectedEscrow</h3>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Function</th><th>Authorized by</th><th>Effect</th></tr></thead>
                <tbody>
                  {protectedApi.map(([fn, auth, effect]) => (
                    <tr key={fn}><td><code>{fn}</code></td><td>{auth}</td><td>{effect}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 16 }}>
              Reads: <code>payment_state</code>, <code>payment_terms</code>, <code>claim_state</code>,{" "}
              <code>case_arbiter</code>, <code>default_arbiter</code>, <code>payment_hash</code>.
            </p>
          </section>

          <section id="security">
            <h2>Security model</h2>
            <h3>The contract enforces</h3>
            <ul className="points">
              <li>Who may call each function, over which exact arguments.</li>
              <li>Deadlines, the current arbiter and the bounds of every award.</li>
              <li>Disjoint reservations: no claim, payment or session expiry can spend another claim&apos;s funds.</li>
              <li>Single settlement: every claim pays out exactly once.</li>
            </ul>
            <h3>The contract does not</h3>
            <ul className="points">
              <li>Judge delivery quality. Arbiters do, from evidence kept offchain.</li>
              <li>Store evidence. Only hashes go onchain; parties keep the documents.</li>
              <li>Act on its own. Timeouts need a transaction, which anyone can submit.</li>
            </ul>
            <h3>Current limits</h3>
            <ul className="points">
              <li>Disputes require a recorded claim. Unclaimed funds return after the session without a case.</li>
              <li>Protected settlement charges no protocol or arbitration fee yet.</li>
              <li>Both contracts are on testnet and have not been audited.</li>
            </ul>
          </section>

          <section id="roadmap">
            <h2>Roadmap</h2>
            <p>What runs today and what comes next. Order reflects dependencies, not dates.</p>
            <div className="table-scroll">
              <table>
                <tbody>
                  {roadmap.map(([state, title, text]) => (
                    <tr key={title}>
                      <td style={{ width: 120 }}><span className={`tag tag-${state}`} style={{ marginLeft: 0 }}>{state === "live" ? "live" : "next"}</span></td>
                      <td><strong>{title}</strong><br /><span className="muted">{text}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="deployments">
            <h2>Deployments</h2>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Contract</th><th>Testnet address</th></tr></thead>
                <tbody>
                  <tr><td>AuthCaptureEscrow</td><td><a href={contractUrl(BASIC)}><code>{BASIC}</code></a></td></tr>
                  <tr><td>ProtectedEscrow</td><td><a href={contractUrl(PROTECTED)}><code>{PROTECTED}</code></a></td></tr>
                  <tr><td>Default arbiter</td><td><code>{DEFAULT_ARBITER}</code></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </article>

        <nav className="toc" aria-label="On this page">
          <span>On this page</span>
          <ol>
            {toc.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}
          </ol>
        </nav>
      </main>
    </div>
  );
}
