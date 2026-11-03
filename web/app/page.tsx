const REPO_URL = "https://github.com/enliven17/nyquist402";
const ESCROW_TESTNET = "CAZUU5HON2LQBRLWNTQX2NFWB7AYMCZRZT6C6N7KUPP6AOAXNFCF6FK2";
const ISSUE_URL = "https://github.com/x402-foundation/x402/issues/4122";
const SPEC_URL =
  "https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture.md";

const operations = [
  { name: "authorize", text: "Payer signs once. The full amount moves into escrow as a hold." },
  { name: "capture", text: "Server takes what the work cost. Repeatable up to the hold." },
  { name: "void", text: "Server releases the rest of the hold back to the payer." },
  { name: "refund", text: "Server returns captured funds before the refund deadline." },
  { name: "reclaim", text: "Payer recovers an untouched hold after the capture deadline." },
];

const comparison = [
  ["Amount", "Fixed when the client signs", "Up to a signed maximum, finalized later"],
  ["Settlement", "One transfer", "Hold, then capture"],
  ["Reversible", "No", "Void, refund, reclaim"],
  ["Use cases", "Fixed-price API calls", "Metered work, delayed delivery, buyer protection"],
];

const soroban = [
  {
    title: "One signature, no token collectors",
    text: "The payer signs a Soroban authorization entry for the escrow call. The token transfer is a sub-invocation of that same entry.",
  },
  {
    title: "Server consent enforced onchain",
    text: "Capture, void and refund require the receiver authorizer's own authorization entry. The contract checks it, not only the facilitator.",
  },
  {
    title: "Replay protection from the protocol",
    text: "Every authorization entry carries a nonce and an expiry ledger, so each consent is single-use by default.",
  },
];

export default function Home() {
  return (
    <main>
      <nav className="nav">
        <span className="logo">Nyquist402</span>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href={SPEC_URL}>Spec</a>
          <a href={REPO_URL}>GitHub</a>
        </div>
      </nav>

      <section>
        <span className="badge">Live on Stellar testnet · Not audited</span>
        <h1>Refundable x402 payments on Stellar</h1>
        <p className="lead">
          The <code>auth-capture</code> scheme for Stellar. Agents and users authorize a maximum, servers
          capture what the work cost, and every payment can be voided or refunded.
        </p>
        <div className="actions">
          <a className="btn btn-primary" href="#how">How it works</a>
          <a className="btn" href={REPO_URL}>View on GitHub</a>
        </div>
      </section>

      <section id="how">
        <h2>Payment lifecycle</h2>
        <div className="flow">
          <span className="step">authorize</span>
          <span className="arrow">→</span>
          <span className="step">capture / void</span>
          <span className="arrow">→</span>
          <span className="step">refund</span>
          <span className="arrow">·</span>
          <span className="step">reclaim after deadline</span>
        </div>
        <div className="grid" style={{ marginTop: 24 }}>
          {operations.map((op) => (
            <div className="card" key={op.name}>
              <h3><code>{op.name}</code></h3>
              <p>{op.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>
          <code>exact</code> vs <code>auth-capture</code>
        </h2>
        <table>
          <thead>
            <tr>
              <th></th>
              <th><code>exact</code></th>
              <th><code>auth-capture</code></th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(([label, exact, ac]) => (
              <tr key={label}>
                <td className="muted">{label}</td>
                <td>{exact}</td>
                <td>{ac}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Built for Soroban</h2>
        <div className="grid">
          {soroban.map((item) => (
            <div className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Status</h2>
        <table>
          <tbody>
            <tr>
              <td className="muted">Escrow (testnet)</td>
              <td>
                <a href={`https://lab.stellar.org/r/testnet/contract/${ESCROW_TESTNET}`}>
                  <code>{ESCROW_TESTNET.slice(0, 8)}…{ESCROW_TESTNET.slice(-8)}</code>
                </a>
              </td>
            </tr>
            <tr>
              <td className="muted">Spec</td>
              <td>
                <a href={ISSUE_URL}>x402-foundation/x402#4122</a>
              </td>
            </tr>
            <tr>
              <td className="muted">Mainnet</td>
              <td>After audit</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer>Open source · MIT · Not audited</footer>
    </main>
  );
}
