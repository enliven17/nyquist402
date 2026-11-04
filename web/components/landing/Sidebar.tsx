"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";

const ESCROW = "CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI";

type Item = { label: string; href: string; external?: boolean };
const product: Item[] = [
  { label: "How it works", href: "#s3" },
  { label: "Use cases", href: "#s4" },
  { label: "Get started", href: "#s6" },
  { label: "FAQ", href: "#s7" },
];
const developers: Item[] = [
  { label: "Docs", href: "/docs" },
  { label: "Testnet demo", href: "/demo" },
  { label: "Spec PR #4124", href: "https://github.com/x402-foundation/x402/pull/4124", external: true },
  { label: "GitHub", href: "https://github.com/enliven17/nyquist402", external: true },
];

export default function Sidebar() {
  const [active, setActive] = useState<string>();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The link for the section under the middle of the viewport is marked active.
  useEffect(() => {
    const ids = product.map((p) => p.href.slice(1));
    const targets = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-50% 0px -50% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    const top = () => window.scrollY < window.innerHeight * 0.6 && setActive(undefined);
    window.addEventListener("scroll", top, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", top); };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ESCROW);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const link = (item: Item) => (
    <a
      key={item.label}
      href={item.href}
      className={active && item.href === `#${active}` ? "on" : undefined}
      {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <span>{item.label}</span>
      <i aria-hidden>{item.external ? "↗" : "→"}</i>
    </a>
  );

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <a href="/" className="topbar-logo"><Logo size={26} /></a>

        <nav className="side-nav" aria-label="Site">
          <p className="side-head">Product</p>
          {product.map(link)}
          <p className="side-head">Developers</p>
          {developers.map(link)}
        </nav>

        <div className="side-foot">
          <div className="side-status">
            <p><span className="live" />stellar:testnet</p>
            <button type="button" onClick={copy} title="Copy escrow address">
              <span>Escrow</span>
              <code>{copied ? "copied" : `${ESCROW.slice(0, 6)}…${ESCROW.slice(-4)}`}</code>
            </button>
          </div>
          <a href="/demo" className="pill pill-accent side-cta">Demo <span aria-hidden>↗</span></a>
        </div>
      </div>
    </header>
  );
}
