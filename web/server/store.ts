import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createBackendClient } from "../lib/backend.ts";

// Durable service data. Local runs use SQLite in DEMO_DATA_DIR; hosted runs share a remote store.
export type Job = { tx: string; status: string; xdr?: string };
export type Challenge = { address: string; xdr: string; expires: number };
type JobKey = readonly [contract: string, payment: string, claim: number, action: string];

let database: DatabaseSync | undefined;
export function db() {
  if (!database) {
    const directory = resolve(process.env.DEMO_DATA_DIR ?? ".nyquist-data");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    database = new DatabaseSync(resolve(directory, "payments.sqlite"));
    database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    database.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        contract TEXT NOT NULL, id TEXT NOT NULL, buyer TEXT NOT NULL, seller TEXT NOT NULL,
        agreement TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(contract,id));
      CREATE TABLE IF NOT EXISTS bodies (
        contract TEXT NOT NULL, payment TEXT NOT NULL, hash TEXT NOT NULL, party TEXT NOT NULL,
        kind TEXT NOT NULL, claim INTEGER NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL,
        PRIMARY KEY(contract,payment,hash,party,kind,claim));
      CREATE TABLE IF NOT EXISTS transactions (
        hash TEXT PRIMARY KEY, contract TEXT NOT NULL, payment TEXT NOT NULL, account TEXT NOT NULL,
        action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS worker_jobs (
        contract TEXT NOT NULL, payment TEXT NOT NULL, claim INTEGER NOT NULL, action TEXT NOT NULL,
        tx TEXT, status TEXT NOT NULL, updated INTEGER NOT NULL,
        PRIMARY KEY(contract,payment,claim,action));
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY, address TEXT NOT NULL, xdr TEXT NOT NULL, expires INTEGER NOT NULL);
    `);
  }
  const columns=database.prepare("PRAGMA table_info(worker_jobs)").all() as {name:string}[];
  if(!columns.some(column=>column.name==="xdr")) database.exec("ALTER TABLE worker_jobs ADD COLUMN xdr TEXT");
  return database;
}

let backend: { url: string; client: ReturnType<typeof createBackendClient> } | undefined;
function remote() {
  const url = process.env.BACKEND_URL;
  if (!url) return undefined;
  const key = process.env.BACKEND_KEY;
  if (!key) throw new Error("Configure BACKEND_KEY alongside BACKEND_URL");
  if (backend?.url !== url) backend = { url, client: createBackendClient(url) };
  const client = backend.client;
  return {
    query: <T = any>(name: string, args: Record<string, unknown>) => client.query<T>(`store:${name}`, { key, ...args }),
    mutation: <T = any>(name: string, args: Record<string, unknown>) => client.mutation<T>(`store:${name}`, { key, ...args }),
  };
}

export async function rememberPayment(contract: string, id: string, buyer: string, seller: string, agreement: string) {
  const r = remote(); if (r) return void await r.mutation("rememberPayment", { contract, id, buyer, seller, agreement });
  db().prepare("INSERT OR IGNORE INTO payments VALUES (?,?,?,?,?,?)").run(contract,id,buyer,seller,agreement,Date.now());
}
export async function history(contract: string, account: string): Promise<{ paymentId: string; agreement: string }[]> {
  const r = remote(); if (r) return r.query("history", { contract, account });
  return db().prepare("SELECT id AS paymentId, agreement FROM payments WHERE contract=? AND (buyer=? OR seller=?) ORDER BY created DESC LIMIT 100").all(contract,account,account) as never;
}
export async function recentPayments(contract: string): Promise<string[]> {
  const r = remote(); if (r) return r.query("recentPayments", { contract });
  return (db().prepare("SELECT id FROM payments WHERE contract=? ORDER BY created DESC LIMIT 100").all(contract) as { id: string }[]).map(p => p.id);
}
export async function storeBody(contract: string, payment: string, party: string, kind: string, claim: number, body: string) {
  if (!["evidence","delivery"].includes(kind) || typeof body !== "string" || !body.trim() || Buffer.byteLength(body) > 10000 || !Number.isSafeInteger(claim) || claim < 0) throw new Error("Invalid case material");
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  const r = remote(); if (r) { await r.mutation("storeBody", { contract, payment, hash, party, kind, claim, body }); return { hash }; }
  const count = db().prepare("SELECT COUNT(*) AS n FROM bodies WHERE contract=? AND payment=?").get(contract,payment) as { n: number };
  if (count.n >= 1000) throw new Error("Payment evidence storage limit reached");
  db().prepare("INSERT OR IGNORE INTO bodies VALUES (?,?,?,?,?,?,?,?)").run(contract,payment,hash,party,kind,claim,body,Date.now());
  return { hash };
}
export async function bodies(contract: string, payment: string, claim: number) {
  const r = remote(); if (r) return r.query("bodies", { contract, payment, claim });
  return db().prepare("SELECT hash,party,kind,body,created FROM bodies WHERE contract=? AND payment=? AND claim=? ORDER BY created").all(contract,payment,claim);
}
export async function track(hash: string, contract: string, payment: string, account: string, action: string) {
  const r = remote(); if (r) return void await r.mutation("track", { hash, contract, payment, account, action });
  db().prepare("INSERT OR IGNORE INTO transactions (hash,contract,payment,account,action,created) VALUES (?,?,?,?,?,?)").run(hash,contract,payment,account,action,Date.now());
}
export async function activity(contract: string, payment: string): Promise<{ tx: string; label: string; status: string }[]> {
  const r = remote(); if (r) return r.query("activity", { contract, payment });
  return db().prepare("SELECT hash AS tx, action AS label,status FROM transactions WHERE contract=? AND payment=? ORDER BY created DESC LIMIT 100").all(contract,payment) as never;
}
export async function pendingTransactions(contract: string): Promise<string[]> {
  const r = remote(); if (r) return r.query("pendingTransactions", { contract });
  return (db().prepare("SELECT hash FROM transactions WHERE contract=? AND status='pending' ORDER BY created LIMIT 100").all(contract) as { hash: string }[]).map(t => t.hash);
}
export async function setTransactionStatus(hash: string, status: string) {
  const r = remote(); if (r) return void await r.mutation("setTransactionStatus", { hash, status });
  db().prepare("UPDATE transactions SET status=? WHERE hash=?").run(status,hash);
}
export async function job(...key: JobKey): Promise<Job | undefined> {
  const r = remote(); if (r) return (await r.query("job", jobArgs(key))) ?? undefined;
  return db().prepare("SELECT tx,status,xdr FROM worker_jobs WHERE contract=? AND payment=? AND claim=? AND action=?").get(...key) as Job | undefined;
}
/** Records a signed deadline job once; false when another tick already owns this key. */
export async function addJob(key: JobKey, tx: string, xdr: string): Promise<boolean> {
  const r = remote(); if (r) return r.mutation("addJob", { ...jobArgs(key), tx, xdr });
  return db().prepare("INSERT OR IGNORE INTO worker_jobs (contract,payment,claim,action,tx,status,updated,xdr) VALUES (?,?,?,?,?,'pending',?,?)").run(...key,tx,Date.now(),xdr).changes > 0;
}
export async function setJobStatus(key: JobKey, status: string) {
  const r = remote(); if (r) return void await r.mutation("setJobStatus", { ...jobArgs(key), status });
  db().prepare("UPDATE worker_jobs SET status=?,updated=? WHERE contract=? AND payment=? AND claim=? AND action=?").run(status,Date.now(),...key);
}
const jobArgs = ([contract, payment, claim, action]: JobKey) => ({ contract, payment, claim, action });

// Sign-in challenges live in the store so the challenge and verify requests may hit different instances.
export async function saveChallenge(id: string, challenge: Challenge) {
  const r = remote(); if (r) return void await r.mutation("saveChallenge", { id, ...challenge });
  db().prepare("DELETE FROM challenges WHERE expires<=?").run(Math.floor(Date.now() / 1000));
  db().prepare("INSERT INTO challenges VALUES (?,?,?,?)").run(id,challenge.address,challenge.xdr,challenge.expires);
}
export async function getChallenge(id: string): Promise<Challenge | undefined> {
  const r = remote(); if (r) return (await r.query("getChallenge", { id })) ?? undefined;
  return db().prepare("SELECT address,xdr,expires FROM challenges WHERE id=?").get(id) as Challenge | undefined;
}
/** Deletes a challenge; true only for the one caller that removed it. */
export async function consumeChallenge(id: string): Promise<boolean> {
  const r = remote(); if (r) return r.mutation("consumeChallenge", { id });
  return db().prepare("DELETE FROM challenges WHERE id=?").run(id).changes > 0;
}
