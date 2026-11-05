import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import "./site-nav.css";

const ESCROW = "CCB3W5542IQIVWT3ZDTSQIN2LPRMVYLZ2KKQOJT2CTIIDDTYIQVHHCCI";

type Item = { label: string; href: string; external?: boolean };
const groups: [string, Item[]][] = [
  [
    "Product",
    [
      { label: "How it works", href: "/#s3" },
      { label: "Use cases", href: "/#s4" },
      { label: "Get started", href: "/#s6" },
      { label: "FAQ", href: "/#s7" },
    ],
  ],
  [
    "Demos",
    [
      { label: "Basic demo", href: "/demo" },
      { label: "Protected demo", href: "/demo/protected" },
    ],
  ],
  [
    "Developers",
    [
      { label: "Docs", href: "/docs" },
      { label: "Spec PR #4124", href: "https://github.com/x402-foundation/x402/pull/4124", external: true },
      { label: "GitHub", href: "https://github.com/enliven17/nyquist402", external: true },
    ],
  ],
];
const sections = groups[0][1].map(i => i.href.slice(2));

/** One navigation for every page: a left sidebar on wide screens, a top bar with a menu below. */
export default function SiteNav() {
  // Each page is a full document load, so the path is fixed for the life of this component.
  const path = typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/$/, "") || "/";
  const [section, setSection] = useState<string>();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const menu = useRef<HTMLDetailsElement>(null);

  // On the landing page, the link for the section under the middle of the viewport is active.
  useEffect(() => {
    setSection(undefined);
    if (path !== "/") return;
    const targets = sections.map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setSection(e.target.id)),
      { rootMargin: "-50% 0px -50% 0px" },
    );
    targets.forEach(t => io.observe(t));
    const top = () => window.scrollY < window.innerHeight * 0.6 && setSection(undefined);
    window.addEventListener("scroll", top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", top);
    };
  }, [path]);

  // Close the mobile menu after navigating.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);

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

  const isOn = (item: Item) =>
    item.href.startsWith("/#") ? path === "/" && item.href === `/#${section}` : path === item.href;

  const links = (
    <nav className="side-nav" aria-label="Site">
      {groups.map(([head, items]) => (
        <div key={head}>
          <p className="side-head">{head}</p>
          {items.map(item => (
            <a
              key={item.label}
              href={item.href}
              className={isOn(item) ? "on" : undefined}
              aria-current={isOn(item) ? "page" : undefined}
              {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              <span>{item.label}</span>
              <i aria-hidden>{item.external ? "↗" : "→"}</i>
            </a>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a href="/" className="topbar-logo" aria-label="Nyquist402 home"><Logo size={26} mark={false} /></a>

        <div className="side-wide">{links}</div>

        <details className="side-menu" ref={menu}>
          <summary>Menu</summary>
          <div className="side-menu-panel">{links}</div>
        </details>

        <div className="side-foot">
          <div className="side-status">
            <p><span className="live" />stellar:testnet</p>
            <button type="button" onClick={copy} title="Copy escrow address">
              <span>Escrow</span>
              <code>{copied ? "copied" : `${ESCROW.slice(0, 6)}…${ESCROW.slice(-4)}`}</code>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
