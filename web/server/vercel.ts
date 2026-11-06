// Vercel function entry: the same Hono app as server/index.ts, without static files or the
// background worker. Bundled by scripts/vercel-build.mjs.
import { getRequestListener } from "@hono/node-server";
import { app } from "./app.ts";

export default getRequestListener(app.fetch);
