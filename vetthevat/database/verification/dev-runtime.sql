-- OWNER-RUN ONLY: read-only metadata audit; never a migration.
\set expected_database vetthevat_dev
\set expected_role vetthevat_dev_runtime
\set expected_owner vetthevat_dev_owner
\set audit_kind runtime
\ir session.sql
\ir catalog.sql
ROLLBACK;
