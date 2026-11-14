# Milestone 3C.1 — owner-run read-only security verification

Prepared only. **No script was executed and no database connection was made.**
Owner-reported evidence: both runtime logins succeeded on 127.0.0.1:5432, reported
17.11 and the expected user/database. This does not establish cluster identity,
roles, ACLs, HBA, migration readiness or available agent credentials. The one failed
test login is not evidence that a password must be reset; no reset was attempted.

Only these new verification files and the static review document were created.
Application code, configuration, both migration drafts and the immutable backup
are unchanged. No dependency installation, migration, role change or provider access.

## Entry scripts and access boundary

| Entry file | Connect as | Target | Additional privileges needed |
| --- | --- | --- | --- |
| dev-runtime.sql | vetthevat_dev_runtime | vetthevat_dev | Existing CONNECT and catalog inquiry only |
| test-runtime.sql | vetthevat_test_runtime | vetthevat_test | Existing CONNECT and catalog inquiry only |
| dev-migrator.sql | vetthevat_dev_migrator | vetthevat_dev | Existing migrator login; no owner assumption occurs |
| test-migrator.sql | vetthevat_test_migrator | vetthevat_test | Existing migrator login; no owner assumption occurs |
| dev-admin.sql | Existing approved local administrator | vetthevat_dev | Superuser required by guard for control/HBA inspection |
| test-admin.sql | Same approved local administrator | vetthevat_test | Superuser required by guard for control/HBA inspection |

`session.sql`, `catalog.sql`, `migrator.sql`, `administrator.sql` are shared includes,
not independent entry scripts. Run from PowerShell using `-f` exactly as below.
Do not run them inside an existing interactive transaction. Relative `\ir` includes
resolve against their containing file. `\set` controls psql only; it is not SQL SET.

All SQL is SELECT/WITH over catalogs or privilege/control inquiry, enclosed in
`BEGIN READ ONLY` and `ROLLBACK`. No application rows, credential hashes, HBA option
values, routine bodies or raw role settings are read or printed. Scripts neither
set tenant context nor assume roles nor attempt prohibited writes as negative tests.
The target guard requires exact version 170011, IPv4 loopback, port, database,
current/session user and read-only transaction. A mismatch deliberately raises
division-by-zero with ON_ERROR_STOP, terminating the include chain. Unexpected SQL
errors stop execution; inspect them rather than rerunning as a stronger role.
Exit 0 means queries completed, **not** that privileges are secure. Owner must review
all result sections; catalog truth values are not automatically pass/fail assertions.

## Exact PowerShell commands — owner execution only

Do not paste passwords here or into commands. `-W` prompts privately in the local
terminal; there is no password in these command lines. Use a terminal without a
transcript, screen recording or output redirection. Do not use `-a`, `-e`, `\o`,
Tee-Object, PGPASSWORD or a credential-bearing connection URI. Keep administrative
metadata (role names/HBA networks/cluster identifier) local unless deliberately
sharing a redacted review. Never share credentials or HBA option values.

Startup options below affect only each new session: read-only default, trusted
catalog search path and bounded waits. They do not alter files, role defaults or
application configuration. Both host and hostaddr are explicit so an inherited
PGHOSTADDR cannot silently select another host. No script connects elsewhere.

Run one command at a time and check `$LASTEXITCODE` immediately. Stop on nonzero,
target guard error, unexpected objects or any failed checklist item. Do not reset
credentials or grant privileges to make an audit pass.

```powershell
$auditPsql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'

& $auditPsql -X -W -v ON_ERROR_STOP=1 -U vetthevat_dev_runtime -d "host=127.0.0.1 hostaddr=127.0.0.1 port=5432 dbname=vetthevat_dev connect_timeout=5 options='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=15000 -c lock_timeout=2000'" -f 'D:\vetthevat\database\verification\dev-runtime.sql'
$LASTEXITCODE

& $auditPsql -X -W -v ON_ERROR_STOP=1 -U vetthevat_test_runtime -d "host=127.0.0.1 hostaddr=127.0.0.1 port=5432 dbname=vetthevat_test connect_timeout=5 options='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=15000 -c lock_timeout=2000'" -f 'D:\vetthevat\database\verification\test-runtime.sql'
$LASTEXITCODE

& $auditPsql -X -W -v ON_ERROR_STOP=1 -U vetthevat_dev_migrator -d "host=127.0.0.1 hostaddr=127.0.0.1 port=5432 dbname=vetthevat_dev connect_timeout=5 options='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=15000 -c lock_timeout=2000'" -f 'D:\vetthevat\database\verification\dev-migrator.sql'
$LASTEXITCODE

& $auditPsql -X -W -v ON_ERROR_STOP=1 -U vetthevat_test_migrator -d "host=127.0.0.1 hostaddr=127.0.0.1 port=5432 dbname=vetthevat_test connect_timeout=5 options='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=15000 -c lock_timeout=2000'" -f 'D:\vetthevat\database\verification\test-migrator.sql'
$LASTEXITCODE
```

For administration, enter the **existing approved administrator role name**, not
its password, at Read-Host. Its separate password is entered only at psql's prompt.
No administrator account is created or guessed. The name validation avoids
connection/variable ambiguity; a differently formatted existing role needs a
reviewed command instead of removing validation or renaming it.

```powershell
$auditAdminRole = Read-Host 'Existing local PostgreSQL administrator ROLE NAME (not password)'
if ($auditAdminRole -cnotmatch '^[a-z_][a-z0-9_]{0,62}$') { throw 'Stop: review administrator role name.' }

& $auditPsql -X -W -v ON_ERROR_STOP=1 -v "expected_role=$auditAdminRole" -U $auditAdminRole -d "host=127.0.0.1 hostaddr=127.0.0.1 port=5432 dbname=vetthevat_dev connect_timeout=5 options='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=15000 -c lock_timeout=2000'" -f 'D:\vetthevat\database\verification\dev-admin.sql'
$LASTEXITCODE

& $auditPsql -X -W -v ON_ERROR_STOP=1 -v "expected_role=$auditAdminRole" -U $auditAdminRole -d "host=127.0.0.1 hostaddr=127.0.0.1 port=5432 dbname=vetthevat_test connect_timeout=5 options='-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=15000 -c lock_timeout=2000'" -f 'D:\vetthevat\database\verification\test-admin.sql'
$LASTEXITCODE
```

## Security verification checklist and interpretation

All statuses below are **PENDING owner query results**. Owner login success is
reported evidence only; no role matrix is claimed as independently verified.

| Check / output section | Expected secure result | Meaning of a failed/unexpected result |
| --- | --- | --- |
| Session guard | Correct 17.11 / 127.0.0.1 / 5432 / selected DB / same current and session role / read-only on | Wrong target or version; stop, do not edit configuration to force success. Any later patch version needs reviewed guard update, not bypass. |
| C01 database identities | Both exist, allow connections, are not templates, and each matches its named NOLOGIN owner | Ownership/environment setup differs; no migration approval yet. Catalog visibility does not prove permission to connect. |
| C02 runtime attributes | LOGIN true; SUPERUSER, CREATEDB, CREATEROLE, REPLICATION and BYPASSRLS false | Excess privilege or unusable runtime. Do not change anything during verification. |
| C02 owner attributes | LOGIN false; all five administrative attributes false | Owner login/admin exposure. Owner still has powerful ownership rights even without BYPASSRLS. |
| C02 migrator attributes | LOGIN true; all five administrative attributes false | Migrator should obtain migration ownership only through its own owner membership. |
| C03/C04 memberships | Runtime has no owner/migrator/privileged memberships, SET or inherited privileges; no ADMIN option. Migrator reaches only its environment's owner, with SET true, preferably inheritance false, ADMIN false | Escalation, inherited ownership or cross-environment path. Review all indirect roles too. Owner's implicit pg_database_owner membership is expected for its current database and is not a runtime grant. |
| C05 runtime database privileges | Own DB CONNECT true, CREATE/TEMP false; opposite DB CONNECT/CREATE/TEMP false; no grant option | Environment separation failure or DDL/temp escape. No cross-environment login is attempted by scripts. HBA can further deny, but should not substitute for restricted ACLs. |
| C05 migrator privileges | Own DB CONNECT true. Direct CREATE/TEMP preferably false with explicit-owner assumption design; opposite DB privileges false | Direct inherited CREATE may indicate owner inheritance, creating risk of objects owned by the migrator instead of intended owner. Review membership and actual creator defaults together. |
| C06 PUBLIC database grants | No PUBLIC CONNECT, CREATE or TEMP on either application database | PUBLIC CONNECT/TEMP can restore capabilities despite explicit per-role restrictions. Database owner grants are expected. |
| C07 schema privileges | Runtime CREATE false on every non-system schema. VAT USAGE is absent before schema exists; later explicitly approved only for own environment. PUBLIC CREATE absent | A schema-creation path or broader exposure exists. PUBLIC USAGE on public schema is not equivalent to CREATE and must be interpreted with object ACLs. Missing vat before migrations is expected. |
| C08-C11 object ownership/access | Before migration, no unexpected VAT objects. Runtime owns none. No unapproved DML, TRUNCATE, TRIGGER, MAINTAIN, sequence advance rights, grant options or executable user routines. Approved reads later use RLS and minimal DTOs | Existing objects are a stop condition for a fresh-baseline migration. A table ACL does not prove RLS row access. SECURITY DEFINER routines/views may open paths beyond table grants. Fixed search_path presence alone does not prove a routine safe. |
| C12/C13 defaults | Owner and migrator global+schema defaults have no unexpected runtime/PUBLIC DML, grant options or routine EXECUTE. Inspect both DBs separately | Empty pg_default_acl does NOT mean no default access. Built-in function PUBLIC EXECUTE/type PUBLIC USAGE still apply unless globally changed. Type USAGE needs deliberate review, not automatic classification as a write path. Schema-local grants add to global grants. |
| C14 existing RLS policy metadata | No policies expected if draft unapplied. After later migration, all intended tenant tables have enabled+forced RLS; only approved commands/roles | Unexpected existing policies/objects require deeper review. This audit deliberately avoids printing expressions that could contain literals/private values; policy metadata is not proof of policy correctness. |
| C15 session settings | search_path is pg_catalog for these audit sessions; row_security on | Audit startup path should be trusted. This is not evidence of application's or owner's normal search path. |
| C16 PUBLIC object ACLs | No unexpected PUBLIC relation/column/sequence privileges | Explicit column grants can expose data even without table-wide SELECT. Existing invoker=false views in C08 also require review of owner/RLS semantics. |
| M01/M02 migrator | Own NOLOGIN owner exists and owns DB; MEMBER and SET true; ADMIN false; inheritance preferably false | Missing SET prevents intended explicit migration ownership. USAGE false with SET true is intentional; do not run SET ROLE to test it in 3C.1. |
| A01 cluster identity | Same system_identifier and control/catalog versions from both DB connections; owner recognizes intended local cluster | Same version/port alone does not identify a cluster. A newly observed identifier has no prior approved baseline; matching only proves both sessions reached the same cluster at those times. |
| A02 network/auth configuration | Port 5432; listener loopback-only; password_encryption scram-sha-256. SSL policy documented for local use | Wider listener or weaker encryption needs review, not an automatic configuration change. password_encryption controls future password setting; it does not establish stored verifier type or negotiated authentication. Password hashes are deliberately not queried. |
| A03 HBA | No parse errors. First applicable rule for each login/DB/address/SSL condition uses approved authentication, preferably scram-sha-256. No earlier trust or overbroad allow bypasses intended restrictions | Ordered first match matters; group rules and IPv6 must also be reviewed. Rules list file contents, not proof of which configuration was last loaded or exact matched rule of prior login. md5 rule may negotiate SCRAM with a SCRAM verifier; do not infer stored credential type from method label. Option values are intentionally omitted because they may contain secrets. |
| A04 runtime-owned objects | Zero rows | Routine/type/schema ownership is an escalation concern even if table ownership looks correct. Check C08 for relations as well. |

No runtime writes are attempted to prove denial, no functions/procedures are
invoked beyond catalog/inquiry functions, no HBA reload occurs, and no password
verifiers are inspected. Read-only transaction guarantees do not neutralize a
superuser or arbitrary unsafe SELECT functions: keep these allowlisted scripts
unchanged during owner execution. Existing views and user routines are inspected
by metadata only, never selected from or invoked.

## Static review and next approval

Read [the migration security review](../../docs/milestone-3c1-migration-security-review.md).
The strongest blockers are context trust, capability-level read restrictions,
effective migration ownership/default ACLs, atomic schema/RLS exposure, full invoice
reconciliation and concurrent banking allocations. Actual cluster compatibility
remains unverified until owner results are reviewed.

Next action is owner review/execution of this **read-only package**. Do not approve
3C.2 blindly. After evidence and revised SQL are reviewed, the exact next approval
must specify: approved cluster identifier; 127.0.0.1:5432/vetthevat_test ONLY;
vetthevat_test_migrator explicitly assuming vetthevat_test_owner; exact reviewed
migration files/checksums and runner; synthetic fixtures and RLS/concurrency test
scope; backup/recovery; stop on any unexpected objects/errors; no DROP/reset,
development/production migration or browser-data import. That execution approval
has **not** been given and is not requested as a substitute for unresolved findings.

Scripts were statically checked locally; they have not been parsed or executed by
PostgreSQL. No dependency or application check is needed for these new SQL/docs
artifacts, and no application build/test was rerun. PostgreSQL 17 references:
[psql](https://www.postgresql.org/docs/17/app-psql.html),
[privilege inquiries](https://www.postgresql.org/docs/17/functions-info.html),
[membership options](https://www.postgresql.org/docs/17/catalog-pg-auth-members.html),
[HBA view](https://www.postgresql.org/docs/17/view-pg-hba-file-rules.html),
[default ACLs](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

Offline validation result: all **10 SQL files** passed statement-start and forbidden
SQL/function checks, psql meta-command allowlisting and local include resolution.
This is a static safety check, not a PostgreSQL syntax/integration test or proof of
actual privileges. Execution requires the owner's separate decision.
