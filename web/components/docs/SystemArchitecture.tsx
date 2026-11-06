/** Service boundaries. The ledger remains authoritative; services do not gain allocation authority. */
export default function SystemArchitecture() {
  return <div className="docs-diagram" role="region" tabIndex={0} aria-label="System architecture diagram; scroll horizontally to read all components">
    <svg viewBox="0 0 960 520" className="dg docs-system" role="img" aria-labelledby="system-title system-description">
      <title id="system-title">Protected payment system architecture</title>
      <desc id="system-description">Buyer, seller and arbiter interfaces use the SDK. A facilitator verifies and submits transactions to Soroban escrow. History, evidence delivery and execution services support the lifecycle. Services cannot replace contract authorization or allocate funds independently.</desc>
      <defs><marker id="system-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="var(--muted)" /></marker></defs>
      <g fill="var(--surface)" stroke="var(--line)">
        <rect x="24" y="46" width="280" height="62" /><rect x="340" y="46" width="280" height="62" /><rect x="656" y="46" width="280" height="62" />
        <rect x="24" y="150" width="912" height="64" />
        <rect x="24" y="270" width="280" height="76" /><rect x="340" y="270" width="280" height="76" /><rect x="656" y="270" width="280" height="76" />
        <rect x="24" y="412" width="912" height="82" fill="var(--ink)" stroke="var(--ink)" />
      </g>
      <g fill="var(--ink)" fontFamily="var(--font-sans)" fontSize="18" textAnchor="middle">
        <text x="164" y="84">Buyer / agent</text><text x="480" y="84">Seller API / console</text><text x="796" y="84">Arbiter interface / adapter</text>
        <text x="480" y="178">SDK · capability negotiation · quote validation · signing · state reads</text>
        <text x="164" y="298">Facilitator</text><text x="480" y="298">Payment / case services</text><text x="796" y="298">Execution workers</text>
      </g>
      <g fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="12" textAnchor="middle">
        <text x="480" y="199">Versioned network and contract bindings</text>
        <text x="164" y="325">Verify · submit · track confirmation</text><text x="480" y="325">History · private evidence access</text><text x="796" y="325">Deadlines · reconciliation · storage TTL</text>
        <text x="480" y="446" fill="var(--paper)" fontSize="17">Soroban protected escrow + payment token</text>
        <text x="480" y="475" fill="var(--paper)">Principal · protocol reserve · arbitration reserve · claim and case state</text>
      </g>
      <g stroke="var(--muted)" fill="none" markerEnd="url(#system-arrow)">
        <path d="M164 108v40M480 108v40M796 108v40M164 214v54M480 214v54M796 214v54M164 346v64M796 346v64M480 410v-62" />
      </g>
      <text x="480" y="25" fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="11" textAnchor="middle">SERVICE ARCHITECTURE</text>
      <text x="480" y="385" fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="11" textAnchor="middle">Contract state is authoritative; service records are reconciled against it.</text>
    </svg>
  </div>;
}
