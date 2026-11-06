import { Hono } from "hono";
import * as protectedApi from "./api/protected";

/** The demo API. Mounted inside the Vite dev server in development and by server/index.ts in production. */
export const app = new Hono();
app.get("/api/protected", c => protectedApi.GET(c.req.raw));
app.post("/api/protected", c => protectedApi.POST(c.req.raw));

// Retired basic demo API: prevent old clients from interpreting the website HTML as a payment response.
app.all("/api/demo", c => c.json({ok:false,error:"Use the unified protected demo at /demo"},410));
