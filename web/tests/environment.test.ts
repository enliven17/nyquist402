import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as environment from "../server/env.ts";

function fixture(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "nyquist-env-"));
  try { run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("server settings load from .env without requiring a template or override file", () => fixture(directory => {
  writeFileSync(join(directory, ".env"), 'DEMO_MERCHANT_SECRET="test-only-value"\nDEMO_SESSION_SECRET=test-only-session\n');
  const target: NodeJS.ProcessEnv = {};
  environment.loadServerEnvironment(directory, target);
  assert.equal(target.DEMO_MERCHANT_SECRET, "test-only-value");
  assert.equal(target.DEMO_SESSION_SECRET, "test-only-session");
}));

test("local overrides take precedence over .env while externally supplied settings remain authoritative", () => fixture(directory => {
  writeFileSync(join(directory, ".env"), "DEMO_DATA_DIR=base\nPORT=3000\nDEMO_SESSION_SECRET=base-secret\n");
  writeFileSync(join(directory, ".env.local"), "DEMO_DATA_DIR=override\nPORT=4000\n");
  const target: NodeJS.ProcessEnv = { PORT: "5000" };
  environment.loadServerEnvironment(directory, target);
  assert.equal(target.DEMO_DATA_DIR, "override");
  assert.equal(target.PORT, "5000");
  assert.equal(target.DEMO_SESSION_SECRET, "base-secret");
}));

test("an example file is never treated as runtime configuration", () => fixture(directory => {
  writeFileSync(join(directory, ".env.example"), "DEMO_MERCHANT_SECRET=template-only\n");
  const target: NodeJS.ProcessEnv = {};
  environment.loadServerEnvironment(directory, target);
  assert.equal(target.DEMO_MERCHANT_SECRET, undefined);
}));
