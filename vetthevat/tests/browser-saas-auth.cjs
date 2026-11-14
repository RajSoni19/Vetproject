// New isolated database only; the existing auth test DB is never used.
process.env.VTV_BROWSER_SAAS='1';process.argv.push('--pg-auth-only');
require('./browser-invoices.cjs');
