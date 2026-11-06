import { resolveDocSlug } from "@/lib/docs/search";
import { StrictMode } from "react";
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
import Home from "@/app/page";
import Demo from "@/app/demo/page";
import Docs from "@/app/docs/page";
import Stats from "@/app/stats/page";
import Status from "@/app/status/page";

// Every navigation is a full document load (plain links), which keeps cross-document view transitions.
const routes: Record<string, [title: string, page: () => React.ReactNode]> = {
  "/": ["Nyquist402 · Protected API payments on Stellar", Home],
  "/demo": ["Demo · Nyquist402", Demo],
  "/docs": ["Docs · Nyquist402", Docs],
  "/stats": ["Stats · Nyquist402", Stats],
  "/status": ["Status · Nyquist402", Status],
};
if (window.location.pathname.replace(/\/$/, "") === "/demo/protected") window.location.replace("/demo" + window.location.search + window.location.hash);
routeLinks();
const path = appPath();
const [title, Page] = (resolveDocSlug(path) !== undefined ? ["Docs · Nyquist402", Docs] as const : routes[path]) ?? ["Not found · Nyquist402", () => <main style={{ padding: "120px 24px" }}><h1>Not found</h1><p><a href="/">Back home</a></p></main>];
document.title = title;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SiteNav />
    <Page />
  </StrictMode>,
);
