import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Docs · Nyquist402" };

const ESCROW_TESTNET = "CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI";
const SPEC_URL =
  "https://github.com/enliven17/x402/blob/feat/stellar-auth-capture/specs/schemes/auth-capture/scheme_auth_capture_stellar.md";

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
  extra: {
    paymentFlow: "escrow",        // or "authorization"
    captureMode: "sync",          // or "deferred"
    captureDeadlineSeconds: 3600,
    refundDeadlineSeconds: 86400,
  },
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
await lifecycle.voidPayment(paymentHash);
await lifecycle.refund(paymentHash, { amount: "2000000" });`;

const facilitatorCode = `import { x402Facilitator } from "@x402/core/facilitator";
import { createEd25519Signer } from "@x402/stellar";
import { AuthCaptureStellarScheme } from "@x402/stellar/auth-capture/facilitator";

const facilitator = new x402Facilitator().register(
  "stellar:testnet",
  new AuthCaptureStellarScheme([createEd25519Signer(process.env.OPERATOR_PRIVATE_KEY!)], {
    feeTerms: { minFeeBps: 0, maxFeeBps: 0 },
  }),
);`;

const flows = [
  ["escrow", "sync", "authorize", "capture the final amount; release the rest"],
  ["escrow", "deferred", "authorize", "nothing; capture or void later"],
  ["authorization", "–", "verify", "charge the final amount"],
];

const contract = [
  ["authorize(payment_info)", "operator, payer", "Hold max_amount in escrow"],
  ["charge(payment_info, amount, fee_amount, fee_receiver)", "operator, payer, consent", "Pay amount, return the rest"],
  ["capture(payment_info, amount, fee_amount, fee_receiver, void_remainder)", "operator, consent", "Pay from the hold"],
  ["void(payment_info)", "operator, consent", "Release the hold"],
  ["refund(payment_info, amount, funder)", "operator, consent, funder", "Return captured funds from funder"],
  ["reclaim(payment_info)", "payer", "Recover the hold after the capture deadline"],
];

export default function Docs() {
  return (
    <main>
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none" }}><Logo size={24} /></a>
        <div className="nav-links">
          <a href="/demo">Demo</a>
          <a href={SPEC_URL}>Spec</a>
        </div>
      </nav>

      <section>
        <h1>Docs</h1>
        <p className="lead">
          Accept refundable x402 payments on Stellar. The mechanism lives in <code>@x402/stellar</code> under{" "}
          <code>auth-capture/client</code>, <code>auth-capture/server</code>, and <code>auth-capture/facilitator</code>.
          Until the upstream PR is merged, install it from the{" "}
          <a href="https://github.com/enliven17/x402/tree/feat/stellar-auth-capture">fork</a>.
        </p>
      </section>

      <section>
        <h2>Roles</h2>
        <div className="grid">
          <div className="card">
            <h3>Agent (client)</h3>
            <p>Signs one Soroban authorization entry per payment. Needs the token, no XLM.</p>
          </div>
          <div className="card">
            <h3>Seller (server)</h3>
            <p>Prices the route, decides the final amount, and signs consent for capture, void and refund.</p>
          </div>
          <div className="card">
            <h3>Facilitator</h3>
            <p>Operator of the escrow. Submits every call and pays network fees. Never moves its own funds.</p>
          </div>
        </div>
      </section>

      <section>
        <h2>Seller</h2>
        <pre><code>{sellerCode}</code></pre>
        <table style={{ marginTop: 24 }}>
          <thead>
            <tr><th><code>paymentFlow</code></th><th><code>captureMode</code></th><th>Before handler</th><th>After handler</th></tr>
          </thead>
          <tbody>
            {flows.map(row => (
              <tr key={row.join()}>{row.map(c => <td key={c}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 16 }}>
          A settlement override sets the final amount. A failed handler after authorize voids the hold.
        </p>
        <h3 style={{ marginTop: 32 }}>Capture, void and refund later</h3>
        <pre><code>{lifecycleCode}</code></pre>
      </section>

      <section>
        <h2>Agent</h2>
        <pre><code>{agentCode}</code></pre>
      </section>

      <section>
        <h2>Facilitator</h2>
        <pre><code>{facilitatorCode}</code></pre>
        <p className="muted" style={{ marginTop: 16 }}>
          The facilitator authorizes only as transaction source, through an explicit entry limited to the escrow call.
          It rejects payloads that name its own addresses in any value-bearing role.
        </p>
      </section>

      <section>
        <h2>Contract</h2>
        <table>
          <thead>
            <tr><th>Function</th><th>Authorized by</th><th>Effect</th></tr>
          </thead>
          <tbody>
            {contract.map(([fn, auth, effect]) => (
              <tr key={fn}><td><code>{fn}</code></td><td>{auth}</td><td>{effect}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 16 }}>
          Consent comes from <code>receiver_authorizer</code>, or <code>receiver</code> when unset, and covers the exact
          call arguments. The escrow rejects the operator as consent address or refund funder.
        </p>
        <p style={{ marginTop: 16 }}>
          Testnet: <code>{ESCROW_TESTNET}</code>
        </p>
      </section>

      <footer>Not audited · MIT</footer>
    </main>
  );
}
