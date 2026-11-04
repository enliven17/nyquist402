// Docs diagrams. Inline SVG, theme tokens only, CSS-driven motion that stops under
// prefers-reduced-motion. Each figure carries a <title> and <desc> for screen readers.

type Box = { x: number; y: number; w: number; h: number; label: string; sub?: string; tone?: "ink" | "accent" | "plain" };

function Node({ x, y, w, h, label, sub, tone = "plain" }: Box) {
  return (
    <g className={`dg-node dg-${tone}`}>
      <rect x={x} y={y} width={w} height={h} />
      <text x={x + 14} y={y + (sub ? 28 : h / 2 + 5)} className="dg-label">{label}</text>
      {sub && <text x={x + 14} y={y + 48} className="dg-sub">{sub}</text>}
    </g>
  );
}

/** An edge with a dashed flow and a packet that travels along it. */
function Edge({ d, label, lx, ly, delay = 0, anchor = "middle" }: {
  d: string; label: string; lx: number; ly: number; delay?: number; anchor?: "start" | "middle" | "end";
}) {
  return (
    <g className="dg-edge">
      <path d={d} className="dg-wire" markerEnd="url(#dg-arrow)" />
      <path d={d} className="dg-flow" />
      <circle r="4" className="dg-packet" style={{ offsetPath: `path("${d}")`, animationDelay: `${delay}s` }} />
      <text x={lx} y={ly} textAnchor={anchor} className="dg-edge-label">{label}</text>
    </g>
  );
}

function Arrow() {
  return (
    <defs>
      <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" className="dg-arrowhead" />
      </marker>
    </defs>
  );
}

export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 960 440" className="dg" role="img" aria-labelledby="arch-t arch-d">
      <title id="arch-t">Nyquist402 architecture</title>
      <desc id="arch-d">
        A buyer pays a seller API over HTTP 402. The facilitator verifies and settles basic payments through the
        auth-capture escrow. Protected payments are funded by the buyer directly; the seller records claims and the
        arbiter rules. Both escrows move the payment token.
      </desc>
      <Arrow />
      <rect x="0" y="236" width="960" height="204" className="dg-band" />
      <text x="20" y="262" className="dg-band-label">SOROBAN · ONCHAIN</text>
      <text x="20" y="26" className="dg-band-label">OFFCHAIN</text>

      <Node x={30} y={60} w={180} h={66} label="Buyer / agent" sub="wallet or key" tone="ink" />
      <Node x={270} y={60} w={180} h={66} label="Seller API" sub="x402 resource server" />
      <Node x={510} y={60} w={180} h={66} label="Facilitator" sub="submits, pays fees" />
      <Node x={750} y={60} w={180} h={66} label="Arbiter" sub="custom or default" />

      <Node x={120} y={300} w={210} h={66} label="AuthCaptureEscrow" sub="hold · capture · refund" tone="accent" />
      <Node x={400} y={300} w={210} h={66} label="ProtectedEscrow" sub="claims · disputes · rulings" tone="accent" />
      <Node x={680} y={300} w={200} h={66} label="Payment token" sub="Stellar Asset Contract" />

      <Edge d="M210 93H266" label="HTTP 402" lx={238} ly={48} />
      <Edge d="M450 93H506" label="verify · settle" lx={478} ly={48} delay={0.6} />
      <Edge d="M580 126C580 210 300 220 250 296" label="authorize · capture · void · refund" lx={430} ly={196} delay={1.2} />
      <Edge d="M120 126C120 230 420 230 470 296" label="fund · accept · dispute · reclaim" lx={190} ly={250} anchor="start" delay={0.3} />
      <Edge d="M360 126C360 200 500 220 520 296" label="claim · evidence" lx={430} ly={164} delay={0.9} />
      <Edge d="M840 126C840 230 620 230 590 296" label="rule" lx={790} ly={214} delay={1.5} />
      <Edge d="M330 340C420 410 640 410 700 368" label="transfer" lx={520} ly={414} delay={1.8} />
      <Edge d="M610 333H676" label="" lx={0} ly={0} delay={2.1} />
    </svg>
  );
}

/** Basic auth-capture: bars replay authorize → capture 0.60 + release 0.40 → refund 0.20. */
export function BasicLifecycleDiagram() {
  const rows = [
    { key: "buyer", label: "Buyer" },
    { key: "escrow", label: "Escrow hold" },
    { key: "seller", label: "Seller" },
  ];
  const steps = ["authorize 1.00", "capture 0.60", "release 0.40", "refund 0.20"];
  return (
    <svg viewBox="0 0 960 300" className="dg dg-basic" role="img" aria-labelledby="bl-t bl-d">
      <title id="bl-t">Basic auth-capture balances</title>
      <desc id="bl-d">
        The buyer authorizes 1.00 into the escrow hold. The seller captures 0.60, the remaining 0.40 is released to
        the buyer, and later 0.20 is refunded. Final balances: buyer 0.60 back in total, seller 0.40.
      </desc>
      {steps.map((s, i) => (
        <g key={s} className={`bl-step bl-step-${i}`}>
          <rect x={30 + i * 230} y={20} width={214} height={36} />
          <text x={44 + i * 230} y={43}>{String(i + 1).padStart(2, "0")} · {s}</text>
        </g>
      ))}
      {rows.map((r, i) => (
        <g key={r.key} transform={`translate(0 ${100 + i * 64})`}>
          <text x={30} y={22} className="dg-label">{r.label}</text>
          <rect x={200} y={6} width={700} height={24} className="bl-track" />
          <rect x={200} y={6} width={700} height={24} className={`bl-fill bl-${r.key}`} />
        </g>
      ))}
      <text x={900} y={288} textAnchor="end" className="dg-sub">scale: 1.00 DEMOUSD = full bar</text>
    </svg>
  );
}

/** Claim state machine for protected settlement. */
export function ClaimStateDiagram() {
  return (
    <svg viewBox="0 0 960 330" className="dg" role="img" aria-labelledby="cs-t cs-d">
      <title id="cs-t">Protected claim lifecycle</title>
      <desc id="cs-d">
        A seller records a claim, which enters review. The buyer accepts or review expires, and the claim settles.
        Either party may dispute during review. After evidence closes, the current arbiter rules; if every ruling
        window passes, anyone can apply the signed fallback split.
      </desc>
      <Arrow />
      <Node x={20} y={130} w={150} h={64} label="Recorded" sub="seller claims" />
      <Node x={250} y={130} w={150} h={64} label="Review" sub="budget reserved" tone="ink" />
      <Node x={520} y={30} w={170} h={64} label="Paid" sub="accept or expiry" tone="accent" />
      <Node x={520} y={230} w={170} h={64} label="Disputed" sub="both add evidence" />
      <Node x={780} y={170} w={160} h={64} label="Ruled" sub="seller / buyer split" tone="accent" />
      <Node x={780} y={262} w={160} h={56} label="Fallback" sub="signed split" />

      <Edge d="M170 162H246" label="claim()" lx={208} ly={152} />
      <Edge d="M400 150C460 110 470 62 516 62" label="accept() · settle()" lx={410} ly={128} anchor="start" delay={0.5} />
      <Edge d="M400 176C460 220 470 262 516 262" label="dispute()" lx={448} ly={236} anchor="start" delay={1} />
      <Edge d="M690 252C730 230 740 205 776 202" label="rule()" lx={745} ly={222} delay={1.5} />
      <Edge d="M690 280H776" label="finalize_fallback()" lx={605} ly={316} delay={2} />
    </svg>
  );
}

/** Deadline windows; a playhead sweeps across the case lifetime. */
export function DeadlineDiagram() {
  const lanes = [
    { label: "Session", from: 0, to: 6, tone: "line", note: "accepts new claims" },
    { label: "Claim review", from: 1, to: 3, tone: "ink", note: "accept, or dispute before it closes" },
    { label: "Evidence", from: 2.2, to: 3.6, tone: "line", note: "both parties respond" },
    { label: "Chosen arbiter", from: 3.6, to: 5.1, tone: "accent", note: "custom selection rules" },
    { label: "Default arbiter", from: 5.1, to: 6.6, tone: "accent-soft", note: "takes over if the first is silent" },
    { label: "Fallback", from: 6.6, to: 8, tone: "line", note: "signed split, anyone executes" },
  ];
  const x = (t: number) => 190 + t * 92;
  return (
    <svg viewBox="0 0 960 330" className="dg dg-time" role="img" aria-labelledby="dl-t dl-d">
      <title id="dl-t">Deadline windows</title>
      <desc id="dl-d">
        A session accepts claims until its delivery deadline. Each claim has its own review window. A dispute opens an
        evidence window, then the chosen arbiter's window, then the default arbiter's window. When all pass, the
        signed fallback split can be applied.
      </desc>
      {lanes.map((l, i) => (
        <g key={l.label} transform={`translate(0 ${30 + i * 46})`}>
          <text x={20} y={20} className="dg-label">{l.label}</text>
          <line x1={190} x2={940} y1={15} y2={15} className="dl-grid" />
          <rect x={x(l.from)} y={4} width={x(l.to) - x(l.from)} height={22} className={`dl-bar dl-${l.tone}`} />
          {l.from > 3 ? <text x={x(l.from) - 8} y={20} textAnchor="end" className="dg-sub">{l.note}</text> : <text x={x(l.to) + 8} y={20} className="dg-sub">{l.note}</text>}
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={20} y2={310} className="dl-head" />
    </svg>
  );
}

/** Arbiter selection: matching preferences pick the custom arbiter, otherwise the pinned default. */
export function ArbiterSelectionDiagram() {
  return (
    <svg viewBox="0 0 960 230" className="dg" role="img" aria-labelledby="as-t as-d">
      <title id="as-t">Arbiter selection</title>
      <desc id="as-d">
        The buyer and seller each name a preferred arbiter in the signed terms. If both name the same arbiter it
        handles disputes, with the project default as backup. Otherwise the project default handles them.
      </desc>
      <Arrow />
      <Node x={20} y={30} w={190} h={56} label="Buyer preference" />
      <Node x={20} y={140} w={190} h={56} label="Seller preference" />
      <g className="dg-node dg-ink">
        <polygon points="420,48 520,113 420,178 320,113" />
        <text x={420} y={108} textAnchor="middle" className="dg-label">same</text>
        <text x={420} y={128} textAnchor="middle" className="dg-label">arbiter?</text>
      </g>
      <Node x={640} y={24} w={290} h={64} label="Chosen arbiter rules" sub="default stays as backup" tone="accent" />
      <Node x={640} y={140} w={290} h={64} label="Project default rules" sub="pinned at deployment" />
      <Edge d="M210 58C270 58 290 90 330 104" label="" lx={0} ly={0} />
      <Edge d="M210 168C270 168 290 136 330 122" label="" lx={0} ly={0} delay={0.4} />
      <Edge d="M520 113C580 113 580 56 636 56" label="yes" lx={590} ly={74} delay={0.8} />
      <Edge d="M500 126C580 160 600 172 636 172" label="no" lx={590} ly={186} delay={1.2} />
    </svg>
  );
}

/** Protected payment buckets: reclaim can only take the available bucket. */
export function BucketsDiagram() {
  const buckets = [
    { label: "Available", value: "3.00", w: 210, tone: "line", note: "unclaimed" },
    { label: "Reserved", value: "4.00", w: 280, tone: "accent", note: "claim in review or dispute" },
    { label: "Paid to seller", value: "3.00", w: 210, tone: "ink", note: "accepted claim" },
  ];
  let cursor = 30;
  return (
    <svg viewBox="0 0 960 230" className="dg dg-buckets" role="img" aria-labelledby="bk-t bk-d">
      <title id="bk-t">Protected payment buckets</title>
      <desc id="bk-d">
        A 10.00 budget split into 3.00 available, 4.00 reserved by a disputed claim and 3.00 already paid. After the
        session expires, reclaim returns only the 3.00 available. The reserved claim stays in escrow until it is
        ruled or falls back.
      </desc>
      <Arrow />
      {buckets.map(b => {
        const x = cursor;
        cursor += b.w + 10;
        return (
          <g key={b.label} className={`bk bk-${b.tone}`}>
            <rect x={x} y={40} width={b.w} height={70} />
            <text x={x + 14} y={68} className="dg-label">{b.label}</text>
            <text x={x + 14} y={94} className="dg-sub">{b.value} · {b.note}</text>
          </g>
        );
      })}
      <text x={30} y={28} className="dg-sub">10.00 budget</text>
      <Edge d="M135 112C135 170 135 170 135 186" label="" lx={0} ly={0} />
      <Node x={30} y={186} w={250} h={38} label="reclaim() returns 3.00" tone="ink" />
      <g className="bk-lock">
        <rect x={330} y={186} width={280} height={38} />
        <text x={344} y={210} className="dg-label">reserved stays until ruled</text>
      </g>
    </svg>
  );
}
