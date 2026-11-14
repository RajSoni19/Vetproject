#!/usr/bin/env node
// Applies database/migrations/saas 001–046 to a database that has ONE login
// role (e.g. a hosted Postgres where the app user cannot create roles).
//
// The reviewed migrations were written for a cluster with ~10 dedicated roles
// (vtv_saas_owner, vtv_saas_runtime, ...). Here every one of those roles maps
// to the connecting user, who owns every table. Consequences, by design:
//   - Row-level security is enabled but not FORCED, so the owning app user is
//     not filtered by it. Company isolation is enforced by the application
//     (every business transaction sets app.company_id and calls
//     saas.lock_authorization, which checks the signed-in member).
//   - Role-creation, role-switching and self-REVOKE statements are dropped.
//   - "Fresh isolated dev cluster" guards (database name, host, port, data
//     directory, empty database) are neutralised; all other checks stay.
//
// Existing hand-built schemas (web_auth, saas, platform_admin) are renamed to
// legacy_* and their users / admin MFA data copied into the new schema.
//
// Everything runs in ONE transaction:
//   node scripts/apply-single-role-migrations.cjs            # rehearsal: runs everything, then ROLLBACK
//   node scripts/apply-single-role-migrations.cjs --apply    # COMMIT only if every step succeeded
// Connection: MIGRATION_DATABASE_URL, else DATABASE_URL (from .env.local).
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "database", "migrations", "saas");
const apply = process.argv.includes("--apply");
const verbose = process.argv.includes("--verbose");

// Canonical order. Superseded variants are excluded:
// 003 -> 003_syntax_fix, 006 -> 006_stock_integrity, 027 -> 028,
// 029 rehearsal / rollbacks / 043 initial-admin (needs a named approval) skipped.
const MIGRATIONS = [
  "001_saas_foundation", "002_stage_a_authorization_locks", "003_stage_b_invoices_syntax_fix",
  "004_public_contact", "005_provider_event_inbox", "006_operations_ors_stock_integrity",
  "007_operations_command_keys", "008_operations_rls_predicate", "009_operations_transition_names",
  "010_operations_receipt_authorization", "011_operations_fulfilment_event", "012_operations_purchase_request_rejection",
  "013_operations_command_vocabulary", "014_postgres_banking", "015_banking_owner_lock_policies",
  "016_banking_allocation_lock_policy", "017_company_onboarding", "018_document_attachment_trigger",
  "019_team_invitations", "020_stripe_billing", "021_stripe_checkout_url_check", "022_support_workflows",
  "023_contact_notification_worker", "024_support_admin_lock", "025_invoice_routing", "026_invoice_routing_command",
  "028_company_price_intelligence_syntax_fix", "029_automatic_14_day_trial", "031_ors_shopping_cart",
  "032_invoice_draft_soft_delete", "033_account_profile_update", "034_invoice_module_reviews",
  "035_shopping_buyer_authorization", "036_ors_supplier_invoice_lines", "036_supplier_logo_assets",
  "037_local_document_queue_scope", "038_supplier_logo_claim_alias_fix", "039_ors_live_offers_whatsapp_dispatch",
  "040_ors_marketplace_command_keys", "041_invoice_module_review_initializer", "042_module_review_initializer_selection_rls",
  "043_platform_administration", "044_platform_completion", "045_invoice_payments_tax_reviews", "046_invoice_vat_not_evidenced"
];
const WEB_AUTH_EXTRA = ["030_user_language_preference"]; // database/migrations/web-auth

function readEnv() {
  const env = { ...process.env };
  const file = path.join(root, ".env.local");
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// Splits SQL into statements, respecting quotes, dollar quotes and comments.
function splitStatements(sql) {
  const out = []; let start = 0, i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "-" && sql[i + 1] === "-") { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end + 1; continue; }
    if (ch === "/" && sql[i + 1] === "*") { const end = sql.indexOf("*/", i + 2); i = end < 0 ? sql.length : end + 2; continue; }
    if (ch === "'") { i++; while (i < sql.length) { if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; } if (sql[i] === "'") { i++; break; } i++; } continue; }
    if (ch === '"') { const end = sql.indexOf('"', i + 1); i = end < 0 ? sql.length : end + 1; continue; }
    if (ch === "$") { const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/); if (tag) { const end = sql.indexOf(tag[0], i + tag[0].length); i = end < 0 ? sql.length : end + tag[0].length; continue; } }
    if (ch === ";") { out.push(sql.slice(start, i + 1)); start = i + 1; }
    i++;
  }
  if (sql.slice(start).trim()) out.push(sql.slice(start));
  return out;
}

const stripComments = (statement) => statement.replace(/^(\s*--[^\n]*\n)+/g, "").trim();

function transform(sql, user, database) {
  const ident = `"${user.replace(/"/g, '""')}"`;
  let text = sql
    // Fresh-cluster target guards: always satisfied here.
    .replace(/replace\(\s*current_setting\('data_directory'\)[^<]*<>\s*'[^']*'/gi, "false")
    .replace(/current_setting\('data_directory'\)/gi, "''")
    .replace(/current_database\(\)\s*<>\s*'vtv_saas_dev'/gi, "false")
    .replace(/current_database\(\)\s*=\s*'vtv_saas_dev'/gi, "true")
    .replace(/host\(inet_server_addr\(\)\)\s*<>\s*'127\.0\.0\.1'/gi, "false")
    .replace(/inet_server_port\(\)\s*<>\s*\d+/gi, "false")
    .replace(/'vtv_saas_dev'/g, "current_database()")
    .replace(/\bvtv_saas_dev\b/g, `"${database.replace(/"/g, '""')}"`);
  // Every application role is the connecting user.
  text = text.replace(/'vtv_[a-z_]+'/g, `'${user}'`).replace(/\bvtv_[a-z_]+\b/g, ident);

  const kept = [];
  for (const raw of splitStatements(text)) {
    const statement = stripComments(raw);
    const head = statement.replace(/\s+/g, " ").slice(0, 200).toUpperCase();
    if (!statement) continue;
    // Each file wraps itself in BEGIN/COMMIT; the runner owns the one transaction.
    if (/^(BEGIN|COMMIT|START TRANSACTION)\s*;?$/i.test(statement)) continue;
    if (/^(CREATE|ALTER|DROP) ROLE\b/.test(head)) continue;
    if (/^(SET( LOCAL| SESSION)? ROLE|RESET ROLE|SET( LOCAL| SESSION)? SESSION AUTHORIZATION)\b/.test(head)) continue;
    if (/^ALTER TABLE .* FORCE ROW LEVEL SECURITY/.test(head)) continue;
    if (/^ALTER TABLE .* NO FORCE ROW LEVEL SECURITY/.test(head)) continue;
    // GRANT <role> TO <role>: membership, meaningless with one role.
    if (/^GRANT\s+"[^"]+"(\s*,\s*"[^"]+")*\s+TO\b/i.test(statement)) continue;
    if (/^REVOKE\s+"[^"]+"(\s*,\s*"[^"]+")*\s+FROM\b/i.test(statement)) continue;
    if (/^(GRANT|REVOKE)\b/i.test(statement)) {
      // Never revoke the owner's own privileges; keep revokes from PUBLIC.
      const isRevoke = /^REVOKE\b/i.test(statement);
      if (isRevoke) {
        const fromIndex = statement.search(/\bFROM\b(?![\s\S]*\bFROM\b)/i);
        const grantees = statement.slice(fromIndex + 4).replace(/\b(CASCADE|RESTRICT)\b|;/gi, "").split(",").map(s => s.trim()).filter(Boolean);
        const publicOnly = grantees.filter(g => /^PUBLIC$/i.test(g));
        if (!publicOnly.length) continue;
        kept.push(statement.slice(0, fromIndex) + "FROM PUBLIC;");
        continue;
      }
      // GRANT to self is a no-op for an owner but harmless; GRANT ... TO PUBLIC kept.
      kept.push(statement.endsWith(";") ? statement : statement + ";");
      continue;
    }
    kept.push(statement.endsWith(";") ? statement : statement + ";");
  }
  return kept;
}

// Guards that assert the database is a brand-new cluster. They are DO blocks;
// rewrite their known fresh-cluster conditions to false.
function relaxFreshClusterGuards(statement) {
  if (!/^DO\b/i.test(statement)) return statement;
  // A block made only of "IF <cluster/role/RLS-force precondition> THEN RAISE"
  // checks has no effect except to refuse this single-role layout: drop it.
  const body = statement.match(/^DO\s*\$(\w*)\$\s*(?:DECLARE\s[\s\S]*?)?BEGIN([\s\S]*)END\s*;?\s*\$\1\$\s*;?$/i);
  if (body) {
    let rest = body[2], previous;
    do {
      previous = rest;
      rest = rest.replace(/\s*IF\b[\s\S]*?\bTHEN\s+RAISE\s+EXCEPTION\s+'(?:[^']|'')*'(?:\s*,[^;]*)?(?:\s+USING\s+[^;]*)?;\s*END\s+IF\s*;/i, "");
      // Read-only lookups feeding those checks (e.g. a function-definition hash).
      rest = rest.replace(/^\s*SELECT\b[^;]*\bINTO\s+\w+\s*;/i, "");
    } while (rest !== previous);
    if (!rest.trim()) return "";
  }
  return statement
    .replace(/NOT EXISTS\s*\(\s*SELECT 1 FROM pg_database d JOIN pg_roles r[\s\S]*?\)\s*\)/gi, "false")
    .replace(/EXISTS\s*\(\s*SELECT 1 FROM pg_namespace WHERE nspname NOT IN\s*\([^)]*\)[^)]*\)/gi, "false")
    .replace(/EXISTS\s*\(\s*SELECT 1 FROM pg_class WHERE relnamespace\s*=\s*'public'::regnamespace AND relkind IN\s*\([^)]*\)\s*\)/gi, "false")
    .replace(/EXISTS\s*\(\s*SELECT 1 FROM pg_proc WHERE pronamespace\s*=\s*'public'::regnamespace\s*\)/gi, "false")
    .replace(/EXISTS\s*\(\s*SELECT 1 FROM pg_type WHERE typnamespace\s*=\s*'public'::regnamespace\s*\)/gi, "false")
    .replace(/EXISTS\s*\(\s*SELECT 1 FROM pg_roles WHERE rolname\s+IN\s*\([^)]*\)\s*\)/gi, "false")
    .replace(/(NOT\s+)?EXISTS\s*\(\s*SELECT 1 FROM pg_roles WHERE rolname\s*=\s*'[^']*'[^)]*\)/gi, (m, not) => not ? "false" : "false")
    .replace(/(NOT\s+)?pg_has_role\([^)]*\)/gi, (m, not) => not ? "false" : "true")
    .replace(/has_database_privilege\(\s*'[^']*'\s*,[^)]*\)/gi, "false");
}

async function main() {
  const env = readEnv();
  const url = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error("No MIGRATION_DATABASE_URL or DATABASE_URL.");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await client.connect();
  const who = (await client.query("SELECT current_user u, current_database() d, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) s")).rows[0];
  console.log(`Target database ${who.d} as ${who.u}${who.s ? " (superuser)" : ""}. Mode: ${apply ? "APPLY (commit on success)" : "REHEARSAL (rollback at end)"}`);
  const already = (await client.query("SELECT to_regclass('business.migrations') IS NOT NULL a")).rows[0].a;
  if (already) { console.log("business.migrations already exists: migrations were applied earlier. Nothing to do."); await client.end(); return; }

  const step = async (label, sql, values) => {
    try { return await client.query(sql, values); }
    catch (error) {
      const where = error.position ? ` at char ${error.position}` : "";
      throw new Error(`${label}: ${error.message}${where}\n  SQL: ${String(sql).replace(/\s+/g, " ").slice(0, 400)}`);
    }
  };

  await client.query("BEGIN");
  try {
    await step("timeouts", "SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='0'");
    // 1. Park the hand-built schemas.
    // Every existing application schema (renaming is non-destructive).
    const existing = (await client.query("SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_' AND nspname !~ '^legacy_' ORDER BY 1")).rows.map(row => row.nspname);
    for (const schema of existing) {
      const target = `legacy_${schema}`;
      if ((await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [target])).rowCount) throw new Error(`${target} already exists; resolve manually.`);
      await step(`rename ${schema}`, `ALTER SCHEMA "${schema}" RENAME TO "${target}"`);
      console.log(`  parked ${schema} -> ${target}`);
    }
    await step("pgcrypto", "CREATE EXTENSION IF NOT EXISTS pgcrypto");

    // 2. Migrations.
    const files = [...MIGRATIONS.map(name => path.join(dir, `${name}.review.sql`)), ...WEB_AUTH_EXTRA.map(name => path.join(root, "database", "migrations", "web-auth", `${name}.review.sql`))];
    for (const file of files) {
      const name = path.basename(file);
      const statements = transform(fs.readFileSync(file, "utf8"), who.u, who.d).map(relaxFreshClusterGuards).filter(Boolean);
      for (const [index, statement] of statements.entries()) {
        if (verbose) console.log(`    ${name} #${index + 1}: ${statement.replace(/\s+/g, " ").slice(0, 120)}`);
        await step(`${name} #${index + 1}`, statement);
      }
      console.log(`  applied ${name} (${statements.length} statements)`);
    }

    // 3. Carry existing users and admin MFA data across.
    await copyLegacyData(client, step);

    // 4. Sanity checks.
    const summary = (await client.query("SELECT table_schema s, count(*) n FROM information_schema.tables WHERE table_schema IN ('web_auth','saas','business','operations','platform_admin','contact_intake','banking') GROUP BY 1 ORDER BY 1")).rows;
    console.log("Tables now:", summary.map(r => `${r.s}=${r.n}`).join(" "));
    console.log("Users:", (await client.query("SELECT count(*) n FROM web_auth.users")).rows[0].n);

    if (apply) { await client.query("COMMIT"); console.log("COMMITTED."); }
    else { await client.query("ROLLBACK"); console.log("Rehearsal succeeded. ROLLED BACK; nothing changed. Re-run with --apply to commit."); }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, ROLLED BACK; database unchanged.\n" + error.message);
    process.exitCode = 1;
  } finally { await client.end(); }
}

// Copies rows column-by-column for columns both tables share.
async function copyTable(client, step, from, to, { where = "", conflict = "ON CONFLICT DO NOTHING", expressions = {} } = {}) {
  const [fs_, ft] = from.split("."), [ts, tt] = to.split(".");
  const exists = (await client.query("SELECT to_regclass($1) a, to_regclass($2) b", [from, to])).rows[0];
  if (!exists.a || !exists.b) return 0;
  const cols = (await client.query(`SELECT a.column_name FROM information_schema.columns a JOIN information_schema.columns b ON b.table_schema=$3 AND b.table_name=$4 AND b.column_name=a.column_name WHERE a.table_schema=$1 AND a.table_name=$2 AND b.is_generated='NEVER' ORDER BY b.ordinal_position`, [fs_, ft, ts, tt])).rows.map(r => `"${r.column_name}"`);
  if (!cols.length) return 0;
  const list = cols.join(",");
  const select = cols.map(col => expressions[col.slice(1, -1)] ?? col).join(",");
  return (await step(`copy ${from}`, `INSERT INTO ${to}(${list}) SELECT ${select} FROM ${from} ${where} ${conflict}`)).rowCount;
}

async function copyLegacyData(client, step) {
  const report = [];
  // Users keep their ids and password hashes, so everyone signs in as before.
  // Legacy stored bare language codes ("en"); the schema allows full locales.
  const locales = ["en-GB", "hi-IN", "gu-IN", "es-ES", "fr-FR", "ar", "pt-PT", "de-DE", "it-IT", "pl-PL", "ur-PK", "pa-IN"];
  const locale = `CASE WHEN preferred_locale IN (${locales.map(l => `'${l}'`).join(",")}) THEN preferred_locale ELSE COALESCE((SELECT l FROM unnest(ARRAY[${locales.map(l => `'${l}'`).join(",")}]) l WHERE split_part(l,'-',1)=split_part(preferred_locale,'-',1) LIMIT 1),'en-GB') END`;
  report.push(["web_auth.users", await copyTable(client, step, "legacy_web_auth.users", "web_auth.users", { expressions: { preferred_locale: locale } })]);
  // Roles are seeded by 001; map legacy role assignments by role name.
  if ((await client.query("SELECT to_regclass('legacy_web_auth.user_roles') a")).rows[0].a) {
    report.push(["web_auth.user_roles", (await step("copy user_roles", `INSERT INTO web_auth.user_roles(user_id,role_id) SELECT ur.user_id, r.id FROM legacy_web_auth.user_roles ur JOIN legacy_web_auth.roles lr ON lr.id=ur.role_id JOIN web_auth.roles r ON r.name=lr.name WHERE EXISTS(SELECT 1 FROM web_auth.users u WHERE u.id=ur.user_id) ON CONFLICT DO NOTHING`)).rowCount]);
  }
  report.push(["web_auth.companies", await copyTable(client, step, "legacy_web_auth.companies", "web_auth.companies")]);
  report.push(["web_auth.company_memberships", await copyTable(client, step, "legacy_web_auth.company_memberships", "web_auth.company_memberships")]);
  // Platform administration: plans, admin grants and enrolled MFA factors.
  for (const table of ["plans", "grants", "factors"]) report.push([`platform_admin.${table}`, await copyTable(client, step, `legacy_platform_admin.${table}`, `platform_admin.${table}`)]);
  console.log("  carried over:", report.map(([t, n]) => `${t}=${n}`).join(" "));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
