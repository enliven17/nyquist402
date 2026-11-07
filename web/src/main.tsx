import { resolveDocSlug } from "@/lib/docs/search";
import { StrictMode, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter-tight/300.css";
import "@fontsource/inter-tight/400.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@/app/globals.css";
import SiteNav from "@/components/SiteNav";
import { appPath, routeLinks } from "@/lib/site";
import { interceptLinks, subscribe } from "@/lib/router";
import Home from "@/app/page";
import Demo from "@/app/demo/page";
import Docs from "@/app/docs/page";
import Status from "@/app/status/page";
import "@/app/product.css";
import "@/app/demo/demo-app.css";

// Internal links navigate client-side (lib/router.ts); the first load and cross-host links are full loads.
const routes: Record<string, [title: string, page: () => React.ReactNode]> = {
  "/": ["Nyquist402 · Protected API payments on Stellar", Home],
  "/demo": ["Demo · Nyquist402", Demo],
  "/docs": ["Docs · Nyquist402", Docs],
  "/status": ["Status · Nyquist402", Status],
};
// The stats page became a home page section.
if (window.location.pathname.replace(/\/$/, "") === "/stats") window.location.replace("/#stats");
if (window.location.pathname.replace(/\/$/, "") === "/demo/protected") window.location.replace("/demo" + window.location.search + window.location.hash);
routeLinks();
interceptLinks();

function resolve(path: string): readonly [string, () => React.ReactNode] {
  if (resolveDocSlug(path) !== undefined) return ["Docs · Nyquist402", Docs];
  return routes[path] ?? ["Not found · Nyquist402", () => <main style={{ padding: "120px 24px" }}><h1>Not found</h1><p><a href="/">Back home</a></p></main>];
}

/** The navigation stays mounted; only the page swaps on client-side navigation. */
function App() {
  const path = useSyncExternalStore(subscribe, appPath);
  const [title, Page] = resolve(path);
  useEffect(() => { document.title = title; }, [title]);
  return <><SiteNav /><Page key={path} /></>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
