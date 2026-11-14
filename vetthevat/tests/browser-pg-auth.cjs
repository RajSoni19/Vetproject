// Reuse the installed-Chrome CDP driver with a fresh synthetic browser profile.
process.argv.push('--pg-auth-only');
require('./browser-invoices.cjs');
