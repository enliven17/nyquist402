import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

/** Match the base-file precedence used by the dev server; exported variables win. */
export function loadServerEnvironment(directory = process.cwd(), target: NodeJS.ProcessEnv = process.env): void {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(directory, name);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
      if (target[key] === undefined) target[key] = value;
    }
  }
}
