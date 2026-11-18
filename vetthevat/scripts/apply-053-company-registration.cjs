#!/usr/bin/env node
// Applies migration 053 (company number and registered address) in ONE transaction.
// Rehearsal by default (ROLLBACK); pass --apply to COMMIT.
const fs = require("node:fs"), path = require("node:path");
const { Client } = require("pg");
const root = path.resolve(__dirname, "..");
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const apply = process.argv.includes("--apply");
(async () => {
  const db = new Client({ connectionString: env.MIGRATION_DATABASE_URL || env.DATABASE_URL }); await db.connect();
  await db.query("BEGIN");
  try {
    await db.query(fs.readFileSync(path.join(root, "database/migrations/saas/053_company_registration.sql"), "utf8"));
    const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='business' AND table_name='company_contacts' ORDER BY 1")).rows.map(r => r.column_name);
    console.log("company_contacts columns:", columns.join(", "));
    if (!columns.includes("company_number") || !columns.includes("registered_address")) throw new Error("Columns were not added");
    await db.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(apply ? "COMMITTED" : "Rehearsal OK, rolled back. Re-run with --apply.");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); console.error("FAILED, rolled back:", error.message); process.exitCode = 1; }
  finally { await db.end(); }
})();
