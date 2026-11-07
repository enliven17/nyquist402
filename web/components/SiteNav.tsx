import { PROTECTED_CONTRACT } from "@/lib/deployment";
import { appPath } from "@/lib/site";
import { useEffect, useRef, useState } from "react";
import { docGroups } from "@/lib/docs/navigation";
import { Logo } from "@/components/Logo";
import "./site-nav.css";

const ESCROW = PROTECTED_CONTRACT;
const ESCROW_URL = `https://stellar.expert/explorer/testnet/contract/${ESCROW}`;

type Item = { label: string; href: string; external?: boolean };
const siteGroups: [string, Item[]][] = [
  [
    "Product",
    [
      { label: "Stats", href: "/#stats" },
      { label: "How it works", href: "/#s3" },
      { label: "Use cases", href: "/#s4" },
      { label: "Get started", href: "/#s6" },
      { label: "FAQ", href: "/#s7" },
    ],
  ],
  [
    "Demo",
    [
      { label: "Demo", href: "/demo" },
    ],
  ],
  [
    "Developers",
    [
      { label: "Docs", href: "/docs" },
      { label: "GitHub", href: "https://github.com/enliven17/nyquist402", external: true },
    ],
  ],
];
const sections = siteGroups[0][1].map(i => i.href.slice(2));

/** One navigation for every page: a left sidebar on wide screens, a top bar with a menu below. */
export default function SiteNav() {
  // Re-read on every render: the app re-renders this on client-side navigation.
  const path = typeof window === "undefined" ? "/" : appPath();
  const isDocs = path === "/docs" || path.startsWith("/docs/");
  const groups: [string, Item[]][] = isDocs
    ? [["Nyquist402", [{ label: "Website", href: "/" }, { label: "Demo", href: "/demo" }]], ...docGroups.map(group => [group.title, group.pages.map(page => ({ label: page.title, href: page.slug ? `/docs/${page.slug}` : '/docs' }))] as [string, Item[]])]
    : siteGroups;
  const [section, setSection] = useState<string>();
  const menu = useRef<HTMLDetailsElement>(null);
  // At the top the product bar sits flush with the page; once scrolled it lifts into a floating pill.
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    const on = () => setLifted(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [path]);

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

  if (!isDocs) {
    // Product pages: a floating top bar with the same links, status and escrow, plus a primary call to action.
    // Pages only; the landing sections have their own index on the right edge (SectionRail).
    const top = siteGroups.slice(1).flatMap(([, items]) => items).filter(i => i.href !== "/demo");
    const pages = siteGroups.slice(1).flatMap(([, items]) => items);
    return (
      <header className={`topbar product-nav${lifted ? " lifted" : ""}`}>
        <div className="pn-inner">
          <a href="/" className="topbar-logo" aria-label="Nyquist402 home"><Logo size={26} mark={false} /></a>
          <nav className="pn-links" aria-label="Site">
            {top.map(item => (
              <a
                key={item.label}
                href={item.href}
                className={isOn(item) ? "on" : undefined}
                aria-current={isOn(item) ? "page" : undefined}
                {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {item.label}{item.external && <i aria-hidden> ↗</i>}
              </a>
            ))}
          </nav>
          <div className="pn-right">
            <a className="pn-status" href="/status" aria-current={path === "/status" ? "page" : undefined}><span className="live" />Status</a>
            <a className="pn-escrow" href={ESCROW_URL} target="_blank" rel="noreferrer" title="Open the escrow contract on Stellar Expert">
              <span>Escrow</span>
              <code>{`${ESCROW.slice(0, 6)}…${ESCROW.slice(-4)}`}</code>
              <i aria-hidden>↗</i>
            </a>
            <a className="pn-cta" href="/demo" aria-current={path === "/demo" ? "page" : undefined}>Demo <span aria-hidden>↗</span></a>
            <details className="side-menu" ref={menu}>
              <summary>Menu</summary>
              <div className="side-menu-panel pn-menu">
                {pages.map(item => (
                  <a key={item.label} href={item.href} {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                    {item.label}<i aria-hidden>{item.external ? "↗" : "→"}</i>
                  </a>
                ))}
                <a href="/status"><span><span className="live" /> Status</span><i aria-hidden>→</i></a>
              </div>
            </details>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={`topbar${isDocs ? " docs-site-nav" : ""}`}>
      <div className="topbar-inner">
        <a href="/" className="topbar-logo" aria-label="Nyquist402 home"><Logo size={26} mark={false} /></a>

        <div className="side-wide">{links}</div>

        <details className="side-menu" ref={menu}>
          <summary>Menu</summary>
          <div className="side-menu-panel">{links}{!isDocs && <a className="side-status-link" href="/status"><span className="live" />Status<i aria-hidden>→</i></a>}</div>
        </details>

        <div className="side-foot">
          <div className="side-status">
            <p>{isDocs ? "Technical documentation" : <><span className="live" />stellar:testnet</>}</p>
            {!isDocs && <a className="side-escrow" href={ESCROW_URL} target="_blank" rel="noreferrer" title="Open the escrow contract on Stellar Expert">
              <span>Escrow</span>
              <code>{`${ESCROW.slice(0, 6)}…${ESCROW.slice(-4)}`}</code>
              <i aria-hidden>↗</i>
            </a>}
            {!isDocs && <a className="side-status-link" href="/status" aria-current={path === "/status" ? "page" : undefined}><span>Status</span><i aria-hidden>→</i></a>}
          </div>
        </div>
      </div>
    </header>
  );
}
