import { PROTECTED_CONTRACT } from "@/lib/deployment";
import "./landing.css";
import { Logo, Mark } from "@/components/Logo";
import HeroFigure from "@/components/landing/HeroFigure";
import Lifecycle from "@/components/landing/Lifecycle";
import Motion from "@/components/landing/Motion";

const REPO_URL = "https://github.com/enliven17/nyquist402";
const SPEC_PR = "https://github.com/x402-foundation/x402/pull/4124";
const ISSUE_URL = "https://github.com/x402-foundation/x402/issues/4122";
const ESCROW = PROTECTED_CONTRACT;
const ESCROW_URL = `https://stellar.expert/explorer/testnet/contract/${ESCROW}`;


const features = [
  {
    title: "Agreements, enforced onchain",
    text: "Both parties sign the budget, review policy, arbiter and terminal fallback.",
    icon: "M8 32h32M14 32V18h20v14M20 18v-5a4 4 0 0 1 8 0v5",
  },
  {
    title: "Independent delivery claims",
    text: "Each claim reserves its own budget and can settle only once.",
    icon: "M10 24a14 14 0 1 0 4-10M10 8v6h6M24 16v9l6 4",
  },
  {
    title: "Review before settlement",
    text: "Buyers accept deliveries or dispute them within the agreed review window.",
    icon: "M8 36c6-2 8-14 14-14s6 8 12 8 6-6 6-6M8 12h14",
  },
  {
    title: "Bounded arbitration",
    text: "The current arbiter can allocate only the disputed reservation.",
    icon: "M24 8v32M12 20l12-12 12 12M10 40h28",
  },
];

const uses = [
  ["AI agents", "A spending ceiling per task, not a blank check."],
  ["Inference APIs", "Bill by tokens generated."],
  ["Long-running jobs", "Review partial deliveries independently."],
  ["Data marketplaces", "Pay before the row count is known."],
  ["Commerce", "Fund a budget and review delivery claims."],
  ["MCP tools", "Tool calls priced by their result."],
];

const faq = [
  ["How does protected settlement work?", "The buyer funds an agreed budget. The seller records delivery claims; each claim has its own review and dispute process."],
  ["What happens if an arbiter does not respond?", "Authority passes to the pinned default. After its window ends, an eligible caller can apply the fallback both parties signed."],
  ["Does the demo mint its own token?", "No. It uses Circle’s official Stellar testnet USDC. Add the trustline and use Circle’s faucet; test XLM pays network fees."],
  ["Is it audited or on mainnet?", "The protected contract is deployed on Stellar Testnet. It is unaudited; this demo uses test USDC and no mainnet funds."],
];

export default function Home() {
  return (
    <div className="landing">
      <Motion />



      <main>
        {/* 01 Hero */}
        <section className="hero" id="s1" data-section>
          <div className="wrap">

            <div className="hero-grid">
              <div>
                <h1 className="hero-title" data-split="now">Charge what<br />the work cost.</h1>
                <p className="lead" data-reveal>
                  Fund a budget. Review the delivery. Settle in USDC on Stellar.
                </p>
                <div className="cta-row" data-reveal>
                  <a href="/demo" className="pill pill-accent pill-lg">Run the testnet demo <span aria-hidden>↗</span></a>
                  <a href="/docs" className="pill pill-lg">Read the protocol</a>
                </div>
              </div>

              <HeroFigure />
            </div>
          </div>

        </section>

        {/* 02 The gap */}
        <section className="why" id="s2" data-section>
          <div className="wrap">
            <h2 className="h-lg" data-split>One budget.<br />Every delivery reviewed.</h2>

            <div className="panel" data-reveal>
              <div className="panel-grid" />
              <div className="panel-row">
                <div className="panel-label"><code>exact</code><span>today on Stellar</span></div>
                <div className="bar"><div className="bar-fill bar-exact" data-line /><b>1 transfer · amount fixed when the client signs</b></div>
              </div>
              <div className="panel-row">
                <div className="panel-label"><code>protected</code><span>Nyquist402</span></div>
                <div className="bar"><div className="bar-fill bar-ac" data-line /><b>fund → claim → review → settle or resolve</b></div>
              </div>
            </div>

            <div className="why-copy">
              <p className="fill-text" data-fill>
                Each delivery is reviewed before it settles.
              </p>
            </div>
          </div>
        </section>

        {/* 03 Lifecycle, pinned */}
        <div id="s3"><Lifecycle /></div>

        {/* Soroban features */}
        <section className="features">
          <div className="wrap">
            <h2 className="h-lg" data-split>Shared terms.<br />Clear authority.</h2>
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
            <div className="proof-grid">
              <blockquote className="proof-quote" data-fill>
                Protected escrow on testnet. <em>Official Circle test USDC.</em>
              </blockquote>
              <dl className="stats">
                <div><dt>3</dt><dd>participant roles</dd></div>
                <div><dt>1</dt><dd>unified demo</dd></div>
                <div><dt>USDC</dt><dd>Circle testnet asset</dd></div>
                <div><dt>Testnet</dt><dd>not audited</dd></div>
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
            <h2 className="h-lg" data-split>Three roles.<br />One flow.</h2>
            <div className="start-grid">
              {[
                ["Buyer", "Agree the budget and review each delivery. Accept a claim or submit evidence for a dispute."],
                ["Seller", "Perform the work, record exact delivery claims and respond to case evidence."],
                ["Arbiter", "Read the current evidence and sign a bounded award within your assigned ruling window."],
              ].map(([role, code]) => (
                <article className="start-card" key={role} data-reveal>
                  <div className="start-head"><h3>{role}</h3><span className="t-cap">protected payments</span></div>
                  <p>{code}</p>
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
            <h2 className="h-lg" data-split>Fund. Review. Resolve.</h2>
            <a href="/demo" className="pill pill-paper pill-lg">Run it on testnet <span aria-hidden>↗</span></a>
          </div>
        </section>

      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot-cols">
            <div><Logo size={22} /></div>
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
