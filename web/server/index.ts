// Production server: the built client from dist/ plus the demo API, on one port.
// Usage: pnpm build && pnpm start   (reads .env.local when present)
import { existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app";
import { startWorker } from "./worker";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const index = readFileSync("dist/index.html", "utf8");
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", c => c.html(index)); // client routes: /, /demo, /demo/protected, /docs

startWorker();
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`nyquist402 web on http://localhost:${port}`));
