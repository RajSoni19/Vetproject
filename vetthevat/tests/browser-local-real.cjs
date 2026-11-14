process.env.VTV_BROWSER_SAAS='1';process.env.VTV_BROWSER_LOCAL_ENTRY='1';process.argv.push('--pg-auth-only');require('./browser-invoices.cjs');
