-- OWNER-RUN ONLY: membership inquiry, never SET ROLE or object creation.
\set expected_database vetthevat_dev
\set expected_role vetthevat_dev_migrator
\set expected_owner vetthevat_dev_owner
\set audit_kind migrator
\ir session.sql
\ir catalog.sql
\ir migrator.sql
ROLLBACK;
