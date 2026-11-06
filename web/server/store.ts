import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

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
    `);
  }
  const columns=database.prepare("PRAGMA table_info(worker_jobs)").all() as {name:string}[];
  if(!columns.some(column=>column.name==="xdr")) database.exec("ALTER TABLE worker_jobs ADD COLUMN xdr TEXT");
  return database;
}
export function rememberPayment(contract: string, id: string, buyer: string, seller: string, agreement: string) {
  db().prepare("INSERT OR IGNORE INTO payments VALUES (?,?,?,?,?,?)").run(contract,id,buyer,seller,agreement,Date.now());
}
export function history(contract: string, account: string) {
  return db().prepare("SELECT id AS paymentId, agreement FROM payments WHERE contract=? AND (buyer=? OR seller=?) ORDER BY created DESC LIMIT 100").all(contract,account,account);
}
export function storeBody(contract: string, payment: string, party: string, kind: string, claim: number, body: string) {
  if (!["evidence","delivery"].includes(kind) || typeof body !== "string" || !body.trim() || Buffer.byteLength(body) > 10000 || !Number.isSafeInteger(claim) || claim < 0) throw new Error("Invalid case material");
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  const count = db().prepare("SELECT COUNT(*) AS n FROM bodies WHERE contract=? AND payment=?").get(contract,payment) as { n: number };
  if (count.n >= 1000) throw new Error("Payment evidence storage limit reached");
  db().prepare("INSERT OR IGNORE INTO bodies VALUES (?,?,?,?,?,?,?,?)").run(contract,payment,hash,party,kind,claim,body,Date.now());
  return { hash };
}
export function bodies(contract: string, payment: string, claim: number) {
  return db().prepare("SELECT hash,party,kind,body,created FROM bodies WHERE contract=? AND payment=? AND claim=? ORDER BY created").all(contract,payment,claim);
}
export function track(hash: string, contract: string, payment: string, account: string, action: string) {
  db().prepare("INSERT OR IGNORE INTO transactions (hash,contract,payment,account,action,created) VALUES (?,?,?,?,?,?)").run(hash,contract,payment,account,action,Date.now());
}
export function activity(contract: string, payment: string) {
  return db().prepare("SELECT hash AS tx, action AS label,status FROM transactions WHERE contract=? AND payment=? ORDER BY created DESC LIMIT 100").all(contract,payment);
}
