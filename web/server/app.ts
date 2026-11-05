import { Hono } from "hono";
import * as demo from "./api/demo";
import * as protectedApi from "./api/protected";

/** The demo API. Mounted inside the Vite dev server in development and by server/index.ts in production. */
export const app = new Hono();
app.get("/api/demo", c => demo.GET(c.req.raw));
app.post("/api/demo", c => demo.POST(c.req.raw));
app.get("/api/protected", c => protectedApi.GET(c.req.raw));
app.post("/api/protected", c => protectedApi.POST(c.req.raw));
