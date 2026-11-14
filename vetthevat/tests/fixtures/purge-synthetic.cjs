// Deletes synthetic test accounts (…@example.test) and everything that
// references them, following foreign keys child-first. Append-only audit
// tables are never bypassed: if they refuse, the whole purge rolls back and
// the account is deactivated instead.
async function foreignKeys(db) {
  return (await db.query(`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
           (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum) AS child_cols,
           (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum) AS parent_cols
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=(SELECT relnamespace FROM pg_class WHERE oid=c.conrelid)
    WHERE c.contype='f' AND n.nspname !~ '^(legacy_|pg_)'`)).rows;
}

const quoteRel = rel => rel.split(".").map(p => p.startsWith('"') ? p : `"${p}"`).join(".");

// Deletes rows of `rel` where `col` is in `values`, after deleting their children.
async function purge(db, fks, rel, cols, values, seen, counts) {
  if (!values.length) return;
  const key = `${rel}:${cols.join(",")}:${values.join(",")}`;
  if (seen.has(key)) return; seen.add(key);
  const where = cols.length === 1 ? `"${cols[0]}"::text = ANY($1::text[])` : `(${cols.map(c => `"${c}"::text`).join(",")}) IN (SELECT * FROM unnest($1::text[]) )`;
  // Children of these rows, by every FK pointing at this table.
  for (const fk of fks.filter(f => f.parent === rel)) {
    const parentValues = (await db.query(`SELECT DISTINCT ${fk.parent_cols.map(c => `"${c}"::text`).join("||'|'||")} AS v FROM ${quoteRel(rel)} WHERE ${where}`, [values])).rows.map(r => r.v).filter(v => v !== null);
    if (!parentValues.length) continue;
    if (fk.child_cols.length === 1) await purge(db, fks, fk.child, fk.child_cols, parentValues, seen, counts);
    else {
      const rows = (await db.query(`SELECT ctid::text FROM ${quoteRel(fk.child)} WHERE (${fk.child_cols.map(c => `"${c}"::text`).join("||'|'||")}) = ANY($1::text[])`, [parentValues])).rows.map(r => r.ctid);
      if (rows.length) await purge(db, fks, fk.child, ["ctid"], rows, seen, counts);
    }
  }
  const sql = cols[0] === "ctid" ? `DELETE FROM ${quoteRel(rel)} WHERE ctid::text = ANY($1::text[])` : `DELETE FROM ${quoteRel(rel)} WHERE ${where}`;
  const n = (await db.query(sql, [values])).rowCount;
  if (n) counts[rel] = (counts[rel] ?? 0) + n;
}

async function purgeSyntheticUsers(db, pattern = "%@example.test") {
  const users = (await db.query("SELECT id::text FROM web_auth.users WHERE email LIKE $1", [pattern])).rows.map(r => r.id);
  if (!users.length) return { users: 0, counts: {} };
  const fks = await foreignKeys(db), counts = {};
  await db.query("BEGIN");
  try {
    const companies = (await db.query("SELECT id::text FROM web_auth.companies WHERE owner_id::text = ANY($1::text[])", [users])).rows.map(r => r.id);
    const seen = new Set();
    await purge(db, fks, "web_auth.companies", ["id"], companies, seen, counts);
    await purge(db, fks, "web_auth.users", ["id"], users, seen, counts);
    await db.query("COMMIT");
    return { users: users.length, deleted: true, counts };
  } catch (error) {
    await db.query("ROLLBACK");
    // Audit history is kept; the synthetic account is switched off instead.
    const deactivated = (await db.query("UPDATE web_auth.users SET status='disabled' WHERE id::text = ANY($1::text[]) AND status<>'disabled'", [users]).catch(() => ({ rowCount: 0 }))).rowCount;
    await db.query("UPDATE web_auth.sessions SET revoked_at=now() WHERE user_id::text = ANY($1::text[]) AND revoked_at IS NULL", [users]).catch(() => {});
    return { users: users.length, deleted: false, deactivated, reason: error.message };
  }
}

module.exports = { purgeSyntheticUsers };

if (require.main === module) {
  const fs = require("node:fs"), path = require("node:path"), { Client } = require("pg");
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").split(/\r?\n/).filter(l => /^[A-Z_0-9]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
  (async () => { const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect(); try { console.log(JSON.stringify(await purgeSyntheticUsers(db, process.argv[2] || "e2e-%@example.test"))); } finally { await db.end(); } })().catch(e => { console.error(e.message); process.exitCode = 1; });
}
