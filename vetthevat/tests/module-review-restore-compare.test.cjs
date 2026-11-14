const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalDump,
  catalogConstraintsEquivalent,
  compareSnapshots,
  effectiveAcl
} = require("../scripts/module-review-restore-compare.cjs");

const verifiedConstraints = ["documents_object_version_check", "team_invitations_email_check"];
const base = () => ({
  schemaDump: [
    "\\restrict source-token",
    "CREATE TABLE business.documents (",
    "    CONSTRAINT documents_object_version_check CHECK (((a AND b) AND c)),",
    "    id uuid NOT NULL",
    ");",
    "CONSTRAINT team_invitations_email_check CHECK (((length(email) >= 3) AND (length(email) <= 254) AND (email = lower(email))));",
    "\\unrestrict source-token"
  ].join("\n"),
  database: { owner: "vtv_saas_database_owner", encoding: "UTF8", collation: "C" },
  extensions: [{ name: "plpgsql", version: "1.0" }],
  tables: [{ name: "business.documents", count: 1, fingerprint: "row-hash" }],
  relations: [{ name: "business.documents", owner: "vtv_saas_owner", rls: true, forced: true }],
  schemas: [{ name: "business", owner: "vtv_saas_owner" }],
  routines: [{ name: "business.guard()", owner: "vtv_saas_owner", definition: "RETURN true" }],
  constraints: [{
    name: "documents_object_version_check",
    table: "saas.documents",
    type: "c",
    definition: "CHECK (((a AND b) AND c))",
    dependencies: ["business.documents.a", "business.documents.b", "business.documents.c"]
  }, {
    name: "team_invitations_email_check",
    table: "saas.team_invitations",
    type: "c",
    definition: "CHECK (length(email) >= 3 AND length(email) <= 254 AND email = lower(email))",
    dependencies: ["saas.team_invitations.email"]
  }],
  policies: [{ name: "tenant_read", table: "business.documents", command: "SELECT", using: "company_id = current_company()" }],
  triggers: [{ name: "guard_documents", table: "business.documents", enabled: "O" }],
  effectiveAcls: [{ object: "business.documents", grantor: "vtv_saas_owner", grantee: "vtv_saas_runtime", privilege: "SELECT", grantable: false }],
  roles: [{ name: "vtv_saas_runtime", login: true, superuser: false, bypassRls: false }]
});

test("ignores only PostgreSQL dump control lines", () => {
  const sql = "CREATE TABLE t(id int);\n\\restrict token\n\\unrestrict token\n";
  assert.equal(canonicalDump(sql), "CREATE TABLE t(id int);\n");
  assert.notEqual(canonicalDump(sql), canonicalDump(sql.replace("CREATE TABLE t", "CREATE TABLE changed")));
  assert.equal(canonicalDump("SELECT 1;\n\\copy t from stdin;"), "SELECT 1;\n\\copy t from stdin;");
});

test("removes only the one catalog-verified constraint statement", () => {
  const source = base();
  const restored = base();
  restored.schemaDump = restored.schemaDump.replace("(((a AND b) AND c))", "((a AND b AND c))");
  restored.schemaDump = restored.schemaDump.replace("(((length(email) >= 3) AND (length(email) <= 254) AND (email = lower(email))))", "((length(email) >= 3 AND length(email) <= 254 AND email = lower(email)))");
  assert.equal(catalogConstraintsEquivalent(source, restored), true);
  assert.equal(canonicalDump(source.schemaDump, { verifiedConstraints }) ,
    canonicalDump(restored.schemaDump, { verifiedConstraints }));
  assert.throws(() => canonicalDump(source.schemaDump.replace("CONSTRAINT documents_object_version_check", "CONSTRAINT another_check"), {
    verifiedConstraints
  }), /catalog-verified documents_object_version_check/);
  assert.throws(() => canonicalDump(source.schemaDump, { verifiedConstraints: ["some_other_check"] }), /Unapproved constraint formatting exception/);
});

test("effective ACL comparison ignores representation but detects grant changes", () => {
  const explicit = [{ object: "business.documents", grantor: "owner", grantee: "runtime", privilege: "SELECT", grantable: false }];
  const equivalent = [{ ...explicit[0] }];
  assert.deepEqual(effectiveAcl(explicit), effectiveAcl(equivalent));
  const source = base(), restored = base();
  restored.effectiveAcls[0].grantable = true;
  assert.equal(compareSnapshots(source, restored, verifiedConstraints).checks.effectiveAcls !== null, true);
});

test("real schema, RLS policy, ownership, and row changes fail equivalence", () => {
  for (const [component, mutate] of [
    ["schema", s => { s.schemaDump = s.schemaDump.replace("id uuid NOT NULL", "id uuid NOT NULL UNIQUE"); }],
    ["relations", s => { s.relations[0].forced = false; }],
    ["policies", s => { s.policies[0].using = "true"; }],
    ["tables", s => { s.tables[0].fingerprint = "changed-row-hash"; }],
    ["constraints", s => { s.constraints[0].dependencies = ["business.documents.id"]; }],
    ["roles", s => { s.roles[0].bypassRls = true; }],
    ["effectiveAcls", s => { s.effectiveAcls[0].privilege = "UPDATE"; }]
  ]) {
    const source = base(), restored = base();
    mutate(restored);
    const comparison = compareSnapshots(source, restored, verifiedConstraints);
    assert.equal(comparison.pass, false, `${component} mutation must fail`);
    assert.notEqual(comparison.checks[component], null, `${component} difference must be reported`);
  }
});

test("dump-control and verified-constraint exceptions cannot hide unrelated schema changes", () => {
  const source = base(), restored = base();
  restored.schemaDump = restored.schemaDump.replace("id uuid NOT NULL", "id uuid NOT NULL CHECK (id IS NOT NULL)");
  assert.equal(compareSnapshots(source, restored, verifiedConstraints).pass, false);
});

test("database ACL comparison is independent of the disposable database name", () => {
  const source = base(), restored = base();
  source.effectiveAcls.push({ object: "database:vtv_saas_dev", grantor: "owner", grantee: "role", privilege: "CONNECT", grantable: false });
  restored.effectiveAcls.push({ object: "database:vtv_trial_restore_041_x", grantor: "owner", grantee: "role", privilege: "CONNECT", grantable: false });
  assert.equal(compareSnapshots(source, restored, verifiedConstraints).pass, true);
});
