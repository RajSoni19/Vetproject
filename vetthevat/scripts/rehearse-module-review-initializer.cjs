const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Client, Pool } = require("pg");
const common = require("./saas-dev-common.cjs");
const runner = require("./saas-reviewed-migration.cjs");
const compare = require("./module-review-restore-compare.cjs");

const expectedHash = "7d0a8ce7714f0c053ff8a25bc5be04b825988765a33992ac24be7bf7f06bdc9f";
const installationId = "2e8c4c03-f697-465e-8beb-f3a371d3b355";
const migrationPath = path.join(common.root, "database", "migrations", "saas", "041_invoice_module_review_initializer.review.sql");
const correctionPath = path.join(common.root, "database", "migrations", "saas", "042_module_review_initializer_selection_rls.review.sql");
const backupRoot = path.join(common.directory, "backups");
const pgBin = "C:/Program Files/PostgreSQL/17/bin/";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const quoteIdentifier = value => `"${value.replace(/"/g, '""')}"`;
const controlDatabase = "postgres";
const expectedDataDirectory = "D:/vetthevat.saas-dev/cluster";
const targetGuard = "current_database()<>'vtv_saas_dev'";
const correctionTargetGuard = "current_database()<>'vtv_saas_dev'";
const disposableName = `vtv_trial_restore_041_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const roles = ["vtv_saas_database_owner", "vtv_saas_operator"];

const config = common.configuration();
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const migrationHash = hash(migrationSql);
const runnerHash = runner.candidate("041-module-review-initializer").hash;
const correctionSql = fs.readFileSync(correctionPath, "utf8");
const correctionHash = hash(correctionSql);
const expectedCorrectionHash = "2deb1b5f1174c63e285e43615c795eb866e7febf7ef12b607bd340194e72f669";
const env = { ...process.env, PGPASSWORD: config.operatorPassword, PGHOSTADDR: "127.0.0.1", PGSSLMODE: "disable" };
for (const key of ["PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGDATABASE", "PGUSER", "PGHOST", "PGPORT", "PGPASSFILE"]) {
  delete env[key];
}
const pgArgs = ["-h", "127.0.0.1", "-p", "55440", "-U", "vtv_saas_operator", "--no-password"];

let admin;
let source;
let restored;
let runtime;
let pool;
let disposableCreated = false;
let phase = "preflight";

function attachError(client, label) {
  client.on("error", error => console.error(`DB_CLIENT_ERROR ${label} ${error.code || ""}`));
}

async function close(client) {
  if (client) await client.end().catch(() => {});
}

function relationName(row) {
  return `${row.nspname}.${row.relname}`;
}

async function snapshot(db) {
  const database = (await db.query(`
    SELECT d.encoding, pg_encoding_to_char(d.encoding) encoding_name, d.datcollate, d.datctype,
      pg_get_userbyid(d.datdba) owner
    FROM pg_database d WHERE d.datname=current_database()
  `)).rows[0];
  const extensions = (await db.query(`
    SELECT e.extname, e.extversion, n.nspname
    FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1
  `)).rows;
  const relations = (await db.query(`
    SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) owner,
      c.relrowsecurity rls,c.relforcerowsecurity forced,c.relpersistence persistence,
      c.relispartition partitioned,coalesce(array_to_string(c.reloptions,','),'') options,
      coalesce(ts.spcname,'pg_default') tablespace
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_tablespace ts ON ts.oid=c.reltablespace
    WHERE c.relkind IN('r','p','v','m','S','f','i','I')
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    ORDER BY 1,2
  `)).rows;
  const schemas = (await db.query(`
    SELECT n.nspname,pg_get_userbyid(n.nspowner) owner
    FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    ORDER BY 1
  `)).rows;
  const routines = (await db.query(`
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
      pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.provolatile volatility,
      coalesce(array_to_string(p.proconfig,','),'') config,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    ORDER BY 1,2,3
  `)).rows;
  const constraints = (await db.query(`
    SELECT n.nspname||'.'||t.relname table,x.conname name,x.contype type,
      x.convalidated validated,x.condeferrable deferrable,x.condeferred deferred,
      x.connoinherit noinherit,pg_get_constraintdef(x.oid,true) definition,
      COALESCE((SELECT json_agg(a.attname ORDER BY k.ord)::text
        FROM unnest(x.conkey) WITH ORDINALITY k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=x.conrelid AND a.attnum=k.attnum),'[]') columns,
      COALESCE((SELECT json_agg(pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)
        ORDER BY pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid))::text
        FROM pg_depend d WHERE d.classid='pg_constraint'::regclass AND d.objid=x.oid),'[]') dependencies
    FROM pg_constraint x JOIN pg_class t ON t.oid=x.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    ORDER BY 1,2
  `)).rows;
  const policies = (await db.query(`
    SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    FROM pg_policies ORDER BY 1,2,3
  `)).rows;
  const triggers = (await db.query(`
    SELECT n.nspname,t.relname,g.tgname,g.tgenabled,
      pg_get_userbyid(p.proowner) function_owner,pg_get_triggerdef(g.oid,true) definition
    FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_proc p ON p.oid=g.tgfoid
    WHERE NOT g.tgisinternal AND n.nspname NOT LIKE 'pg_%'
      AND n.nspname<>'information_schema' ORDER BY 1,2,3
  `)).rows;
  const effectiveAcls = (await db.query(`
    WITH objects AS (
      SELECT 'database:<current>' object,datacl acl,'d'::"char" kind,datdba owner
      FROM pg_database WHERE datname=current_database()
      UNION ALL
      SELECT 'schema:'||nspname,nspacl,'n'::"char",nspowner FROM pg_namespace
      WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'
      UNION ALL
      SELECT 'relation:'||n.nspname||'.'||c.relname,c.relacl,
        CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN('r','p','v','m','S','f') AND n.nspname NOT LIKE 'pg_%'
        AND n.nspname<>'information_schema'
      UNION ALL
      SELECT 'routine:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
        p.proacl,'f'::"char",p.proowner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
      UNION ALL
      SELECT 'type:'||n.nspname||'.'||t.typname,t.typacl,'T'::"char",t.typowner
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    )
    SELECT object,
      CASE WHEN x.grantor=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantor) END grantor,
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END grantee,
      x.privilege_type privilege,x.is_grantable grantable
    FROM objects o CROSS JOIN LATERAL aclexplode(COALESCE(o.acl,acldefault(o.kind,o.owner))) x
    ORDER BY object,grantor,grantee,privilege,grantable
  `)).rows;
  const roleRows = (await db.query(`
    SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
      rolreplication,rolbypassrls,rolconnlimit
    FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname
  `)).rows;
  const roleMemberships = (await db.query(`
    SELECT r.rolname role_name,m.rolname member_name,g.rolname grantor_name,
      a.admin_option,a.inherit_option,a.set_option
    FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid
    JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor
    WHERE r.rolname !~ '^pg_' AND m.rolname !~ '^pg_' ORDER BY 1,2,3
  `)).rows;
  const tableRefs = (await db.query(`
    SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN('r','p') AND n.nspname NOT LIKE 'pg_%'
      AND n.nspname<>'information_schema' ORDER BY 1,2
  `)).rows;
  const tables = [];
  for (const table of tableRefs) {
    const rows = (await db.query(`SELECT to_jsonb(t)::text rowdata FROM "${table.nspname}"."${table.relname}" t`))
      .rows.map(row => row.rowdata).sort();
    tables.push({ name: relationName(table), count: rows.length, fingerprint: hash(rows.join("\n")) });
  }
  const currentDb = (await db.query("SELECT current_database() name")).rows[0].name;
  const schemaDump = execFileSync(path.join(pgBin, "pg_dump.exe"), [
    ...pgArgs, "--schema-only", "--no-owner", "--dbname=" + currentDb
  ], { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return {
    database, extensions, relations, schemas, routines, constraints, policies, triggers,
    effectiveAcls, roles: { roles: roleRows, roleMemberships }, tables, schemaDump
  };
}

async function sourceDatabaseAcls(db) {
  return (await db.query(`
    SELECT pg_get_userbyid(x.grantor) grantor,
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END grantee,
      x.privilege_type privilege,x.is_grantable grantable
    FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) x
    WHERE d.datname=current_database()
    ORDER BY grantor,grantee,privilege,grantable
  `)).rows;
}

async function reproduceDatabaseAcls(db, aclRows) {
  if (aclRows.some(row => row.grantor !== "vtv_saas_database_owner")) {
    throw new Error("Cannot safely reproduce source database ACL grantors in the disposable database.");
  }
  await db.query("SET ROLE vtv_saas_database_owner");
  try {
    await db.query(`REVOKE ALL PRIVILEGES ON DATABASE ${quoteIdentifier(disposableName)} FROM PUBLIC`);
    for (const row of aclRows) {
      const privilege = row.privilege === "TEMPORARY" ? "TEMPORARY" : row.privilege;
      const grantee = row.grantee === "PUBLIC" ? "PUBLIC" : quoteIdentifier(row.grantee);
      const option = row.grantable ? " WITH GRANT OPTION" : "";
      await db.query(`GRANT ${privilege} ON DATABASE ${quoteIdentifier(disposableName)} TO ${grantee}${option}`);
    }
  } finally {
    await db.query("RESET ROLE");
  }
}

async function createFreshBackup() {
  const name = `pre-041-${new Date().toISOString().replace(/[^0-9]/g, "")}-${crypto.randomUUID()}`;
  const directory = path.join(backupRoot, name);
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
  if (fs.realpathSync(directory).toLowerCase() !== directory.toLowerCase()) {
    throw new Error("Redirected backup path refused.");
  }
  const dump = path.join(directory, "before.dump");
  const rolesDump = path.join(directory, "roles.sql");
  execFileSync(path.join(pgBin, "pg_dump.exe"), [...pgArgs, "-Fc", "-f", dump, "vtv_saas_dev"], { env, stdio: "ignore", windowsHide: true });
  execFileSync(path.join(pgBin, "pg_dumpall.exe"), [...pgArgs, "--database=vtv_saas_dev", "--roles-only", "-f", rolesDump], { env, stdio: "ignore", windowsHide: true });
  const archiveList = execFileSync(path.join(pgBin, "pg_restore.exe"), ["--list", dump], { encoding: "utf8", maxBuffer: 24 * 1024 * 1024, windowsHide: true });
  if (!archiveList.trim()) throw new Error("Fresh backup archive listing is empty.");
  fs.writeFileSync(path.join(directory, "archive-list.txt"), archiveList, { flag: "wx", mode: 0o600 });
  const checksums = {};
  for (const file of ["before.dump", "roles.sql", "archive-list.txt"]) {
    checksums[file] = hash(fs.readFileSync(path.join(directory, file)));
  }
  fs.writeFileSync(path.join(directory, "checksums.json"), JSON.stringify(checksums, null, 2), { flag: "wx", mode: 0o600 });
  for (const [file, expected] of Object.entries(checksums)) {
    if (hash(fs.readFileSync(path.join(directory, file))) !== expected) throw new Error(`Fresh backup checksum mismatch: ${file}`);
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    target: "127.0.0.1:55440/vtv_saas_dev",
    cluster: expectedDataDirectory,
    installationId,
    files: checksums
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(directory, "manifest.json"), manifestBytes, { flag: "wx", mode: 0o600 });
  fs.writeFileSync(path.join(directory, "manifest.sha256"), `${hash(manifestBytes)}  manifest.json\n`, { flag: "wx", mode: 0o600 });
  return { directory, checksums, manifestSha256: hash(manifestBytes), archiveEntries: archiveList.split("\n").filter(Boolean).length };
}

async function verifyTarget(db) {
  const row = (await db.query(`
    SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,
      replace(current_setting('data_directory'),chr(92),'/') directory,
      (SELECT installation_id::text FROM saas.schema_version WHERE version=1) installation,
      session_user role,
      to_regprocedure('invoice_routing.initialize_module_reviews(uuid,text)') IS NULL initializer_absent
  `)).rows[0];
  if (row.database !== "vtv_saas_dev" || row.host !== "127.0.0.1" || row.port !== 55440 ||
      row.directory !== expectedDataDirectory || row.installation !== installationId ||
      row.role !== "vtv_saas_operator" || !row.initializer_absent) {
    throw new Error("Approved source target or unapplied-migration gate failed.");
  }
  const counts = (await db.query(`
    SELECT count(*)::int purposes,
      (SELECT count(*)::int FROM invoice_routing.module_reviews) reviews,
      (SELECT count(*)::int FROM invoice_routing.module_review_events) events
    FROM invoice_routing.purposes
  `)).rows[0];
  if (counts.purposes !== 45 || counts.reviews !== 0 || counts.events !== 0) {
    throw new Error("Live Migration 034 prerequisite counts changed.");
  }
  return row;
}

async function createSyntheticIdentity(db, role, companies, selectedCompany) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hash(Buffer.from(token));
  const email = `m041-${crypto.randomUUID()}@example.test`;
  const user = (await db.query(`
    INSERT INTO web_auth.users(full_name,email,password_hash,email_verified_at,status)
    VALUES('Disposable Migration 041 Test',$1,'$argon2id$disposable-test',now(),'active')
    RETURNING id::text
  `, [email])).rows[0].id;
  for (const company of companies) {
    await db.query(`
      INSERT INTO web_auth.company_memberships(user_id,company_id,role,status)
      VALUES($1,$2,$3,'active')
    `, [user, company, role]);
  }
  const session = (await db.query(`
    INSERT INTO web_auth.sessions(user_id,token_hash,expires_at)
    VALUES($1,$2,now()+interval '10 days') RETURNING id::text
  `, [user, tokenHash])).rows[0].id;
  await db.query("INSERT INTO saas.company_selections(session_id,company_id) VALUES($1,$2)", [session, selectedCompany]);
  return { user, token, tokenHash };
}

async function main() {
  if (migrationHash !== expectedHash || runnerHash !== expectedHash) throw new Error("Migration hash or runner pin mismatch.");
  if (correctionHash !== expectedCorrectionHash) throw new Error("Correction migration checksum changed; review before rehearsal.");
  if (migrationSql.split(targetGuard).length !== 2) throw new Error("Expected exactly one reviewed database guard.");
  if (correctionSql.split(correctionTargetGuard).length !== 2) throw new Error("Expected exactly one correction migration database guard.");
  if (fs.statfsSync(backupRoot).bavail * fs.statfsSync(backupRoot).bsize < 1024 * 1024 * 1024) {
    throw new Error("Insufficient free space for the approved backup location.");
  }
  phase = "connect source";
  source = new Client({ ...common.connection("vtv_saas_operator"), statement_timeout: 180000 });
  attachError(source, "source");
  await source.connect();
  const target = await verifyTarget(source);
  phase = "create fresh source-verified backup";
  const backup = await createFreshBackup();
  const sourceSnapshot = await snapshot(source);
  const sourcePurposeRows = (await source.query(`
    SELECT company_id::text,document_id::text,purpose,version::text,updated_by::text,updated_at::text
    FROM invoice_routing.purposes ORDER BY company_id,document_id
  `)).rows;
  const dbAcls = await sourceDatabaseAcls(source);

  phase = "connect approved cluster control database";
  admin = new Client({ ...common.connection("vtv_saas_operator"), database: controlDatabase, statement_timeout: 180000 });
  attachError(admin, "admin");
  await admin.connect();
  const control = (await admin.query(`
    SELECT current_database() database,host(inet_server_addr()) host,inet_server_port() port,
      session_user role,pg_has_role(current_user,'vtv_saas_database_owner','MEMBER') owner_member
  `)).rows[0];
  if (control.database !== controlDatabase || control.host !== "127.0.0.1" || control.port !== 55440 ||
      control.role !== "vtv_saas_operator" || !control.owner_member) throw new Error("Disposable database creation target failed.");
  if (!/^vtv_trial_restore_041_[a-z0-9_]+$/.test(disposableName) ||
      (await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [disposableName])).rowCount) {
    throw new Error("Disposable database name/absence guard failed.");
  }
  phase = "create owner-matched disposable database and restore";
  await admin.query(`CREATE DATABASE ${quoteIdentifier(disposableName)} OWNER vtv_saas_database_owner`);
  disposableCreated = true;
  await reproduceDatabaseAcls(admin, dbAcls);
  execFileSync(path.join(pgBin, "pg_restore.exe"), [
    ...pgArgs, "--exit-on-error", "--single-transaction", "-d", disposableName,
    path.join(backup.directory, "before.dump")
  ], { env, stdio: "ignore", windowsHide: true });
  restored = new Client({ ...common.connection("vtv_saas_operator"), database: disposableName, statement_timeout: 180000 });
  attachError(restored, "restored");
  await restored.connect();
  const restoredSnapshot = await snapshot(restored);
  if (!compare.catalogConstraintsEquivalent(sourceSnapshot, restoredSnapshot)) {
    throw new Error("Catalog definitions/dependencies differ for the approved formatting-only constraints.");
  }
  const equivalence = compare.compareSnapshots(sourceSnapshot, restoredSnapshot, [
    "documents_object_version_check", "team_invitations_email_check"
  ]);
  if (!equivalence.pass) throw new Error(`Strict source-to-restore comparison failed: ${JSON.stringify(equivalence.checks)}`);

  phase = "capture purpose baseline and choose an authorized synthetic fixture";
  const purposeBefore = (await restored.query(`
    SELECT company_id::text,document_id::text,purpose,version::text,updated_by::text,updated_at::text
    FROM invoice_routing.purposes ORDER BY company_id,document_id
  `)).rows;
  const candidates = (await restored.query(`
    WITH eligible AS (
      SELECT p.company_id,m.user_id,m.role,
        count(DISTINCT perm.code) capabilities,
        count(DISTINCT p.document_id) FILTER(WHERE p.purpose IN('vat','both')) vat_documents,
        count(DISTINCT p.document_id) FILTER(WHERE p.purpose IN('ors','both')) ors_documents
      FROM invoice_routing.purposes p
      JOIN web_auth.company_memberships m ON m.company_id=p.company_id
        AND m.role='Owner' AND m.status='active'
      JOIN web_auth.users u ON u.id=m.user_id AND u.status='active' AND u.email_verified_at IS NOT NULL
      JOIN saas.company_profiles cp ON cp.company_id=p.company_id AND cp.status='active'
      JOIN saas.billing_accounts a ON a.id=cp.account_id AND a.status='active'
      JOIN saas.subscription_entitlements e ON e.account_id=a.id
        AND e.status='active' AND e.verified_at IS NOT NULL AND e.source_reference IS NOT NULL
        AND e.ors_enabled
        AND (e.trial_status IS NULL OR e.trial_status='converted'
          OR (e.trial_status='active' AND e.trial_expires_at>statement_timestamp()))
      JOIN saas.company_roles r ON r.code=m.role
      JOIN saas.role_permissions rp ON rp.role_id=r.id
      JOIN saas.permissions perm ON perm.id=rp.permission_id
        AND perm.code IN('company:read','company:manage','documents:read','invoices:write','procurement:write')
      GROUP BY p.company_id,m.user_id,m.role
      HAVING count(DISTINCT perm.code)=5
        AND count(DISTINCT p.document_id) FILTER(WHERE p.purpose IN('vat','both'))>0
        AND count(DISTINCT p.document_id) FILTER(WHERE p.purpose IN('ors','both'))>0
    )
    SELECT company_id::text,user_id::text,role,vat_documents::int,ors_documents::int
    FROM eligible ORDER BY company_id,user_id LIMIT 1
  `)).rows;
  if (!candidates.length) throw new Error("No eligible existing company has both VAT and ORS source documents.");
  const companyA = candidates[0].company_id;
  const vatExpected = candidates[0].vat_documents;
  const orsExpected = candidates[0].ors_documents;
  const companyB = (await restored.query(`
    SELECT p.company_id::text FROM invoice_routing.purposes p
    JOIN saas.company_profiles cp ON cp.company_id=p.company_id AND cp.status='active'
    JOIN saas.billing_accounts a ON a.id=cp.account_id AND a.status='active'
    WHERE p.company_id<>$1 GROUP BY p.company_id ORDER BY p.company_id LIMIT 1
  `, [companyA])).rows[0]?.company_id;
  if (!companyB) throw new Error("No second tenant is available for isolation testing.");

  phase = "install database-name-adjusted migration copy in disposable database";
  const rehearsalSql = migrationSql.replace(targetGuard, `current_database()<>'${disposableName}'`);
  if (rehearsalSql === migrationSql || rehearsalSql.split(`current_database()<>'${disposableName}'`).length !== 2) {
    throw new Error("Disposable migration target adjustment was not exact.");
  }
  await restored.query(rehearsalSql);
  const owner = await createSyntheticIdentity(restored, "Owner", [companyA], companyA);
  const viewer = await createSyntheticIdentity(restored, "Viewer", [companyA], companyA);

  phase = "confirm Migration 041 selection row-lock failure under forced RLS";
  await restored.query("BEGIN");
  await restored.query("SET LOCAL ROLE vtv_saas_owner");
  await restored.query(`
    SELECT set_config('app.session_hash',$1,true),set_config('app.company_id',$2,true),
      set_config('app.permission',$3,true)
  `, [owner.tokenHash, companyA, "invoices:write"]);
  const ownerAuthorization = (await restored.query(`
    SELECT current_user role,
      current_setting('app.company_id',true) IS NOT DISTINCT FROM $1::text company_context,
      current_setting('app.permission',true)='invoices:write' permission_context,
      saas.current_actor()::text actor,
      saas.current_session() IS NOT NULL active_session,
      saas.authorized_company($1::uuid,'company:manage') company_manage,
      saas.authorized_company($1::uuid,'documents:read') documents_read,
      saas.authorized_company($1::uuid,'invoices:write') vat_write,
      EXISTS(SELECT 1 FROM web_auth.company_memberships m
        WHERE m.user_id=saas.current_actor() AND m.company_id=$1::uuid
          AND m.role IN('Owner','Admin') AND m.status='active') administrator_membership,
      EXISTS(SELECT 1 FROM saas.company_selections s
        WHERE s.session_id=saas.current_session() AND s.company_id=$1::uuid) selected_company,
      (SELECT s.company_id::text FROM saas.company_selections s
        WHERE s.session_id=saas.current_session() FOR SHARE OF s) selected_company_for_share,
      current_setting('app.company_id',true) app_company_id,
      current_setting('app.permission',true) app_permission,
      invoice_routing.module_review_initializer_scope($1::uuid,'vat') vat_initializer_scope
  `, [companyA])).rows[0];
  await restored.query("ROLLBACK");
  const migration041AuthorizationChecks = {
    functionOwnerRole: ownerAuthorization.role === "vtv_saas_owner",
    companyContext: ownerAuthorization.company_context,
    permissionContext: ownerAuthorization.permission_context,
    actorMatches: ownerAuthorization.actor === owner.user,
    activeSession: ownerAuthorization.active_session,
    companyManage: ownerAuthorization.company_manage,
    documentsRead: ownerAuthorization.documents_read,
    vatWrite: ownerAuthorization.vat_write,
    administratorMembership: ownerAuthorization.administrator_membership,
    selectedCompany: ownerAuthorization.selected_company,
    forcedRlsRowLockFiltered: ownerAuthorization.selected_company_for_share !== companyA,
    appCompanyIdMatches: ownerAuthorization.app_company_id === companyA,
    appPermissionMatches: ownerAuthorization.app_permission === "invoices:write",
    initializerScopeRejected: ownerAuthorization.vat_initializer_scope === false
  };
  if (Object.values(migration041AuthorizationChecks).some(value => !value)) {
    throw new Error(`Migration 041 forced-RLS failure was not reproduced as expected: ${JSON.stringify(migration041AuthorizationChecks)}`);
  }

  phase = "apply separately reviewed selection-RLS correction to disposable database";
  const correctionRehearsalSql = correctionSql.replace(
    correctionTargetGuard, `current_database()<>'${disposableName}'`
  );
  if (correctionRehearsalSql === correctionSql ||
      correctionRehearsalSql.split(`current_database()<>'${disposableName}'`).length !== 2) {
    throw new Error("Disposable correction target adjustment was not exact.");
  }
  await restored.query(correctionRehearsalSql);
  phase = "verify corrected function-owner authorization";
  await restored.query("BEGIN");
  await restored.query("SET LOCAL ROLE vtv_saas_owner");
  await restored.query(`
    SELECT set_config('app.session_hash',$1,true),set_config('app.company_id',$2,true),
      set_config('app.permission',$3,true)
  `, [owner.tokenHash, companyA, "invoices:write"]);
  const correctedScope = (await restored.query(
    "SELECT invoice_routing.module_review_initializer_scope($1::uuid,'vat') allowed",
    [companyA]
  )).rows[0].allowed;
  await restored.query("ROLLBACK");
  if (correctedScope !== true) throw new Error("Corrected initializer scope did not authorize the approved company.");

  phase = "exercise authenticated VAT and ORS initialization";
  pool = new Pool({ ...common.connection("vtv_saas_runtime"), database: disposableName, statement_timeout: 30000, max: 3 });
  attachError(pool, "runtime pool");
  const { loadSource } = require("../tests/load-source.cjs");
  const { createCompanyDatabase } = loadSource("lib/server/saas/transactions");
  const { moduleReviewService } = loadSource("lib/server/procurement/module-reviews");
  const database = createCompanyDatabase(pool, {
    database: { host: "127.0.0.1", port: 55440, name: disposableName, user: "vtv_saas_runtime", password: config.businessPassword },
    installationId,
    managed: false
  });
  const service = moduleReviewService(database);
  const vatScope = { sessionCookie: owner.token, companyId: companyA, permission: "invoices:write" };
  const orsScope = { ...vatScope, permission: "procurement:write" };
  runtime = new Client({ ...common.connection("vtv_saas_runtime"), database: disposableName, statement_timeout: 30000 });
  attachError(runtime, "runtime");
  await runtime.connect();
  await runtime.query("BEGIN");
  await runtime.query(`
    SELECT set_config('app.session_hash',$1,true),set_config('app.company_id',$2,true),
      set_config('app.permission',$3,true)
  `, [owner.tokenHash, companyA, "invoices:write"]);
  const authorization = (await runtime.query(`
    SELECT saas.current_actor()::text actor,
      saas.current_session()::text session_id,
      saas.current_session() IS NOT NULL session_present,
      saas.authorized_company($1,'company:manage') company_manage,
      saas.authorized_company($1,'documents:read') documents_read,
      saas.authorized_company($1,'invoices:write') vat_write,
      EXISTS(SELECT 1 FROM saas.lock_authorization($1,'invoices:write')) locked_vat_write,
      EXISTS(SELECT 1 FROM saas.company_selections s
        WHERE s.session_id=saas.current_session() AND s.company_id=$1) selected_company,
      (SELECT c.role FROM saas.company_context($1) c LIMIT 1) company_role
  `, [companyA])).rows[0];
  await runtime.query("SAVEPOINT vat_initializer_probe");
  let vatInitializerProbe;
  try {
    vatInitializerProbe = {
      inserted: (await runtime.query(
        "SELECT document_id::text FROM invoice_routing.initialize_module_reviews($1,'vat')", [companyA]
      )).rowCount
    };
  } catch (error) {
    vatInitializerProbe = {
      errorCode: error.code || "unknown", message: error.message,
      detail: error.detail || null, where: error.where || null
    };
  } finally {
    await runtime.query("ROLLBACK TO SAVEPOINT vat_initializer_probe");
    await runtime.query("RELEASE SAVEPOINT vat_initializer_probe");
  }
  await runtime.query("SAVEPOINT ors_authorization_probe");
  await runtime.query(`SELECT set_config('app.permission',$1,true)`, ["procurement:write"]);
  const orsAuthorization = (await runtime.query(`
    SELECT saas.authorized_company($1,'procurement:write') authorized,
      EXISTS(SELECT 1 FROM saas.lock_authorization($1,'procurement:write')) locked
  `, [companyA])).rows[0];
  let orsInitializerProbe;
  try {
    orsInitializerProbe = {
      inserted: (await runtime.query(
        "SELECT document_id::text FROM invoice_routing.initialize_module_reviews($1,'ors')", [companyA]
      )).rowCount
    };
  } catch (error) {
    orsInitializerProbe = {
      errorCode: error.code || "unknown", message: error.message,
      detail: error.detail || null, where: error.where || null
    };
  }
  await runtime.query("ROLLBACK TO SAVEPOINT ors_authorization_probe");
  await runtime.query("ROLLBACK");
  const authorizationChecks = {
    actorMatches: authorization.actor === owner.user,
    sessionPresent: authorization.session_present,
    sessionSelected: authorization.selected_company,
    administratorMembership: authorization.company_role === "Owner" || authorization.company_role === "Admin",
    companyManage: authorization.company_manage,
    documentsRead: authorization.documents_read,
    vatWrite: authorization.vat_write && authorization.locked_vat_write && !vatInitializerProbe.errorCode,
    orsWrite: orsAuthorization.authorized && orsAuthorization.locked && !orsInitializerProbe.errorCode
  };
  if (Object.values(authorizationChecks).some(value => !value)) {
    throw new Error(`Synthetic authorization predicates failed: ${JSON.stringify({
      ...authorizationChecks, vatInitializerProbe, orsInitializerProbe
    })}`);
  }
  if (vatInitializerProbe.inserted !== vatExpected || orsInitializerProbe.inserted !== orsExpected) {
    throw new Error(`Initializer SQL returned an unexpected disposable probe count: ${JSON.stringify({
      vat: { expected: vatExpected, probe: vatInitializerProbe },
      ors: { expected: orsExpected, probe: orsInitializerProbe }
    })}`);
  }
  const vat = await service.initialize(vatScope, "vat");
  const ors = await service.initialize(orsScope, "ors");
  if (vat.insertedCount !== vatExpected || ors.insertedCount !== orsExpected) {
    throw new Error(`Unexpected VAT/ORS insert count: ${JSON.stringify({
      vat: { expected: vatExpected, actual: vat.insertedCount },
      ors: { expected: orsExpected, actual: ors.insertedCount }
    })}`);
  }
  const vatRetry = await service.initialize(vatScope, "vat");
  const orsRetry = await service.initialize(orsScope, "ors");
  if (vatRetry.insertedCount !== 0 || orsRetry.insertedCount !== 0) throw new Error("Initializer is not idempotent.");
  let viewerDenied = false;
  try {
    await service.initialize({ sessionCookie: viewer.token, companyId: companyA, permission: "invoices:write" }, "vat");
  } catch (error) {
    if (error.status === 403) viewerDenied = true;
    else throw error;
  }
  if (!viewerDenied) throw new Error("Viewer authorization was not denied.");

  phase = "test direct cross-company denial and RLS";
  await runtime.query("BEGIN");
  await runtime.query(`
    SELECT set_config('app.session_hash',$1,true),set_config('app.company_id',$2,true),
      set_config('app.permission',$3,true)
  `, [owner.tokenHash, companyA, "invoices:write"]);
  let crossCompanyDenied = false;
  try {
    await runtime.query("SELECT document_id FROM invoice_routing.initialize_module_reviews($1,'vat')", [companyB]);
  } catch (error) {
    crossCompanyDenied = error.code === "42501";
  } finally {
    await runtime.query("ROLLBACK");
  }
  if (!crossCompanyDenied) throw new Error("Cross-company initializer call was not denied.");
  await runtime.query("BEGIN");
  await runtime.query(`
    SELECT set_config('app.session_hash',$1,true),set_config('app.company_id',$2,true),
      set_config('app.permission',$3,true)
  `, [owner.tokenHash, companyA, "invoices:write"]);
  let wrongModuleDenied = false;
  try {
    await runtime.query("SELECT document_id FROM invoice_routing.initialize_module_reviews($1,'ors')", [companyA]);
  } catch (error) {
    wrongModuleDenied = error.code === "42501";
  } finally {
    await runtime.query("ROLLBACK");
  }
  if (!wrongModuleDenied) throw new Error("Mismatched module permission was not denied.");
  await runtime.query("BEGIN");
  await runtime.query(`
    SELECT set_config('app.session_hash',$1,true),set_config('app.company_id',$2,true),
      set_config('app.permission',$3,true)
  `, [owner.tokenHash, companyA, "invoices:read"]);
  const foreignVisible = (await runtime.query(
    "SELECT count(*)::int n FROM invoice_routing.module_reviews WHERE company_id=$1", [companyB]
  )).rows[0].n;
  await runtime.query("ROLLBACK");
  if (foreignVisible !== 0) throw new Error("Forced RLS exposed another company's reviews.");

  phase = "verify runtime privileges, events, and purpose history";
  const privileges = (await restored.query(`
    SELECT has_table_privilege('vtv_saas_runtime','invoice_routing.module_reviews','INSERT') review_insert,
      has_table_privilege('vtv_saas_runtime','invoice_routing.module_reviews','UPDATE') review_update,
      has_table_privilege('vtv_saas_runtime','invoice_routing.module_review_events','INSERT') event_insert,
      has_table_privilege('vtv_saas_runtime','invoice_routing.module_review_events','UPDATE') event_update,
      has_table_privilege('vtv_saas_runtime','invoice_routing.module_review_events','DELETE') event_delete,
      has_function_privilege('vtv_saas_runtime','invoice_routing.initialize_module_reviews(uuid,text)','EXECUTE') initializer_execute,
      has_function_privilege('vtv_saas_runtime','invoice_routing.module_review_initializer_scope(uuid,text)','EXECUTE') scope_execute,
      (SELECT rolcanlogin OR rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='vtv_saas_owner') owner_unsafe,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='invoice_routing.purposes'::regclass) purposes_forced,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='invoice_routing.module_reviews'::regclass) reviews_forced,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='invoice_routing.module_review_events'::regclass) events_forced
  `)).rows[0];
  if (privileges.review_insert || !privileges.review_update || privileges.event_insert ||
      privileges.event_update || privileges.event_delete || !privileges.initializer_execute ||
      privileges.scope_execute || privileges.owner_unsafe || !privileges.purposes_forced ||
      !privileges.reviews_forced || !privileges.events_forced) {
    throw new Error(`RLS/least-privilege assertion failed: ${JSON.stringify(privileges)}`);
  }
  const counts = (await restored.query(`
    SELECT (SELECT count(*)::int FROM invoice_routing.module_reviews WHERE company_id=$1) reviews,
      (SELECT count(*)::int FROM invoice_routing.module_review_events WHERE company_id=$1) events,
      (SELECT count(*)::int FROM invoice_routing.module_review_events WHERE company_id=$1
        AND actor_id=$2 AND previous_state IS NULL AND state='pending' AND version=1) initial_events,
      (SELECT count(*)::int FROM saas.audit_events WHERE company_id=$1 AND actor_id=$2
        AND action='document.vat-review-initialized') vat_audit,
      (SELECT count(*)::int FROM saas.audit_events WHERE company_id=$1 AND actor_id=$2
        AND action='document.ors-review-initialized') ors_audit,
      (SELECT count(*)::int FROM invoice_routing.module_reviews WHERE company_id=$3) foreign_reviews,
      (SELECT count(*)::int FROM invoice_routing.module_review_events WHERE company_id=$3) foreign_events
  `, [companyA, owner.user, companyB])).rows[0];
  if (counts.reviews !== vatExpected + orsExpected || counts.events !== vatExpected + orsExpected ||
      counts.initial_events !== vatExpected + orsExpected || counts.vat_audit !== vatExpected ||
      counts.ors_audit !== orsExpected || counts.foreign_reviews !== 0 || counts.foreign_events !== 0) {
    throw new Error(`Review/audit counts differ from expected: ${JSON.stringify(counts)}`);
  }
  async function immutableWriteDenied(statement) {
    await runtime.query("BEGIN");
    await runtime.query(`
      SELECT set_config('app.session_hash',$1,true),set_config('app.company_id',$2,true),
        set_config('app.permission',$3,true)
    `, [owner.tokenHash, companyA, "invoices:write"]);
    await runtime.query("SAVEPOINT immutable_probe");
    let denied = false;
    try {
      const result = await runtime.query(statement, [companyA]);
      denied = result.rowCount === 0;
    } catch (error) {
      denied = error.code === "42501" || error.code === "P0001";
    } finally {
      await runtime.query("ROLLBACK TO SAVEPOINT immutable_probe");
      await runtime.query("RELEASE SAVEPOINT immutable_probe");
      await runtime.query("ROLLBACK");
    }
    return denied;
  }
  const appendOnly = {
    reviewEventUpdate: await immutableWriteDenied(
      "UPDATE invoice_routing.module_review_events SET state='reviewed' WHERE company_id=$1"
    ),
    reviewEventDelete: await immutableWriteDenied(
      "DELETE FROM invoice_routing.module_review_events WHERE company_id=$1"
    ),
    businessAuditUpdate: await immutableWriteDenied(
      "UPDATE saas.audit_events SET action='tampered' WHERE company_id=$1"
    ),
    businessAuditDelete: await immutableWriteDenied(
      "DELETE FROM saas.audit_events WHERE company_id=$1"
    )
  };
  if (Object.values(appendOnly).some(denied => !denied)) throw new Error("An append-only audit write was not denied.");
  const purposeAfter = (await restored.query(`
    SELECT company_id::text,document_id::text,purpose,version::text,updated_by::text,updated_at::text
    FROM invoice_routing.purposes ORDER BY company_id,document_id
  `)).rows;
  if (JSON.stringify(purposeBefore) !== JSON.stringify(purposeAfter)) throw new Error("Invoice purpose history changed.");

  phase = "verify live source is unchanged";
  await verifyTarget(source);
  const sourceAfter = await snapshot(source);
  const sourceUnchanged = compare.compareSnapshots(sourceSnapshot, sourceAfter, []);
  const sourcePurposesAfter = (await source.query(`
    SELECT company_id::text,document_id::text,purpose,version::text,updated_by::text,updated_at::text
    FROM invoice_routing.purposes ORDER BY company_id,document_id
  `)).rows;
  if (!sourceUnchanged.pass || JSON.stringify(sourcePurposeRows) !== JSON.stringify(sourcePurposesAfter)) {
    throw new Error("Source changed during disposable rehearsal; investigate before any approval.");
  }

  const evidence = {
    result: "PASS",
    migrationSha256: migrationHash,
    runnerPin: runnerHash,
    selectionCorrectionSha256: correctionHash,
    migration041SelectionFailureConfirmed: true,
    correctionMigrationAppliedOnlyToDisposable: true,
    liveMigrationExecuted: false,
    sourceVerifiedUnchanged: true,
    sourcePurposeHistorySha256: hash(JSON.stringify(sourcePurposeRows)),
    backup: { directory: backup.directory, checksums: backup.checksums, archiveEntries: backup.archiveEntries },
    disposable: disposableName,
    restoreEquivalence: true,
    sourceTableCount: sourceSnapshot.tables.length,
    vat: { expected: vatExpected, inserted: vat.insertedCount, retryInserted: vatRetry.insertedCount },
    ors: { expected: orsExpected, inserted: ors.insertedCount, retryInserted: orsRetry.insertedCount },
    authorization: { viewerDenied, crossCompanyDenied, foreignRowsVisible: foreignVisible },
    migration041AuthorizationChecks,
    audit: counts,
    appendOnly,
    purposesUnchanged: true,
    forcedRlsAndRuntimePrivileges: privileges
  };
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch(error => {
  console.error(`REHEARSAL_STOPPED phase=${phase}: ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await close(runtime);
  if (pool) await pool.end().catch(() => {});
  await close(restored);
  await close(source);
  if (admin && disposableCreated) {
    try {
      const exists = (await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [disposableName])).rowCount > 0;
      if (exists && /^vtv_trial_restore_041_[a-z0-9_]+$/.test(disposableName)) {
        await admin.query(`DROP DATABASE ${quoteIdentifier(disposableName)}`);
        console.log(`DISPOSABLE_DATABASE_DROPPED ${disposableName}`);
      }
    } catch (error) {
      console.error(`DISPOSABLE_CLEANUP_FAILED ${disposableName}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  await close(admin);
});
