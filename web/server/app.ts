import { Hono } from "hono";
import * as protectedApi from "./api/protected";
import { stats } from "./stats";

/** The demo API. Mounted inside the Vite dev server in development and by server/index.ts in production. */
export const app = new Hono();
app.get("/api/protected", c => protectedApi.GET(c.req.raw));
app.post("/api/protected", c => protectedApi.POST(c.req.raw));
app.get("/api/stats", async c => {
  try { return c.json({ ok: true, stats: await stats() }, 200, { "Cache-Control": "public, max-age=30" }); }
  catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : "Stats unavailable" }, 502); }
});

// Retired basic demo API: prevent old clients from interpreting the website HTML as a payment response.
app.all("/api/demo", c => c.json({ok:false,error:"Use the unified protected demo at /demo"},410));
