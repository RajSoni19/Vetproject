-- OWNER-RUN ONLY: membership inquiry, never SET ROLE or object creation.
\set expected_database vetthevat_test
\set expected_role vetthevat_test_migrator
\set expected_owner vetthevat_test_owner
\set audit_kind migrator
\ir session.sql
\ir catalog.sql
\ir migrator.sql
ROLLBACK;
