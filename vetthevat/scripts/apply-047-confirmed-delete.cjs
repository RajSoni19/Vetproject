#!/usr/bin/env node
// Applies migration 047 in ONE transaction. Rehearsal by default (ROLLBACK);
// pass --apply to COMMIT. Idempotent: safe to run again.
const fs = require("node:fs"), path = require("node:path");
const { Client } = require("pg");
const root = path.resolve(__dirname, "..");
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const apply = process.argv.includes("--apply");
const MARK = "-- vtv047 confirmed soft delete";
const BRANCH = `
 ${MARK}
 IF TG_OP='UPDATE' AND OLD.state='confirmed' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
  IF NOT business.scope(NEW.company_id,'invoices:confirm') THEN RAISE EXCEPTION 'Invoice capability required'; END IF;
  IF NEW.version<>OLD.version+1 OR NEW.deleted_by IS NULL
     OR length(btrim(coalesce(NEW.delete_reason,''))) NOT BETWEEN 3 AND 500
     OR (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','delete_reason','version','updated_at'])
        <> (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','delete_reason','version','updated_at'])
  THEN RAISE EXCEPTION 'Only an audited delete with a reason is allowed on a confirmed invoice'; END IF;
  RETURN NEW;
 END IF;`;

(async () => {
  const db = new Client({ connectionString: env.MIGRATION_DATABASE_URL || env.DATABASE_URL }); await db.connect();
  await db.query("BEGIN");
  try {
    const sql = fs.readFileSync(path.join(root, "database/migrations/saas/047_confirmed_invoice_delete_with_reason.sql"), "utf8");
    await db.query(sql);
    const def = (await db.query("SELECT pg_get_functiondef('business.check_invoice()'::regprocedure) AS d")).rows[0].d;
    if (def.includes(MARK)) console.log("check_invoice already patched");
    else {
      const at = def.indexOf("BEGIN", def.indexOf("AS $function$"));
      if (at < 0) throw new Error("Could not locate the function body");
      const patched = def.slice(0, at + 5) + BRANCH + def.slice(at + 5);
      await db.query(patched);
      console.log("check_invoice patched");
    }
    const check = (await db.query("SELECT pg_get_functiondef('business.check_invoice()'::regprocedure) LIKE '%vtv047%' AS ok, (SELECT count(*) FROM pg_constraint WHERE conname='invoice_soft_delete_reason') AS c, (SELECT count(*) FROM pg_constraint WHERE conname='invoice_soft_delete_draft_only') AS old")).rows[0];
    console.log("verify:", JSON.stringify(check));
    if (!check.ok || check.c !== "1" || check.old !== "0") throw new Error("Verification failed");
    await db.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(apply ? "COMMITTED" : "Rehearsal OK, rolled back. Re-run with --apply.");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); console.error("FAILED, rolled back:", error.message); process.exitCode = 1; }
  finally { await db.end(); }
})();
