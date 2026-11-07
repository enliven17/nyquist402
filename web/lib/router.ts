import { flushSync } from "react-dom";

// Client-side navigation: internal links swap the page in place, so the navigation stays mounted
// and nothing reloads. Cross-host links (docs/status subdomains in production) still load normally.
const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function render() {
  const swap = () => {
    flushSync(() => listeners.forEach(l => l()));
    // The landing page scrolls to its own hash after its pinned sections settle.
    if (!window.location.hash) window.scrollTo(0, 0);
  };
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (vt && !reduced()) vt.call(document, swap);
  else swap();
}

export function navigate(href: string) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  history.pushState(null, "", url.pathname + url.search + url.hash);
  render();
}

/** Intercepts plain left clicks on same-origin links. Call once at startup. */
export function interceptLinks() {
  window.addEventListener("popstate", render);
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/api")) return;
    // Same page with a hash: leave it to the browser and the smooth scroller.
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    navigate(url.href);
  });
}
