import {readSmtpConfiguration,type SmtpConfiguration} from "@/lib/server/providers/smtp";
export type LeadConfiguration = { origin: string; database: { host: string; port: number; name: string; user: string; password: string }; secret: string; receiptSecret: string; siteKey: string; turnstileSecret: string; email: SmtpConfiguration | null };
export function readLeadConfiguration(env: Readonly<Record<string, string | undefined>>): LeadConfiguration | undefined {
  if (env.LEADS_ENABLED !== "1") return undefined;
  try {
    const required = (name: string) => { const value = env[name]; if (!value || /[<>\r\n]|CHANGE_ME|REPLACE_ME/.test(value)) throw new Error(); return value; };
    const origin = required("LEADS_ORIGIN"), originUrl = new URL(origin);
    if (originUrl.origin !== origin || originUrl.protocol !== "https:") return undefined;
    const url = new URL(required("LEADS_DATABASE_URL"));
    const user = decodeURIComponent(url.username), name = decodeURIComponent(url.pathname.slice(1));
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.search || url.hash || !url.hostname || !/^[a-z][a-z0-9_]{0,62}$/.test(name) || !/^[a-z][a-z0-9_]{0,62}$/.test(user) || /postgres|owner|migrat|admin/i.test(user) || name !== required("LEADS_DATABASE_NAME") || user !== "vetthevat_leads_runtime" || !url.password) return undefined;
    const secret = required("LEADS_HASH_SECRET"), receiptSecret = required("LEADS_RECEIPT_SECRET"), siteKey = required("LEADS_TURNSTILE_SITE_KEY"), turnstileSecret = required("LEADS_TURNSTILE_SECRET_KEY");
    if (secret.length < 32 || receiptSecret.length < 32 || secret === receiptSecret || !/^[a-zA-Z0-9_-]{10,100}$/.test(siteKey) || siteKey.startsWith("1x000000") || siteKey.startsWith("2x000000") || siteKey.startsWith("3x000000")) return undefined;
    let email: LeadConfiguration["email"] = null;
    if (env.LEADS_EMAIL_DELIVERY_APPROVED === "1") {
      const smtp=readSmtpConfiguration(env);if(!smtp)return undefined;email=smtp;
    }
    return { origin, secret, receiptSecret, siteKey, turnstileSecret, database: { host: url.hostname, port: url.port ? Number(url.port) : 5432, name, user, password: decodeURIComponent(url.password) }, email };
  } catch { return undefined; }
}
