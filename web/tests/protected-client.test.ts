import assert from "node:assert/strict";
import { test } from "node:test";
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, scValToNative, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { ProtectedEscrowClient, assertAuthorization } from "../lib/protected/client.ts";
import { addr, actionToCall } from "../lib/protected/codec.ts";
const source = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const contractId = Address.contract(Buffer.alloc(32, 5)).toString();
const action = { type: "claim" as const, paymentId: "aa".repeat(32), amount: "40000000", delivery: "bb".repeat(32) };
function entry(method = "claim", target = contractId, subs: xdr.SorobanAuthorizedInvocation[] = []) {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address: Address.fromString(source).toScAddress(), nonce: xdr.Int64.fromString("1"), signatureExpirationLedger: 0, signature: xdr.ScVal.scvVoid(),
    })),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(target).toScAddress(), functionName: method, args: actionToCall(action).args,
      })), subInvocations: subs,
    }),
  });
}

test("authorization validation rejects other contracts, methods and nested transfers", () => {
  assert.equal(typeof assertAuthorization, "function", "auth invocation validation missing");
  assert.doesNotThrow(() => assertAuthorization(entry(), contractId, action, source));
  assert.throws(() => assertAuthorization(entry("reclaim"), contractId, action, source));
  assert.throws(() => assertAuthorization(entry("claim", Address.contract(Buffer.alloc(32, 8)).toString()), contractId, action, source));
  assert.throws(() => assertAuthorization(entry("claim", contractId, [entry().rootInvocation()]), contractId, action, source));
  assert.throws(() => assertAuthorization(entry(), contractId, action, Keypair.random().publicKey()));
});

test("SDK rejects unknown deployment IDs before making RPC calls", () => {
  assert.throws(() => new ProtectedEscrowClient({ contractId: source, rpcUrl: "https://example.org", networkPassphrase: Networks.TESTNET }));
});

test("SDK reports restoration before requesting any additional signature", async () => {
  assert.equal(typeof ProtectedEscrowClient, "function", "protected client missing");
  const server = {
    getAccount: async () => new Account(source, "1"),
    simulateTransaction: async () => ({ latestLedger: 100, transactionData: {}, minResourceFee: "100", result: { auth: [], retval: xdr.ScVal.scvVoid() }, restorePreamble: { transactionData: {}, minResourceFee: "100" } }),
  };
  const client = new ProtectedEscrowClient({ contractId, rpcUrl: "https://example.org", networkPassphrase: Networks.TESTNET, server: server as never });
  await assert.rejects(client.prepare(source, action), /restor/i);
});

test("submission rejects a changed wallet envelope and never reports pending as success", async () => {
  const tx = new TransactionBuilder(new Account(source, "1"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).setTimeout(120).addOperation(new Contract(contractId).call("reclaim", addr(source))).build();
  const other = new TransactionBuilder(new Account(source, "2"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).setTimeout(120).addOperation(new Contract(contractId).call("reclaim", addr(source))).build();
  const server = { sendTransaction: async () => ({ status: "PENDING", hash: "ab".repeat(32) }), pollTransaction: async () => ({ status: "NOT_FOUND" }) };
  const client = new ProtectedEscrowClient({ contractId, rpcUrl: "https://example.org", networkPassphrase: Networks.TESTNET, server: server as never });
  const prepared = { xdr: tx.toXDR(), source, contractId, networkPassphrase: Networks.TESTNET };
  await assert.rejects(client.submit(prepared, other.toXDR()), /changed/i);
  await assert.rejects(client.submit(prepared, tx.toXDR()), /pending|NOT_FOUND/i);
});

import { authorizeEntry, SorobanDataBuilder } from "@stellar/stellar-sdk";
const sellerKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
test("prepared transactions preserve signed seller auth and submit confirmed return values", async () => {
  const unsigned = entry();
  const server = {
    getAccount: async (address: string) => new Account(address, "10"),
    simulateTransaction: async () => ({ _parsed: true, id: "test", events: [], latestLedger: 100,
      transactionData: new SorobanDataBuilder().setResourceFee("10000"), minResourceFee: "10000",
      result: { auth: [unsigned], retval: xdr.ScVal.scvU32(0) },
    }),
    sendTransaction: async () => ({ status: "PENDING", hash: "ab".repeat(32) }),
    pollTransaction: async () => ({ status: "SUCCESS", returnValue: xdr.ScVal.scvU32(0) }),
  };
  const feeSource = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2));
  const client = new ProtectedEscrowClient({ contractId, rpcUrl: "https://example.org", networkPassphrase: Networks.TESTNET, server: server as never });
  const prepared = await client.prepare(feeSource.publicKey(), action, async (address, e, until) => {
    assert.equal(address, sellerKey.publicKey());
    return authorizeEntry(e, sellerKey, until, Networks.TESTNET);
  });
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
  assert.ok(tx instanceof Transaction);
  assert.equal(tx.source, feeSource.publicKey());
  const operation = tx.operations[0];
  assert.equal(operation.type, "invokeHostFunction");
  if (operation.type !== "invokeHostFunction") throw new Error("wrong transaction operation");
  assert.equal(operation.auth?.length, 1);
  assert.equal(operation.auth![0].credentials().address().signatureExpirationLedger(), 120);
  assert.notEqual(operation.auth![0].credentials().address().signature().switch().name, "scvVoid");
  assert.equal(BigInt(tx.fee) >= 10100n, true, "fee must include simulated resources");
  tx.sign(feeSource);
  const confirmed = await client.submit(prepared, tx.toXDR());
  assert.deepEqual(confirmed, { tx: "ab".repeat(32), value: 0 });
});

test("ordinary AddressV2 seller entries are validated, signed and retained", async () => {
  const unsigned = entry();
  unsigned.credentials(xdr.SorobanCredentials.sorobanCredentialsAddressV2(unsigned.credentials().address()));
  assert.doesNotThrow(() => assertAuthorization(unsigned, contractId, action, source));
  const server = {
    getAccount: async (address: string) => new Account(address, "10"),
    simulateTransaction: async () => ({ _parsed: true, id: "v2", events: [], latestLedger: 100,
      transactionData: new SorobanDataBuilder().setResourceFee("10000"), minResourceFee: "10000", result: { auth: [unsigned], retval: xdr.ScVal.scvU32(0) },
    }),
  };
  const client = new ProtectedEscrowClient({ contractId, rpcUrl: "https://example.org", networkPassphrase: Networks.TESTNET, server: server as never });
  const prepared = await client.prepare(Keypair.random().publicKey(), action, async (_, e, until) => authorizeEntry(e, sellerKey, until, Networks.TESTNET));
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
  assert.ok(tx instanceof Transaction);
  const operation = tx.operations[0]; assert.equal(operation.type, "invokeHostFunction");
  if (operation.type !== "invokeHostFunction") throw new Error("wrong operation");
  const signed = operation.auth![0];
  assert.equal(signed.credentials().switch().name, "sorobanCredentialsAddressV2");
  assert.equal(signed.credentials().addressV2().signatureExpirationLedger(), 120);
  assert.notEqual(signed.credentials().addressV2().signature().switch().name, "scvVoid");
});

test("completed custom-account auth receives enforcement-mode resources before wallet signing", async () => {
  const unsigned = entry();
  const custom = Address.contract(Buffer.alloc(32, 12)).toString();
  unsigned.credentials().address().address(Address.fromString(custom).toScAddress());
  const policyKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: Address.fromString(custom).toScAddress(), key: xdr.ScVal.scvSymbol("signer_policy"), durability: xdr.ContractDataDurability.persistent(),
  }));
  const server = {
    getAccount: async (address: string) => new Account(address, "10"),
    simulateTransaction: async (_tx: Transaction, _resources: unknown, mode: string) => ({ _parsed: true, id: "custom", events: [], latestLedger: 100,
      transactionData: mode === "enforce" ? new SorobanDataBuilder().setResourceFee("50000").setFootprint([policyKey], []) : new SorobanDataBuilder().setResourceFee("10000"),
      minResourceFee: mode === "enforce" ? "50000" : "10000", result: { auth: [unsigned], retval: xdr.ScVal.scvU32(0) },
    }),
  };
  const client = new ProtectedEscrowClient({ contractId, rpcUrl: "https://example.org", networkPassphrase: Networks.TESTNET, server: server as never });
  const prepared = await client.prepare(Keypair.random().publicKey(), action, async (address, e) => {
    assert.equal(address, custom);
    const copy = xdr.SorobanAuthorizationEntry.fromXDR(e.toXDR());
    copy.credentials().address().signatureExpirationLedger(120);
    copy.credentials().address().signature(xdr.ScVal.scvU32(7)); // fixture custom signature shape
    return copy;
  });
  const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET); assert.ok(tx instanceof Transaction);
  const data = tx.toEnvelope().v1().tx().ext().sorobanData();
  assert.equal(data.resources().footprint().readOnly().length, 1);
  assert.equal(data.resources().footprint().readOnly()[0].toXDR("hex"), policyKey.toXDR("hex"));
  assert.equal(BigInt(tx.fee) >= 50100n, true);
});
