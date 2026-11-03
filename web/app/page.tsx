import "./landing.css";
import { Logo, Mark } from "@/components/Logo";
import Lifecycle from "@/components/landing/Lifecycle";
import Motion from "@/components/landing/Motion";

const REPO_URL = "https://github.com/enliven17/nyquist402";
const SPEC_PR = "https://github.com/x402-foundation/x402/pull/4124";
const ISSUE_URL = "https://github.com/x402-foundation/x402/issues/4122";
const ESCROW = "CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI";
const ESCROW_URL = `https://stellar.expert/explorer/testnet/contract/${ESCROW}`;

const rail = ["Overview", "The gap", "Lifecycle", "Use cases", "Status", "Start", "FAQ"];
const ticker = ["x402 v2", "auth-capture", "Soroban", "Stellar Asset Contract", "HTTP 402", "CAP-71 auth", "stellar:testnet"];

// Hero signal: a sampled wave under the authorized ceiling, the same idea as the mark.
const W = 640;
const samples = Array.from({ length: 17 }, (_, i) => {
  const x = 20 + i * 37.5;
  const y = 200 - Math.sin(i * 0.55) * 70 - Math.sin(i * 1.3) * 28;
  return { x, y: Math.min(Math.max(y, 80), 250) };
});
const wave = samples.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
const hold = samples.map((p, i) => `${i ? `H${p.x.toFixed(1)}V` : `M${p.x.toFixed(1)} `}${p.y.toFixed(1)}`).join("");

const features = [
  {
    title: "Consent, enforced onchain",
    text: "Capture, void and refund need the seller's own authorization entry over the exact arguments. The contract checks it, not the facilitator.",
    icon: "M8 32h32M14 32V18h20v14M20 18v-5a4 4 0 0 1 8 0v5",
  },
  {
    title: "Replay protection from the protocol",
    text: "Every Soroban authorization carries a nonce and an expiry ledger. Each consent is single-use without extra contract state.",
    icon: "M10 24a14 14 0 1 0 4-10M10 8v6h6M24 16v9l6 4",
  },
  {
    title: "One signature, no XLM for payers",
    text: "The agent signs once. The token transfer is a sub-invocation of that same entry, and the facilitator pays network fees.",
    icon: "M8 36c6-2 8-14 14-14s6 8 12 8 6-6 6-6M8 12h14",
  },
  {
    title: "Refunds anyone can fund",
    text: "The refund funder signs an entry rooted at the escrow call, so a seller, a treasury or an insurer can cover it.",
    icon: "M24 8v32M12 20l12-12 12 12M10 40h28",
  },
];

const uses = [
  ["AI agents", "Give an agent a ceiling, not a blank check. It authorizes the maximum per task and pays what the task used."],
  ["Inference APIs", "Bill by tokens generated. Hold the budget, capture the metered amount, release the rest."],
  ["Long-running jobs", "Rendering, training, crawling. Capture in parts as work completes, void if it fails."],
  ["Data marketplaces", "Pay for a query before the row count is known. Refund rows that fail validation."],
  ["Commerce", "Authorize at checkout, capture on shipment, refund within the window. Card semantics, settled on Stellar."],
  ["MCP tools", "Paid tool calls whose price depends on the result, with a clear path to make the buyer whole."],
];

const faq = [
  ["How is this different from the exact scheme?", "exact moves a fixed amount the moment the client signs, and it is final. auth-capture holds up to a signed maximum in escrow. The seller then captures any amount up to it, releases the rest, and can refund later."],
  ["Who holds the funds during a hold?", "The escrow contract. Funds leave it only through capture, void, refund or reclaim. If the seller never acts, the payer reclaims the whole hold after the capture deadline."],
  ["Can the facilitator move funds on its own?", "No. It submits transactions and pays fees. Every capture, void and refund needs the seller's consent entry, and the contract rejects the facilitator as consent address or refund funder."],
  ["Does the payer need XLM?", "No. The payer signs an authorization entry and holds only the payment token. The facilitator is the transaction source."],
  ["Is it compatible with auth-capture on EVM?", "It is the same scheme and lifecycle in x402 v2. The Stellar binding is a separate spec that maps each step to Soroban authorization instead of ERC-3009 or Permit2."],
  ["Is it audited?", "Not yet. The escrow is live on testnet. An audit comes before any mainnet deployment."],
];

export default function Home() {
  return (
    <div className="landing">
      <Motion />

      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="/" className="topbar-logo"><Logo size={26} /></a>
          <nav className="topbar-links">
            <a href="#lifecycle">How it works</a>
            <a href="/docs">Docs</a>
            <a href={SPEC_PR}>Spec</a>
            <a href={REPO_URL}>GitHub</a>
          </nav>
          <a href="/demo" className="pill pill-accent">Run the demo <span aria-hidden>↗</span></a>
        </div>
      </header>

      <nav className="rail" data-rail aria-label="Sections">
        {rail.map((r, i) => (
          <a key={r} href={`#s${i + 1}`}><span>{String(i + 1).padStart(2, "0")}</span>{r}</a>
        ))}
      </nav>

      <main>
        {/* 01 Hero */}
        <section className="hero" id="s1" data-section>
          <div className="wrap">
            <div className="meta-row">
              <dl><dt>Scheme</dt><dd>auth-capture</dd></dl>
              <dl><dt>Network</dt><dd>stellar:testnet</dd></dl>
              <dl><dt>Status</dt><dd><span className="live" />Live · not audited</dd></dl>
            </div>
            <div className="rule" data-line />

            <div className="hero-grid">
              <div>
                <h1 className="h-xl" data-split="now">Charge what<br />the work cost.</h1>
                <p className="lead" data-reveal>
                  Nyquist402 brings the x402 <code>auth-capture</code> scheme to Stellar. Agents authorize a maximum,
                  sellers capture the real price, and every payment can be voided or refunded onchain.
                </p>
                <div className="cta-row" data-reveal>
                  <a href="/demo" className="pill pill-accent pill-lg">Run the testnet demo <span aria-hidden>↗</span></a>
                  <a href={SPEC_PR} className="pill pill-lg">Read the spec</a>
                </div>
              </div>

              <figure className="signal" aria-hidden>
                <svg viewBox={`0 0 ${W} 300`}>
                  {Array.from({ length: 9 }, (_, i) => (
                    <path key={i} d={`M${20 + i * 75} 40V272`} className="grid-v" />
                  ))}
                  <path d="M10 272H630" className="axis" />
                  <path d="M10 66H630" className="ceiling" data-draw />
                  <text x="14" y="56" className="t-sub">max_amount · 1.00</text>
                  <path d={hold} className="hold" data-draw />
                  <path d={wave} className="wave" data-draw />
                  {samples.map((p) => (
                    <g key={p.x} className="stem" data-stem>
                      <path d={`M${p.x} 272V${p.y}`} />
                      <circle cx={p.x} cy={p.y} r="4" />
                    </g>
                  ))}
                  <text x="14" y="292" className="t-sub">authorize → capture → void → refund</text>
                </svg>
                <span className="crosshair c1" /><span className="crosshair c2" />
              </figure>
            </div>
          </div>

          <div className="ticker" aria-hidden>
            <div className="ticker-track">
              {[...ticker, ...ticker, ...ticker, ...ticker].map((t, i) => (
                <span key={i}>{t}<i>✳</i></span>
              ))}
            </div>
          </div>
        </section>

        {/* 02 The gap */}
        <section className="why" id="s2" data-section>
          <div className="wrap">
            <p className="eyebrow"><span className="tick" />02 · The gap</p>
            <h2 className="h-lg" data-split>Final at signature<br />is not a business model.</h2>

            <div className="panel" data-reveal>
              <div className="panel-grid" />
              <div className="panel-row">
                <div className="panel-label"><code>exact</code><span>today on Stellar</span></div>
                <div className="bar"><div className="bar-fill bar-exact" data-line /><b>1 transfer · amount fixed when the client signs</b></div>
              </div>
              <div className="panel-row">
                <div className="panel-label"><code>auth-capture</code><span>Nyquist402</span></div>
                <div className="bar"><div className="bar-fill bar-ac" data-line /><b>hold → capture → void → refund · amount fixed after the work</b></div>
              </div>
              <div className="panel-foot">
                <span>6 escrow operations</span><span>partial capture</span><span>refund window</span><span>payer reclaim</span>
              </div>
            </div>

            <div className="why-copy">
              <p className="t-cap">Problem</p>
              <p className="fill-text" data-fill>
                Every x402 payment on Stellar settles once, for a price known in advance. Metered inference,
                long-running jobs and buyer protection need a payment that can change after it starts.
              </p>
            </div>
          </div>
        </section>

        {/* 03 Lifecycle, pinned */}
        <div id="s3"><Lifecycle /></div>

        {/* Soroban features */}
        <section className="features">
          <div className="wrap">
            <p className="eyebrow"><span className="tick" />Built for Soroban</p>
            <h2 className="h-lg" data-split>Stronger on Stellar<br />than where it started.</h2>
            <div className="feature-grid">
              {features.map((f, i) => (
                <article className="feature" key={f.title} data-reveal>
                  <div className="feature-art">
                    <span className="feature-n">{String(i + 1).padStart(2, "0")}</span>
                    <svg viewBox="0 0 48 48" aria-hidden><path d={f.icon} /></svg>
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 04 Use cases */}
        <section className="uses" id="s4" data-section>
          <div className="wrap">
            <p className="eyebrow"><span className="tick" />04 · Use cases</p>
            <h2 className="h-lg" data-split>For anything priced<br />after it runs.</h2>
            <ul className="use-list">
              {uses.map(([name, text]) => (
                <li key={name} data-reveal>
                  <span className="use-name">{name}</span>
                  <span className="use-text">{text}</span>
                  <span className="use-arrow" aria-hidden>↗</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 05 Proof */}
        <section className="proof" id="s5" data-section>
          <div className="wrap">
            <p className="eyebrow"><span className="tick" />05 · Status</p>
            <div className="proof-grid">
              <blockquote className="proof-quote" data-fill>
                The escrow is deployed on testnet, the mechanism ships inside the official <em>@x402/stellar</em> SDK,
                and the Stellar binding is <em>under review at the x402 Foundation</em>.
              </blockquote>
              <dl className="stats">
                <div><dt><span data-count="24">24</span></dt><dd>contract tests, incl. a randomized invariant run</dd></div>
                <div><dt><span data-count="317">317</span></dt><dd>SDK unit tests across client, server, facilitator</dd></div>
                <div><dt><span data-count="1">1</span></dt><dd>signature from the payer per payment</dd></div>
                <div><dt><span data-count="0">0</span></dt><dd>XLM the payer needs to hold</dd></div>
              </dl>
            </div>
            <a href={ESCROW_URL} className="contract-chip" data-reveal>
              <span>Escrow · testnet</span><code>{ESCROW.slice(0, 10)}…{ESCROW.slice(-10)}</code><span aria-hidden>↗</span>
            </a>
          </div>
        </section>

        {/* 06 Start */}
        <section className="start" id="s6" data-section>
          <div className="wrap">
            <p className="eyebrow"><span className="tick" />06 · Get started</p>
            <h2 className="h-lg" data-split>Three roles.<br />One package.</h2>
            <div className="start-grid">
              {[
                ["Seller", "Price the route and sign consent for capture, void and refund.", `new AuthCaptureStellarScheme({\n  consentSigner: receiver,\n})`],
                ["Agent", "Sign one authorization per payment. Hold only the token.", `new x402Client().register(\n  "stellar:testnet",\n  new AuthCaptureStellarScheme(agent),\n)`],
                ["Facilitator", "Operate the escrow, submit calls, pay fees. Never move its own funds.", `new AuthCaptureStellarScheme(\n  [operator],\n  { feeTerms: { maxFeeBps: 0 } },\n)`],
              ].map(([role, text, code]) => (
                <article className="start-card" key={role} data-reveal>
                  <div className="start-head"><h3>{role}</h3><span className="t-cap">@x402/stellar/auth-capture</span></div>
                  <p>{text}</p>
                  <pre><code>{code}</code></pre>
                </article>
              ))}
            </div>
            <div className="cta-row">
              <a href="/docs" className="pill pill-ink pill-lg">Read the docs <span aria-hidden>→</span></a>
              <a href="/demo" className="pill pill-lg">Open the demo</a>
            </div>
          </div>
        </section>

        {/* 07 FAQ */}
        <section className="faq" id="s7" data-section>
          <div className="wrap faq-grid">
            <div>
              <p className="eyebrow eyebrow-dark"><span className="tick" />07 · FAQ</p>
              <h2 className="h-lg" data-split>Common<br />questions</h2>
            </div>
            <div className="faq-list">
              {faq.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}<span aria-hidden>+</span></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="band">
          <div className="wrap band-inner">
            <Mark size={56} className="band-mark" />
            <h2 className="h-lg" data-split>Hold. Capture. Refund.</h2>
            <a href="/demo" className="pill pill-paper pill-lg">Run it on testnet <span aria-hidden>↗</span></a>
          </div>
        </section>

        {/* Resources */}
        <section className="resources">
          <div className="wrap">
            <p className="eyebrow"><span className="tick" />Resources</p>
            <div className="res-grid">
              {[
                ["Spec", "Stellar binding for auth-capture", "x402-foundation/x402 #4124", SPEC_PR],
                ["Proposal", "Scheme proposal and discussion", "x402-foundation/x402 #4122", ISSUE_URL],
                ["Docs", "Seller, agent and facilitator setup", "nyquist402 / docs", "/docs"],
                ["Demo", "Full lifecycle with real transactions", "stellar:testnet", "/demo"],
              ].map(([kind, title, sub, href]) => (
                <a className="res" key={kind} href={href} data-reveal>
                  <span className="t-cap">{kind}</span>
                  <span className="res-title">{title}</span>
                  <span className="res-sub">{sub}<span aria-hidden>↗</span></span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot-cols">
            <div><Logo size={22} /><p className="t-cap" style={{ marginTop: 14 }}>Refundable x402 payments on Stellar.</p></div>
            <div><p className="t-cap">Product</p><a href="/demo">Demo</a><a href="/docs">Docs</a><a href="#lifecycle">How it works</a></div>
            <div><p className="t-cap">Protocol</p><a href={SPEC_PR}>Spec PR</a><a href={ISSUE_URL}>Proposal</a><a href={ESCROW_URL}>Escrow</a></div>
            <div><p className="t-cap">Source</p><a href={REPO_URL}>GitHub</a><span>MIT license</span><span>Not audited</span></div>
          </div>
        </div>
        <div className="foot-word" aria-hidden><span data-parallax="-18">nyquist402</span></div>
      </footer>
    </div>
  );
}
