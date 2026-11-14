-- OWNER-RUN ONLY: pass expected_role via psql -v, matching the -U login.
\set expected_database vetthevat_test
\set expected_owner vetthevat_test_owner
\set audit_kind administrator
\ir session.sql
\ir catalog.sql
\ir administrator.sql
ROLLBACK;
