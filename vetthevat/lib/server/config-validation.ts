// Pure validation only: this module never reads process.env or opens connections.
// Runtime environment access belongs exclusively in config.ts (server-only).
export type BackendEnvironment = "development" | "test" | "production";
export type BackendConfig = {
  environment: BackendEnvironment;
  database: { host: string; port: number; name: string; user: string; password: string; tls: "disable" | "verify-full"; caFile?: string; poolMax: number; connectionTimeoutMs: number; queryTimeoutMs: number; idleTimeoutMs: number; idleTransactionTimeoutMs: number };
  storage: { bucket: string; region: string };
};
export class BackendConfigurationError extends Error {
  readonly code = "BACKEND_CONFIGURATION_INVALID";
  constructor(message: string) { super(message); this.name = "BackendConfigurationError"; }
}
export function validateBackendConfig(env: Readonly<Record<string,string|undefined>>): BackendConfig {
  const fail = (message: string): never => { throw new BackendConfigurationError(message); };
  const required = (key: string) => { const value = env[key]; if (!value?.trim() || /[<>]|CHANGE_ME|REPLACE_ME/i.test(value)) return fail(`Configure ${key} privately before enabling backend services.`); return value; };
  const integer = (key: string, fallback: number, min: number, max: number) => { const value = env[key] ?? String(fallback); if (!/^\d+$/.test(value) || Number(value)<min || Number(value)>max) return fail(`Invalid ${key} bounds.`); return Number(value); };
  const secrets = [env.PG_RUNTIME_PASSWORD].filter(Boolean);
  for (const [key,value] of Object.entries(env)) if (key.startsWith("NEXT_PUBLIC_") && value && (/DATABASE|POSTGRES|PG_|PRIVATE_KEY|SERVICE_ACCOUNT|PASSWORD|SECRET|CREDENTIAL/i.test(key) || secrets.includes(value))) fail("Public environment variables must not contain backend credentials.");
  const environment = required("VETTHEVAT_ENV");
  if (!["development","test","production"].includes(environment)) fail("Invalid VETTHEVAT_ENV.");
  const host = required("PG_RUNTIME_HOST"), name = required("PG_RUNTIME_DATABASE"), user = required("PG_RUNTIME_USER");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user) || /postgres|superuser|owner|migrat/i.test(user)) fail("A restricted runtime role is required; administrative roles are forbidden.");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) fail("Invalid PG_RUNTIME_DATABASE.");
  if (environment !== "production") {
    if (!["127.0.0.1","::1"].includes(host)) fail("Development and test databases must use an explicit loopback address.");
    if (name !== (environment === "test" ? "vetthevat_test" : "vetthevat_dev")) fail("Database does not match the selected environment.");
  } else {
    if (env.NODE_ENV !== "production" || ["vetthevat_dev","vetthevat_test"].includes(name) || name !== required("PG_PRODUCTION_DATABASE_APPROVED")) fail("Production target is not explicitly approved.");
    if (!/^[a-zA-Z0-9.-]+$/.test(host) || ["127.0.0.1","localhost"].includes(host)) fail("Production requires an explicitly approved database host.");
  }
  const tls = required("PG_RUNTIME_TLS");
  if (!["disable","verify-full"].includes(tls) || environment === "production" && tls !== "verify-full") fail("Invalid database TLS policy.");
  return {
    environment: environment as BackendEnvironment,
    database: {host, name, user, password: required("PG_RUNTIME_PASSWORD"), port: integer("PG_RUNTIME_PORT",5432,1,65535), tls: tls as "disable"|"verify-full", caFile: env.PG_RUNTIME_CA_FILE || undefined, poolMax: integer("PG_POOL_MAX",5,1,20), connectionTimeoutMs: integer("PG_CONNECT_TIMEOUT_MS",5000,100,30000), queryTimeoutMs: integer("PG_QUERY_TIMEOUT_MS",15000,100,60000), idleTimeoutMs: integer("PG_IDLE_TIMEOUT_MS",30000,1000,120000), idleTransactionTimeoutMs: integer("PG_IDLE_TRANSACTION_TIMEOUT_MS",15000,1000,60000)},
    storage: {bucket:required("PRIVATE_STORAGE_BUCKET"),region:required("PRIVATE_STORAGE_REGION")}
  };
}
