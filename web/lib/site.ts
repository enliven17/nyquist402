// Production hosts: nyquist.xyz serves the site, docs.nyquist.xyz the docs at its root and
// status.nyquist.xyz the status page. Internally every page keeps its single-host path
// (/docs/..., /status), so routing and links stay unchanged on localhost and *.vercel.app.
export const ROOT = "nyquist.xyz";
const host = typeof window === "undefined" ? "" : window.location.hostname;
const sub = host === ROOT || host === `www.${ROOT}` ? "" : host.endsWith(`.${ROOT}`) ? host.slice(0, -ROOT.length - 1) : null;

/** The internal path of the current page, e.g. "/docs/sdk" on docs.nyquist.xyz/sdk. */
export function appPath(): string {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (sub === "docs") {
    if (path === "/docs" || path.startsWith("/docs/")) {
      // An internal /docs/... link landed here; show the clean URL.
      history.replaceState(null, "", (path.slice(5) || "/") + window.location.search + window.location.hash);
      return path;
    }
    return path === "/" ? "/docs" : `/docs${path}`;
  }
  if (sub === "status") return "/status";
  return path;
}

/** Where an internal link should go from this host; unchanged off the production domain. */
export function hrefFor(path: string): string {
  if (sub === null) return path;
  if (path === "/docs" || path.startsWith("/docs/") || path.startsWith("/docs#")) return `https://docs.${ROOT}${path.slice(5) || "/"}`;
  if (path === "/status" || path.startsWith("/status#")) return `https://status.${ROOT}${path.slice(7) || "/"}`;
  return sub === "" ? path : `https://${ROOT}${path}`;
}

/** Sends internal links to the right host at click time, so pages can keep plain "/docs/..." hrefs. */
export function routeLinks() {
  if (sub === null) return;
  document.addEventListener("click", event => {
    const a = (event.target as Element | null)?.closest?.("a[href^='/']") as HTMLAnchorElement | null;
    if (!a) return;
    const target = hrefFor(a.getAttribute("href")!);
    if (target.startsWith("https://")) a.href = target;
  }, true);
}
