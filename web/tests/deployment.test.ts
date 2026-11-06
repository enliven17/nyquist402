import assert from "node:assert/strict";
import test from "node:test";
import * as deployment from "../lib/deployment.ts";

test("new payments use the deployed escrow without environment configuration", () => {
  assert.deepEqual(deployment.resolveProtectedDeployment({}), {
    contractId: "CBX657PJAHLHBNVZASBJPRJFKWKYAGFCKMEE5A57I3ZNPWO5RPKPOMEH",
    version: 2,
  });
  assert.deepEqual(deployment.resolveProtectedDeployment({ DEMO_PROTECTED_ESCROW: "  " }),
    deployment.resolveProtectedDeployment({}));
});

test("an explicitly configured deployment must be a valid contract address", () => {
  assert.equal(deployment.resolveProtectedDeployment({
    DEMO_PROTECTED_ESCROW: " CCQLNKUMUSMJ2L7KAH7VJSCXW6FOBLI3VAPZO4ZLCDEQ4PL76FDXKCEW ",
  }).contractId, "CCQLNKUMUSMJ2L7KAH7VJSCXW6FOBLI3VAPZO4ZLCDEQ4PL76FDXKCEW");
  assert.throws(() => deployment.resolveProtectedDeployment({ DEMO_PROTECTED_ESCROW: "not-a-contract" }), /contract/i);
});

test("outdated or unsupported schema configuration cannot silently select a different payment model", () => {
  for (const value of ["1", "3", "invalid"]) {
    assert.throws(() => deployment.resolveProtectedDeployment({ DEMO_PROTECTED_VERSION: value }), /unsupported/i);
  }
  assert.equal(deployment.resolveProtectedDeployment({ DEMO_PROTECTED_VERSION: "2" }).version, 2);
});
