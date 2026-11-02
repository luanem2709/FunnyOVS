/**
 * Xem nhanh sổ nhật ký token.
 *
 * Chạy: npx tsx scripts/peek-ledger.ts
 */
import Database from "better-sqlite3";
import path from "node:path";

const DATA = process.env.OFFICE_DATA_DIR ?? path.resolve(".data");
const db = new Database(path.join(DATA, "ledger.db"), { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all() as { name: string }[];

for (const t of tables) {
  const count = (db.prepare(`SELECT COUNT(*) n FROM ${t.name}`).get() as { n: number }).n;
  console.log(`\n=== ${t.name} (${count} dòng) ===`);
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string }[];
  console.log("  cột:", cols.map((c) => c.name).join(", "));
  const rows = db.prepare(`SELECT * FROM ${t.name} ORDER BY rowid DESC LIMIT 8`).all();
  for (const r of rows) console.log("  ", JSON.stringify(r));
}

db.close();
