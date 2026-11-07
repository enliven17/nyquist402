import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./section-rail.css";

// In page order.
const sections = [
  ["s3", "How it works"],
  ["s4", "Use cases"],
  ["stats", "Stats"],
  ["s6", "Get started"],
  ["s7", "FAQ"],
] as const;

// A vertical sine wave; each section is a sample point on it (the Nyquist idea, drawn).
const STEP = 46, H = STEP * sections.length, CX = 14, AMP = 7;
const xAt = (y: number) => CX + AMP * Math.sin((y / H) * Math.PI * 3);
const ys = sections.map((_, i) => STEP / 2 + i * STEP);
// Arc length along the wave up to height y, so the fill (stroke dash over pathLength 1) lands exactly on a sample.
const arc = [0];
for (let y = 1; y <= H; y++) arc.push(arc[y - 1] + Math.hypot(1, xAt(y) - xAt(y - 1)));
const arcTo = (y: number) => {
  const lo = Math.max(0, Math.min(H, Math.floor(y))), hi = Math.min(H, lo + 1);
  return arc[lo] + (arc[hi] - arc[lo]) * (y - lo);
};
const wave = Array.from({ length: H + 1 }, (_, y) => `${y ? "L" : "M"}${xAt(y).toFixed(2)} ${y}`).join("");

/** Fixed section index on the right edge of the landing page. */
export default function SectionRail() {
  const [active, setActive] = useState<string>();
  const rail = useRef<HTMLElement>(null);

  useEffect(() => {
    const targets = sections.map(([id]) => document.getElementById(id));
    // One measurement drives both the active sample and the fill, so they cannot drift apart:
    // the section under the middle of the viewport is active, and the fill runs from its sample
    // toward the next one by how far through that section the reader is.
    let frame = 0;
    // Document offsets of each section, refreshed on resize and when ScrollTrigger re-lays out pins.
    let tops: number[] = [], lastBottom = 0;
    const measure = () => {
      tops = targets.map(t => t!.getBoundingClientRect().top + window.scrollY);
      const last = targets[targets.length - 1]!;
      lastBottom = last.getBoundingClientRect().bottom + window.scrollY;
    };
    const update = () => {
      frame = 0;
      if (!rail.current || !tops.length) return;
      const mid = window.scrollY + window.innerHeight / 2;
      let i = -1;
      for (let k = 0; k < tops.length; k++) if (tops[k] <= mid) i = k;
      let y = 0;
      if (i >= 0) {
        const end = i + 1 < tops.length ? tops[i + 1] : lastBottom;
        const f = Math.min(1, Math.max(0, (mid - tops[i]) / Math.max(1, end - tops[i])));
        y = ys[i] + f * STEP;
      }
      rail.current.style.setProperty("--p", (arcTo(y) / arcTo(H)).toFixed(4));
      const next = i >= 0 && !(i === tops.length - 1 && lastBottom < mid) ? sections[i][0] : undefined;
      setActive(prev => (prev === next ? prev : next));
    };
    const remeasure = () => { if (targets.some(t => !t)) return; measure(); update(); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    remeasure();
    // Sections change height after load (pins, fonts, live stats): re-measure when the page resizes.
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    ScrollTrigger.addEventListener("refresh", remeasure);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      ScrollTrigger.removeEventListener("refresh", remeasure);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const at = sections.findIndex(([id]) => id === active);

  return (
    <nav ref={rail} className={`rail${active ? " rail-on" : ""}`} aria-label="Sections" style={{ height: H }}>
      <svg className="rail-wave" width={CX * 2} height={H} viewBox={`0 0 ${CX * 2} ${H}`} aria-hidden>
        <path className="rail-track" d={wave} pathLength={1} />
        <path className="rail-fill" d={wave} pathLength={1} />
        {ys.map((y, i) => (
          <circle key={i} className={i < at ? "past" : i === at ? "now" : undefined} cx={xAt(y)} cy={y} r={i === at ? 4.5 : 3} />
        ))}
      </svg>
      {sections.map(([id, label], i) => (
        <a
          key={id}
          href={`#${id}`}
          style={{ top: ys[i], right: CX * 2 + 10 + (xAt(ys[i]) - CX) * -1 }}
          className={active === id ? "on" : undefined}
          aria-current={active === id ? "location" : undefined}
        >
          <b>{String(i + 1).padStart(2, "0")}</b>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
