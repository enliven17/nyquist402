import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { getRequestListener } from "@hono/node-server";

/** Serves the demo API from the dev server, so `pnpm dev` is one process. */
function api(): Plugin {
  return {
    name: "nyquist-api",
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ""));
      server.middlewares.use("/api", async (req, res) => {
        req.url = `/api${req.url}`;
        const { app } = await server.ssrLoadModule("/server/app.ts");
        getRequestListener(app.fetch)(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [fumadocsMdx(), react(), api()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  server: { port: 3000 },
});
