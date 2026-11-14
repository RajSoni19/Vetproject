#!/usr/bin/env node
// Applies migration 049 in ONE transaction and rehearses an erase on a
// throwaway draft inside the same transaction. Rehearsal by default
// (ROLLBACK); pass --apply to COMMIT.
const fs = require("node:fs"), path = require("node:path");
const { Client } = require("pg");
const root = path.resolve(__dirname, "..");
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const apply = process.argv.includes("--apply");
const MARK = "-- vtv049 erase";
const BRANCH = `
 ${MARK}
 IF TG_OP='DELETE' AND coalesce(current_setting('vtv.erase_invoice',true),'')<>'' AND OLD.invoice_id::text=current_setting('vtv.erase_invoice',true) THEN RETURN OLD; END IF;`;

(async () => {
  const db = new Client({ connectionString: env.MIGRATION_DATABASE_URL || env.DATABASE_URL }); await db.connect();
  await db.query("BEGIN");
  try {
    await db.query(fs.readFileSync(path.join(root, "database/migrations/saas/049_invoice_permanent_erase.sql"), "utf8"));
    const def = (await db.query("SELECT pg_get_functiondef('business.check_draft_child()'::regprocedure) AS d")).rows[0].d;
    if (!def.includes(MARK)) {
      const at = def.indexOf("BEGIN", def.indexOf("AS $function$"));
      if (at < 0) throw new Error("check_draft_child body not found");
      await db.query(def.slice(0, at + 5) + BRANCH + def.slice(at + 5));
      console.log("check_draft_child patched");
    }
    // Rehearse on an existing invoice that is already soft-deleted (from the E2E test account), if any.
    const sample = (await db.query("SELECT company_id::text, id::text, state FROM business.invoices WHERE deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM business.invoices c WHERE c.credit_for_id=business.invoices.id) LIMIT 1")).rows[0];
    if (sample) {
      await db.query("SAVEPOINT trial");
      await db.query("SELECT business.erase_invoice($1::uuid,$2::uuid)", [sample.company_id, sample.id]);
      const left = (await db.query("SELECT (SELECT count(*) FROM business.invoices WHERE id=$1)+(SELECT count(*) FROM business.invoice_lines WHERE invoice_id=$1)+(SELECT count(*) FROM business.invoice_revisions WHERE invoice_id=$1) AS n", [sample.id])).rows[0].n;
      console.log(`trial erase of a ${sample.state} invoice: rows left = ${left}`);
      if (left !== "0") throw new Error("Trial erase left rows behind");
      await db.query("ROLLBACK TO SAVEPOINT trial");
      // Other history must still be protected.
      await db.query("SAVEPOINT guard");
      // Without an erase in progress, history of a live invoice must not be deletable
      // (either refused by a trigger or filtered to zero rows by row-level security).
      let refused = false;
      try { const r = await db.query("DELETE FROM business.invoice_revisions WHERE invoice_id IN (SELECT invoice_id FROM business.invoice_revisions LIMIT 50)"); refused = r.rowCount === 0; } catch { refused = true; }
      await db.query("ROLLBACK TO SAVEPOINT guard");
      console.log("history of other invoices still protected:", refused);
      if (!refused) throw new Error("Immutability protection was weakened");
    }
    await db.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(apply ? "COMMITTED" : "Rehearsal OK, rolled back. Re-run with --apply.");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); console.error("FAILED, rolled back:", error.message); process.exitCode = 1; }
  finally { await db.end(); }
})();
