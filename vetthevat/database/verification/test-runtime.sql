-- OWNER-RUN ONLY: synthetic environment, metadata only.
\set expected_database vetthevat_test
\set expected_role vetthevat_test_runtime
\set expected_owner vetthevat_test_owner
\set audit_kind runtime
\ir session.sql
\ir catalog.sql
ROLLBACK;
