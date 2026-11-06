// Vercel build (Build Output API v3): the Vite client as static files and the API as one
// bundled Node function. Runs after `vite build` (buildCommand in vercel.json).
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const out = ".vercel/output", fn = `${out}/functions/api.func`;
rmSync(out, { recursive: true, force: true });
cpSync("dist", `${out}/static`, { recursive: true });
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ["server/vercel.ts"], outfile: `${fn}/index.mjs`, bundle: true, platform: "node", format: "esm", target: "node22",
  alias: { "@": "." }, external: ["sodium-native", "require-addon"],
  // CommonJS dependencies inside an ESM bundle still call require for Node builtins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 }));
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    // nyquist402.xyz/docs and /status live on their own subdomains (lib/site.ts maps paths client-side).
    { src: "/docs(?:/(.*))?", has: [{ type: "host", value: "nyquist402.xyz" }], status: 308, headers: { Location: "https://docs.nyquist402.xyz/$1" } },
    { src: "/status/?", has: [{ type: "host", value: "nyquist402.xyz" }], status: 308, headers: { Location: "https://status.nyquist402.xyz/" } },
    { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
    { handle: "filesystem" },
    { src: "/api(?:/.*)?", dest: "/api" },
    { src: "/(.*)", dest: "/index.html" },
  ],
}));
