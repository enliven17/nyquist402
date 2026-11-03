"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// The same flow the testnet demo runs: hold 1.00, capture 0.60, release 0.40, refund 0.20.
const steps = [
  { n: "01", fn: "authorize", title: "Hold the maximum", text: "The agent signs one authorization entry. 1.00 moves into escrow." },
  { n: "02", fn: "capture", title: "Charge what it cost", text: "The work cost 0.60. The seller captures it with its own consent." },
  { n: "03", fn: "void", title: "Release the rest", text: "The remaining 0.40 returns to the agent in the same call." },
  { n: "04", fn: "refund", title: "Refund later", text: "Before the refund deadline, the seller returns 0.20." },
];

const calls = [
  "escrow.authorize(payment_info)",
  "escrow.capture(payment_info, 0.60, void_remainder: true)",
  "escrow.capture(payment_info, 0.60, void_remainder: true)",
  "escrow.refund(payment_info, 0.20, funder: seller)",
];

const GAUGE = { x: 452, top: 112, h: 150, w: 64 };

export default function Lifecycle() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const [agent, escrow, seller] = [0, 1, 2].map((i) => q<SVGTextElement>(`[data-bal="${i}"]`)[0]);
      const fill = q<SVGRectElement>("[data-fill-bar]")[0];
      const call = q<SVGTextElement>("[data-call]")[0];
      const items = q<HTMLElement>("[data-step]");
      const v = { a: 1000, e: 0, s: 0 };
      let active = -1;

      const render = (progress: number) => {
        agent.textContent = v.a.toFixed(2);
        escrow.textContent = v.e.toFixed(2);
        seller.textContent = v.s.toFixed(2);
        fill.setAttribute("height", String(GAUGE.h * v.e));
        fill.setAttribute("y", String(GAUGE.top + GAUGE.h * (1 - v.e)));
        const i = progress < 0.02 ? -1 : progress < 0.27 ? 0 : progress < 0.5 ? 1 : progress < 0.72 ? 2 : 3;
        if (i !== active) {
          active = i;
          items.forEach((el, j) => el.classList.toggle("on", j === i));
          call.textContent = i < 0 ? "awaiting payment" : `→ ${calls[i]}`;
        }
      };

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        Object.assign(v, { a: 999.6, e: 0, s: 0.4 });
        render(1);
        return;
      }

      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: { trigger: root.current, start: "top top", end: "+=320%", pin: true, scrub: 0.8 },
        onUpdate: () => render(tl.progress()),
      });

      const travel = (dot: string, points: [number, number][], at: number) => {
        tl.set(dot, { attr: { cx: points[0][0], cy: points[0][1] }, opacity: 1 }, at);
        points.slice(1).forEach(([cx, cy], k) => tl.to(dot, { attr: { cx, cy }, duration: 0.6 / (points.length - 1), ease: "none" }, at + (k * 0.6) / (points.length - 1)));
        tl.to(dot, { opacity: 0, duration: 0.1 }, at + 0.6);
      };

      tl.to(v, { a: 999, e: 1, duration: 0.8 }, 0.1);
      travel("#dot-a", [[230, 182], [350, 182]], 0.1);
      tl.to(v, { e: 0.4, s: 0.6, duration: 0.8 }, 1.1);
      travel("#dot-b", [[550, 182], [670, 182]], 1.1);
      tl.to(v, { e: 0, a: 999.4, duration: 0.8 }, 2.1);
      travel("#dot-c", [[450, 300], [450, 352], [130, 352], [130, 242]], 2.1);
      tl.to(v, { s: 0.4, a: 999.6, duration: 0.8 }, 3.1);
      travel("#dot-d", [[770, 242], [770, 352], [130, 352], [130, 242]], 3.1);
      tl.to({}, { duration: 0.3 });
      render(0);
    },
    { scope: root },
  );

  return (
    <section ref={root} className="lifecycle" id="lifecycle" data-section>
      <div className="wrap lifecycle-inner">
        <div className="lifecycle-copy">
          <p className="eyebrow"><span className="tick" />03 · Lifecycle</p>
          <h2 className="h-lg">One payment.<br />Four moves.</h2>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.n} data-step>
                <span className="step-n">{s.n}</span>
                <div>
                  <p className="step-title">{s.title} <code>{s.fn}</code></p>
                  <p className="step-text">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <figure className="ledger" aria-label="Balances of agent, escrow and seller during one payment">
          <svg viewBox="0 0 900 440" role="img">
            <defs>
              <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M0 0V6" stroke="var(--line)" strokeWidth="1" />
              </pattern>
            </defs>

            <path d="M230 182H350M550 182H670" className="wire" />
            <path d="M450 300V352H130V242M770 242V352H450" className="wire dashed" />

            {[
              { x: 30, label: "AGENT", sub: "payer · no XLM needed", i: 0 },
              { x: 670, label: "SELLER", sub: "receiver · signs consent", i: 2 },
            ].map((n) => (
              <g key={n.label}>
                <rect x={n.x} y={122} width={200} height={120} className="node" />
                <text x={n.x + 14} y={144} className="t-label">{n.label}</text>
                <text x={n.x + 14} y={200} className="t-bal" data-bal={n.i}>0.00</text>
                <text x={n.x + 14} y={226} className="t-sub">{n.sub}</text>
              </g>
            ))}

            <rect x={350} y={60} width={200} height={240} className="node node-escrow" />
            <text x={364} y={82} className="t-label">ESCROW · SOROBAN</text>
            <rect x={GAUGE.x} y={GAUGE.top} width={GAUGE.w} height={GAUGE.h} fill="url(#hatch)" className="gauge" />
            <rect x={GAUGE.x} y={GAUGE.top + GAUGE.h} width={GAUGE.w} height={0} className="gauge-fill" data-fill-bar />
            <path d={`M${GAUGE.x - 10} ${GAUGE.top}H${GAUGE.x + GAUGE.w + 10}`} className="ceiling" />
            <text x={364} y={GAUGE.top + 4} className="t-sub">max 1.00</text>
            <text x={364} y={288} className="t-bal t-bal-sm" data-bal={1}>0.00</text>

            {["dot-a", "dot-b", "dot-c", "dot-d"].map((id) => (
              <circle key={id} id={id} r="7" className="dot" opacity="0" />
            ))}

            <text x={30} y={420} className="t-call" data-call>awaiting payment</text>
          </svg>
          <figcaption className="t-cap">DEMOUSD · values from the testnet demo</figcaption>
        </figure>
      </div>
    </section>
  );
}
