import gsap from "gsap";
import { useEffect, useRef } from "react";
import { HERO, HERO_SVG } from "./heroArt";
import "./iso.css";
import "./hero.css";

type Key = "agent" | "vault" | "seller" | "carry";
type Vec = [number, number, number];

const STEPS = ["authorize", "capture", "void", "refund"] as const;
const REST = { agent: 12, vault: 0, seller: 0, carry: 0 };

// Screen offset of a world offset (the kit's translateAlong, inlined).
const shift = ([x, y, z]: Vec) => {
  const sx = x * HERO.ex[0] + y * HERO.ey[0] + z * HERO.ez[0];
  const sy = x * HERO.ex[1] + y * HERO.ey[1] + z * HERO.ez[1];
  return `translate(${sx.toFixed(2)} ${sy.toFixed(2)})`;
};

export default function HeroFigure() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    const svg = el.querySelector("svg")!;
    const q = (s: string) => svg.querySelector(s) as SVGGElement;
    const stacks = Object.fromEntries((["agent", "vault", "seller", "carry", "fly"] as const).map((p) => [p, [...q(`[data-part="${p}"]`).children] as SVGGElement[]]));
    const slots = { agent: q('[data-slot="agent"]'), vault: q('[data-slot="vault"]'), seller: q('[data-slot="seller"]'), top: q('[data-slot="top"]') };
    const fly = q('[data-part="fly"]');
    const sled = q('[data-part="sled"]');
    const needle = q('[data-part="needle"]');
    const slot = q('[data-part="slot"]');
    const readout = el.querySelector("[data-readout]")!;
    const marks = [...el.querySelectorAll<HTMLElement>("[data-step]")];

    const n = { ...REST };
    const s = { sled: 0, dial: 0, lock: 0 };
    const money = { captured: 0, refunded: 0 };

    const show = (part: string, count: number) => stacks[part].forEach((c, i) => (c.style.display = i < count ? "" : "none"));
    const set = (key: Key, count: number) => { n[key] = count; show(key, count); };
    const say = () => {
      readout.textContent = `hold ${(n.vault / 10).toFixed(2)} · captured ${(money.captured / 10).toFixed(2)} · refunded ${(money.refunded / 10).toFixed(2)}`;
    };
    const step = (i: number) => marks.forEach((m, j) => m.classList.toggle("on", i === j));
    const draw = () => {
      sled.setAttribute("transform", shift([s.sled, 0, 0]));
      needle.setAttribute("d", HERO.needles[Math.round(Math.min(1, Math.max(0, s.dial)) * 60)]);
      slot.setAttribute("d", HERO.slots[Math.round((((s.lock % 1) + 1) % 1) * 12)]);
    };

    // Top of a stack, in world units, after `extra` coins are added (negative: taken).
    const topOf = (key: Key, count: number): Vec => {
      if (key === "carry") return [s.sled + HERO.sled.c[0], HERO.sled.c[1], HERO.sled.top + count * HERO.coinH];
      const st = HERO.stations[key];
      return [st.x, st.y, st.seat + count * HERO.coinH];
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      set("agent", 8); set("seller", 4); money.captured = 6; money.refunded = 2;
      say(); step(3); draw();
      return;
    }

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, defaults: { ease: "power2.inOut" }, onUpdate: draw });
    const sledTo = (x: number) => tl.to(s, { sled: x, duration: 0.25 + Math.abs(x) / 160 });
    const dialTo = () => tl.to(s, { dial: n.vault / 10, duration: 0.6, ease: "power3.out" }, "<");

    // A stack of `count` lifts off one stack, arcs over the posts and lands on another.
    const move = (from: Key, to: Key, count: number) => {
      const path = { a: [0, 0, 0] as Vec, b: [0, 0, 0] as Vec };
      const p = { t: 0 };
      tl.call(() => {
        path.a = topOf(from, n[from] - count);
        set(from, n[from] - count);
        show("fly", count);
        path.b = topOf(to, n[to]);
      });
      tl.fromTo(p, { t: 0 }, {
        t: 1,
        duration: 0.9,
        ease: "none",
        onUpdate: () => {
          const t = p.t, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const peak = 58 - (path.a[2] + path.b[2]) / 2;
          const at: Vec = [path.a[0] + (path.b[0] - path.a[0]) * e, path.a[1] + (path.b[1] - path.a[1]) * e, path.a[2] + (path.b[2] - path.a[2]) * t + 4 * t * (1 - t) * peak];
          fly.setAttribute("transform", shift(at));
          // Inside a coin tube the coins sit behind its front posts; in the air they are on top.
          const home = t < 0.2 && from !== "carry" ? slots[from as "agent"] : t > 0.8 && to !== "carry" ? slots[to as "agent"] : slots.top;
          if (fly.parentNode !== home) home.appendChild(fly);
        },
      });
      tl.call(() => { show("fly", 0); set(to, n[to] + count); say(); });
    };
    // The key turns a half turn per consent; a half turn looks the same, so the loop restarts without a jump.
    let turns = 0;
    const consent = () => tl.to(s, { lock: ++turns, duration: 0.5, ease: "back.out(1.6)" });

    const A = HERO.stations.agent.x, S = HERO.stations.seller.x;
    tl.call(() => { step(0); say(); }).to({}, { duration: 0.6 });
    sledTo(A); move("agent", "carry", 10); sledTo(0); move("carry", "vault", 10); dialTo();
    tl.call(() => step(1)).to({}, { duration: 0.5 });
    consent(); move("vault", "carry", 6); dialTo(); sledTo(S);
    tl.call(() => { money.captured = 6; }); move("carry", "seller", 6);
    tl.call(() => step(2)).to({}, { duration: 0.3 });
    sledTo(0); consent(); move("vault", "carry", 4); dialTo(); sledTo(A); move("carry", "agent", 4);
    tl.call(() => step(3)).to({}, { duration: 0.5 });
    sledTo(S); consent(); move("seller", "carry", 2); tl.call(() => { money.refunded = 2; }); sledTo(A); move("carry", "agent", 2);
    tl.to({}, { duration: 1.6 });
    // Settle: the bench resets for the next payment.
    tl.to(stacks.agent.concat(stacks.seller), { opacity: 0, duration: 0.35 });
    tl.call(() => { set("agent", REST.agent); set("seller", 0); money.captured = 0; money.refunded = 0; say(); });
    tl.to(stacks.agent.concat(stacks.seller), { opacity: 1, duration: 0.35 });
    sledTo(0);

    draw();
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause()), { rootMargin: "80px" });
    io.observe(el);
    return () => { io.disconnect(); tl.kill(); };
  }, []);

  return (
    <div ref={root} className="hero-fig">
      <div className="hero-corners" aria-hidden>
        <span>Fig 01</span>
        <span>Escrow bench · 1 coin = 0.10</span>
      </div>
      <div className="iso hero-iso" data-theme="light" dangerouslySetInnerHTML={{ __html: HERO_SVG }} />
      <div className="hero-corners hero-corners-foot">
        <span className="hero-steps">
          {STEPS.map((x, i) => (
            <span key={x} data-step>{i ? "→ " : ""}{x}</span>
          ))}
        </span>
        <span data-readout aria-live="off">hold 0.00 · captured 0.00 · refunded 0.00</span>
      </div>
    </div>
  );
}
