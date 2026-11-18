import {readSaasConfiguration} from "@/lib/server/saas/config";
import {managedProfileSelected} from "@/lib/server/deployment-profile";
export function manualInvoicesEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_MANUAL_INVOICES_ENABLED==='1'&&env.SAAS_MANUAL_SCHEMA_SHA256==='0cbf009b4eb221e8c78c277d12899bff070601afbb4227e3aa113f88f26ab2c0'&&Boolean(readSaasConfiguration(env));}
export function supplierLogosEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_SUPPLIER_LOGOS_ENABLED==='1'&&env.SAAS_SUPPLIER_LOGO_SCHEMA_SHA256==='54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4'&&env.SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256==='8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087'&&env.VERCEL===undefined&&!managedProfileSelected(env)&&manualInvoicesEnabled(env);}
// ORS is separately gated: an installed schema alone must never expose a route.
export function orsEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_ORS_ENABLED==='1'&&env.SAAS_ORS_SCHEMA_SHA256==='01ee40df056f5b55ab4493ca4f8b9483116339ca2c85761f1823d9f9b64476fe'&&Boolean(readSaasConfiguration(env));}
export function orsShoppingEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_ORS_SHOPPING_ENABLED==='1'&&env.SAAS_ORS_SHOPPING_SCHEMA_SHA256==='aed2aacff75651dabe8970ed3b6126c5a2081fc8f908932a61260a58b82b9997'&&env.SAAS_ORS_SHOPPING_AUTH_SCHEMA_SHA256==='295ad2b78f593d2cd5eb1afd3d6353f3e58969a089cf8c4f4244bf4cd9c98d38'&&Boolean(readSaasConfiguration(env));}
// Document routes are exposed only behind the same isolated Stage B gate. Upload
// itself remains unavailable without private storage; originals stay quarantined
// until the separately hosted trusted scanner/decoder worker confirms them.
export function manualInvoicePath(path:string){return /^\/api\/business\/(?:contacts(?:\/[a-f0-9-]{36}(?:\/logo(?:\/content)?)?)?|invoices(?:\/[a-f0-9-]{36}(?:\/(?:confirm|export|attachments|payments(?:\/[a-f0-9-]{36})?|tax-review))?)?|documents(?:\/processing-health|\/[a-f0-9-]{36}(?:\/(?:status|extraction|retry|purpose|review\/(?:vat|ors)))?)?|banking\/transactions\/[a-f0-9-]{36}\/category|document-reviews|vat-report|invoice-report|invoice-extract|analytics|supplier-prices|dashboard|audit)$/.test(path);}
export function orsPath(path:string){return /^\/api\/ors(?:\/|$)/.test(path);}
