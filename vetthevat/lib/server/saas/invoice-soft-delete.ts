export const invoiceSoftDeleteSchemaSha256="c00d0999271ce0fde2d94ae3909a3ad6b2c1e968785333ecaf9ef859a65089ed";
export function invoiceSoftDeleteEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_INVOICE_SOFT_DELETE_ENABLED==="1"&&env.SAAS_INVOICE_SOFT_DELETE_SCHEMA_SHA256===invoiceSoftDeleteSchemaSha256;}
