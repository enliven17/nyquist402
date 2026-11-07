import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { LIFE, LIFE_SVG } from "./lifecycleArt";
import "./iso.css";
import "./hero.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// The same flow the testnet demo runs: hold 1.00, capture 0.60, release 0.40, refund 0.20.
const steps = [
  { n: "01", fn: "authorize", title: "Hold the maximum", text: "The agent signs one authorization entry. 1.00 moves into escrow." },
  { n: "02", fn: "capture", title: "Charge what it cost", text: "The work cost 0.60. The seller captures it with its own consent." },
  { n: "03", fn: "void", title: "Release the rest", text: "The remaining 0.40 returns to the agent in the same call." },
  { n: "04", fn: "refund", title: "Refund later", text: "Before the refund deadline, the seller returns 0.20 through the escrow." },
];

const calls = [
  "escrow.authorize(payment_info)",
  "escrow.capture(payment_info, 0.60, void_remainder: true)",
  "escrow.capture(payment_info, 0.60, void_remainder: true)",
  "escrow.refund(payment_info, 0.20, funder: seller)",
];

// Which valves each step opens, and where each step sits on the timeline.
const OPEN = [["authorize"], ["capture"], ["release"], ["refund", "release"]] as const;
const AT = [0.1, 1.2, 2.3, 3.4];
const VALVES = ["authorize", "capture", "release", "refund"] as const;

export default function Lifecycle() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const svg = el.querySelector("svg")!;
      const one = (s: string) => svg.querySelector(s)!;
      const fill = { agent: one('[data-fill="agent"]'), escrow: one('[data-fill="escrow"]'), seller: one('[data-fill="seller"]') };
      const value = { agent: one('[data-value="agent"]'), escrow: one('[data-value="escrow"]'), seller: one('[data-value="seller"]') };
      const wheels = Object.fromEntries(VALVES.map((n) => [n, one(`[data-valve="${n}"]`)]));
      const spokes = Object.fromEntries(VALVES.map((n) => [n, one(`[data-spokes="${n}"]`)]));
      const flows = [...svg.querySelectorAll<SVGPathElement>("[data-flow]")];
      const items = [...el.querySelectorAll<HTMLElement>("[data-step]")];
      const call = el.querySelector("[data-call]")!;
      const readout = el.querySelector("[data-readout]")!;

      const v = { a: 1000, e: 0, s: 0 };
      const open: Record<string, number> = { authorize: 0, capture: 0, release: 0, refund: 0 };
      let active = -2;

      const level = (key: keyof typeof fill, share: number) => {
        const h = LIFE.win.h * Math.max(0, Math.min(1, share));
        fill[key].setAttribute("y", (-h).toFixed(2));
        fill[key].setAttribute("height", h.toFixed(2));
      };
      const render = (time: number) => {
        level("agent", v.a - 999);
        level("escrow", v.e);
        level("seller", v.s);
        value.agent.textContent = v.a.toFixed(2);
        value.escrow.textContent = v.e.toFixed(2);
        value.seller.textContent = v.s.toFixed(2);
        for (const name of VALVES) {
          const o = open[name];
          spokes[name].setAttribute("d", LIFE.spokes[name][Math.round(o * 23)]);
          wheels[name].classList.toggle("on", o > 0.5);
        }
        const flowing = new Set<string>(VALVES.filter((n) => open[n] > 0.5));
        if (flowing.has("refund")) flowing.add("through");
        flows.forEach((f) => f.classList.toggle("on", flowing.has(f.dataset.flow ?? "")));
        let i = -1;
        AT.forEach((t, j) => { if (time >= t) i = j; });
        if (i !== active) {
          active = i;
          items.forEach((li, j) => li.classList.toggle("on", j === i));
          call.textContent = i < 0 ? "awaiting payment" : `→ ${calls[i]}`;
        }
        readout.textContent = `agent ${v.a.toFixed(2)} · escrow ${v.e.toFixed(2)} · seller ${v.s.toFixed(2)}`;
      };

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        Object.assign(v, { a: 999.6, e: 0, s: 0.4 });
        render(4);
        return;
      }

      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: { trigger: el, start: "top top", end: "+=340%", pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true },
        onUpdate: () => render(tl.time()),
      });
      // Each step: open its valves, move the funds, close them again.
      const flowStep = (i: number, to: Partial<typeof v>) => {
        const t = AT[i];
        for (const name of OPEN[i]) tl.to(open, { [name]: 1, duration: 0.25 }, t);
        tl.to(v, { ...to, duration: 0.55 }, t + 0.25);
        for (const name of OPEN[i]) tl.to(open, { [name]: 0, duration: 0.2 }, t + 0.85);
      };
      flowStep(0, { a: 999, e: 1 });
      flowStep(1, { e: 0.4, s: 0.6 });
      flowStep(2, { e: 0, a: 999.4 });
      flowStep(3, { s: 0.4, a: 999.6 });
      tl.to({}, { duration: 0.4 });
      render(0);
    },
    { scope: root },
  );

  return (
    <section ref={root} className="lifecycle" id="lifecycle" data-section>
      <div className="wrap lifecycle-inner">
        <div className="lifecycle-copy">
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

        <figure className="hero-fig life-fig" aria-label="Flow bench showing balances during one payment">
          <div className="hero-corners" aria-hidden>
            <span>Fig 02</span>
            <span>Flow bench · scroll to run</span>
          </div>
          <div className="iso hero-iso" data-theme="light" dangerouslySetInnerHTML={{ __html: LIFE_SVG }} />
          <div className="hero-corners hero-corners-foot">
            <span className="life-call" data-call>awaiting payment</span>
            <span data-readout>agent 1000.00 · escrow 0.00 · seller 0.00</span>
          </div>
        </figure>
      </div>
    </section>
  );
}
