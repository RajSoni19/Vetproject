import "server-only";
import { Pool } from "pg";
import { isIP } from "node:net";
import { readLeadConfiguration } from "@/lib/server/leads/config";
import { postgresLeadStore, type LeadDatabase } from "@/lib/server/leads/postgres";
import { turnstileVerifier, smtpLeadMailer } from "@/lib/server/leads/providers";
import { LeadError, type PublicLeadDependencies } from "@/lib/server/leads/core";

export function leadFormConfiguration() {
  const config = readLeadConfiguration(process.env);
  return { enabled: Boolean(config), siteKey: config?.siteKey };
}
let services: ReturnType<typeof createServices> | undefined;
function createServices(config: NonNullable<ReturnType<typeof readLeadConfiguration>>) {
  // Pool construction is lazy; nothing connects during import/config rendering.
  // No Vercel filesystem or browser persistence is used for leads.
  const pool = new Pool({ host: config.database.host, port: config.database.port, database: config.database.name, user: config.database.user, password: config.database.password, ssl: { rejectUnauthorized: true }, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, query_timeout: 8000, statement_timeout: 8000, idle_in_transaction_session_timeout: 10000, application_name: "vetthevat-leads" });
  pool.on("error", () => {});
  const database: LeadDatabase = { async transaction(work) {
    const client = await pool.connect(); let destroy = false;
    try {
      const check = (await client.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
        NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
        AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relowner=r.oid)
        AND NOT EXISTS(SELECT 1 FROM pg_roles other WHERE other.oid<>r.oid AND pg_has_role(r.oid,other.oid,'MEMBER'))
        AND NOT has_schema_privilege(current_user,'lead_intake','CREATE') AS safe,
        (SELECT version FROM lead_intake.schema_version WHERE singleton) AS version FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
      if (!check || check.database !== config.database.name || check.role !== config.database.user || check.session_role !== config.database.user || check.safe !== true || check.version !== 1) throw new Error("Lead database preflight failed");
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await work({ query: async (sql, values) => { const result = await client.query(sql, values); return { rows: result.rows }; } });
      destroy = true; await client.query("COMMIT"); destroy = false;
      return result;
    } catch (error) { destroy = true; try { await client.query("ROLLBACK"); } catch {} if (error instanceof LeadError) throw error; throw new Error("Lead storage unavailable"); }
    finally { client.release(destroy); }
  } };
  const store = postgresLeadStore(database);
  const deps: PublicLeadDependencies = { origin: config.origin, secret: config.secret, receiptSecret: config.receiptSecret, store, verifyBot: turnstileVerifier(config.turnstileSecret, new URL(config.origin).hostname), networkKey(request) {
    // Only trust the header set/overwritten by Vercel on Vercel deployments.
    // Other hosts share a conservative anonymous bucket until proxy trust is reviewed.
    const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
    return address && isIP(address) ? address : "unidentified-network";
  } };
  return { deps, store, mailer: config.email ? smtpLeadMailer(config.email) : undefined };
}
export function leadServices() {
  const config = readLeadConfiguration(process.env);
  if (!config) return undefined;
  services ??= createServices(config);
  return services;
}
