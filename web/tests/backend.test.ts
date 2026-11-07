import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { createBackendClient, requestBackend } from "../lib/backend.ts";
import * as store from "../server/store.ts";
import { activity, stats } from "../server/stats.ts";

async function fixture(
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void,
  run: (url: string) => Promise<void>,
) {
  const server = createServer((request, response) => {
    Promise.resolve(handle(request, response)).catch(() => {
      response.writeHead(500).end(JSON.stringify({ status: "error", errorMessage: "Fixture failed" }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function body(request: IncomingMessage) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return JSON.parse(text);
}

test("HTTP queries preserve the function path, arguments and exact monetary strings", async () => {
  const requests: unknown[] = [];
  await fixture(async (request, response) => {
    requests.push({ url: request.url, method: request.method, contentType: request.headers["content-type"], body: await body(request) });
    response.end(JSON.stringify({ status: "success", value: { amount: "900719925474099312345", rows: [] }, logLines: [] }));
  }, async url => {
    const value = await requestBackend(`${url}/`, "query", "events:stats", { from: 10 });
    assert.deepEqual(value, { amount: "900719925474099312345", rows: [] });
    assert.deepEqual(requests, [{ url: "/api/query", method: "POST", contentType: "application/json", body: { path: "events:stats", args: { from: 10 }, format: "json" } }]);
  });
});

test("HTTP responses preserve false, zero and null results", async () => {
  await fixture(async (request, response) => {
    const { path } = await body(request);
    response.end(JSON.stringify({ status: "success", value: ({ flag: false, count: 0, absent: null } as Record<string, unknown>)[path] }));
  }, async url => {
    assert.equal(await requestBackend(url, "query", "flag", {}), false);
    assert.equal(await requestBackend(url, "query", "count", {}), 0);
    assert.equal(await requestBackend(url, "query", "absent", {}), null);
  });
});

test("failed HTTP or function responses cannot be interpreted as successful data", async () => {
  await fixture(async (request, response) => {
    const { path } = await body(request);
    if (path === "http") { response.writeHead(503).end(JSON.stringify({ status: "success", value: [] })); return; }
    if (path === "malformed") { response.end("not-json"); return; }
    if (path === "missing") { response.end(JSON.stringify({ status: "success" })); return; }
    response.writeHead(560).end(JSON.stringify({ status: "error", errorMessage: "Unauthorized", logLines: [] }));
  }, async url => {
    await assert.rejects(requestBackend(url, "query", "http", {}), /503/);
    await assert.rejects(requestBackend(url, "query", "function", {}), /Unauthorized/);
    await assert.rejects(requestBackend(url, "query", "malformed", {}), /invalid.*response/i);
    await assert.rejects(requestBackend(url, "query", "missing", {}), /invalid.*response/i);
  });
});

test("mutations are sent in order and a rejected mutation does not block the next one", async () => {
  const seen: unknown[] = [];
  let active = 0, maximum = 0;
  await fixture(async (request, response) => {
    const payload = await body(request);
    seen.push({ route: request.url, ...payload });
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active--;
    if (payload.path === "store:first") response.end(JSON.stringify({ status: "error", errorMessage: "Rejected" }));
    else response.end(JSON.stringify({ status: "success", value: true }));
  }, async url => {
    const client = createBackendClient(url);
    const first = client.mutation("store:first", { key: "fixture-key" });
    const second = client.mutation("store:second", { key: "fixture-key" });
    await assert.rejects(first, /Rejected/);
    assert.equal(await second, true);
    assert.equal(maximum, 1);
    assert.deepEqual(seen, [
      { route: "/api/mutation", path: "store:first", args: { key: "fixture-key" }, format: "json" },
      { route: "/api/mutation", path: "store:second", args: { key: "fixture-key" }, format: "json" },
    ]);
  });
});

test("hosted storage keeps payment history, evidence, transaction jobs and sign-in on the authenticated backend", async () => {
  const previous = { url: process.env.BACKEND_URL, key: process.env.BACKEND_KEY };
  const requests: { path: string; args: Record<string, unknown> }[] = [];
  await fixture(async (request, response) => {
    const payload = await body(request);
    requests.push(payload);
    if (payload.args.key !== "fixture-key") {
      response.end(JSON.stringify({ status: "error", errorMessage: "Unauthorized" }));
      return;
    }
    const values: Record<string, unknown> = {
      "store:history": [{ paymentId: "payment", agreement: "terms" }],
      "store:recentPayments": ["payment"],
      "store:bodies": [{ hash: "body-hash", party: "buyer", kind: "evidence", body: "delivery details", created: 123 }],
      "store:activity": [{ tx: "tx", label: "accept", status: "pending" }],
      "store:pendingTransactions": ["tx"],
      "store:job": { tx: "tx", status: "pending", xdr: "signed-envelope" },
      "store:addJob": true,
      "store:getChallenge": { address: "buyer", xdr: "challenge-envelope", expires: 456 },
      "store:consumeChallenge": true,
    };
    response.end(JSON.stringify({ status: "success", value: values[payload.path] ?? null }));
  }, async url => {
    process.env.BACKEND_URL = url;
    process.env.BACKEND_KEY = "fixture-key";
    try {
      await store.rememberPayment("contract", "payment", "buyer", "seller", "terms");
      assert.deepEqual(await store.history("contract", "buyer"), [{ paymentId: "payment", agreement: "terms" }]);
      assert.deepEqual(await store.recentPayments("contract"), ["payment"]);
      const evidence = await store.storeBody("contract", "payment", "buyer", "evidence", 1, "delivery details");
      assert.match(evidence.hash, /^[a-f0-9]{64}$/);
      assert.deepEqual(await store.bodies("contract", "payment", 1), [{ hash: "body-hash", party: "buyer", kind: "evidence", body: "delivery details", created: 123 }]);
      await store.track("tx", "contract", "payment", "buyer", "accept");
      assert.deepEqual(await store.activity("contract", "payment"), [{ tx: "tx", label: "accept", status: "pending" }]);
      assert.deepEqual(await store.pendingTransactions("contract"), ["tx"]);
      await store.setTransactionStatus("tx", "success");
      const key = ["contract", "payment", 1, "settle"] as const;
      assert.deepEqual(await store.job(...key), { tx: "tx", status: "pending", xdr: "signed-envelope" });
      assert.equal(await store.addJob(key, "tx", "signed-envelope"), true);
      await store.setJobStatus(key, "success");
      await store.saveChallenge("challenge", { address: "buyer", xdr: "challenge-envelope", expires: 456 });
      assert.deepEqual(await store.getChallenge("challenge"), { address: "buyer", xdr: "challenge-envelope", expires: 456 });
      assert.equal(await store.consumeChallenge("challenge"), true);
      assert.equal(requests.length, 15);
      assert.ok(requests.every(r => r.args.key === "fixture-key"));
      assert.deepEqual(requests.find(r => r.path === "store:addJob")?.args, { key: "fixture-key", contract: "contract", payment: "payment", claim: 1, action: "settle", tx: "tx", xdr: "signed-envelope" });
      assert.deepEqual(requests.find(r => r.path === "store:saveChallenge")?.args, { key: "fixture-key", id: "challenge", address: "buyer", xdr: "challenge-envelope", expires: 456 });
      delete process.env.BACKEND_KEY;
      await assert.rejects(store.history("contract", "buyer"), /BACKEND_KEY/);
      assert.equal(requests.length, 15);
    } finally {
      if (previous.url === undefined) delete process.env.BACKEND_URL; else process.env.BACKEND_URL = previous.url;
      if (previous.key === undefined) delete process.env.BACKEND_KEY; else process.env.BACKEND_KEY = previous.key;
    }
  });
});

test("hosted stats preserve chain totals and activity without adding operational metadata", async () => {
  const previous = process.env.BACKEND_URL;
  const requests: unknown[] = [];
  await fixture(async (request, response) => {
    const payload = await body(request);
    requests.push(payload);
    const values: Record<string, unknown> = {
      "events:stats": {
        updatedAt: 100, firstAt: 10, latestLedger: 20, payments: 2, buyers: 1, transactions: 3, events: 4,
        funded: "900719925474099312345", paidToSeller: "12", returnedToBuyer: "7", claims: 2, claimed: "19", disputes: 1, evidence: 1,
        outcomes: [], returns: [], arbiters: [], activity: { bin: 900, points: [] }, recent: [],
      },
      "events:activity": { bin: 900, points: [{ at: 100, transactions: 3 }] },
    };
    if (!(payload.path in values)) response.end(JSON.stringify({ status: "error", errorMessage: "Unknown function" }));
    else response.end(JSON.stringify({ status: "success", value: values[payload.path] }));
  }, async url => {
    process.env.BACKEND_URL = url;
    try {
      const result = await stats();
      assert.equal(result.payments, 2);
      assert.equal(result.funded, "900719925474099312345");
      assert.equal("scheduled" in result, false);
      assert.deepEqual(await activity(100, 200), { bin: 900, points: [{ at: 100, transactions: 3 }] });
      assert.deepEqual(requests, [
        { path: "events:stats", args: {}, format: "json" },
        { path: "events:activity", args: { from: 100, to: 200 }, format: "json" },
      ]);
    } finally {
      if (previous === undefined) delete process.env.BACKEND_URL; else process.env.BACKEND_URL = previous;
    }
  });
});
