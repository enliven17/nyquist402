import assert from "node:assert/strict";
import test from "node:test";
import { serviceHealth, type StatusComponent, type StatusSummary } from "../lib/status.ts";

test("service status excludes the internal payment check and its incidents without hiding service failures", () => {
  const component = (id: string, ok: boolean): StatusComponent => ({
    id, name: id, detail: "Component health", ok, ms: 25, uptime: 0.99,
    bars: [{ day: "2026-11-07", checks: 12, down: 5 }],
  });
  const input: StatusSummary = {
    checkedAt: 100, since: 10, interval: 5,
    components: [component("site", false), component("api", true), component("payments", false)],
    failures: [
      { at: 99, component: "site", error: "Service unavailable" },
      { at: 98, component: "payments", error: "Internal check failed" },
    ],
  };
  const original = structuredClone(input);
  const result = serviceHealth(input);
  assert.deepEqual(result.components.map(c => c.id), ["site", "api"]);
  assert.deepEqual(result.components.filter(c => c.ok === false).map(c => c.id), ["site"]);
  assert.deepEqual(result.failures, [{ at: 99, component: "site", error: "Service unavailable" }]);
  assert.equal(result.components[0].ms, 25);
  assert.equal(result.components[0].uptime, 0.99);
  assert.deepEqual(result.components[0].bars, [{ day: "2026-11-07", checks: 12, down: 5 }]);
  assert.equal(result.checkedAt, 100);
  assert.deepEqual(input, original);
});
