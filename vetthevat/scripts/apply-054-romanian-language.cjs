#!/usr/bin/env node
// Applies migration 054 (allow Romanian as a saved language) in ONE transaction.
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
    await db.query(fs.readFileSync(path.join(root, "database/migrations/saas/054_romanian_language.sql"), "utf8"));
    const def = (await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='users_preferred_locale_check'")).rows[0]?.def ?? "";
    if (!def.includes("ro-RO")) throw new Error("Romanian was not added");
    console.log("users_preferred_locale_check now allows ro-RO");
    await db.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(apply ? "COMMITTED" : "Rehearsal OK, rolled back. Re-run with --apply.");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); console.error("FAILED, rolled back:", error.message); process.exitCode = 1; }
  finally { await db.end(); }
})();
