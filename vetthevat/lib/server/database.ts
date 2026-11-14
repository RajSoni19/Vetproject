import "server-only";
import { readFileSync } from "node:fs";
import { Pool, types } from "pg";
import { getBackendConfig } from "@/lib/server/config";
import { createDatabase } from "@/lib/server/database-core";

// Lazy: importing this module never connects or reads credentials. No application
// route calls this factory yet. Each Node process has a single bounded pool.
let database: ReturnType<typeof createDatabase> | undefined;
export function getDatabase() {
  if (database) return database;
  const { database: config } = getBackendConfig();
  const pool = new Pool({
    host: config.host, port: config.port, database: config.name,
    user: config.user, password: config.password,
    max: config.poolMax, connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs, query_timeout: config.queryTimeoutMs,
    statement_timeout: config.queryTimeoutMs,
    idle_in_transaction_session_timeout: config.idleTransactionTimeoutMs,
    application_name: "vetthevat-runtime",
    ssl: config.tls === "disable" ? false : {
      rejectUnauthorized: true,
      ...(config.caFile ? { ca: readFileSync(config.caFile, "utf8") } : {})
    },
    types: { getTypeParser(oid, format) {
      if ([1700,20,1231,1016].includes(oid)) return (value: string) => value;
      return types.getTypeParser(oid, format);
    } }
  });
  // Idle socket errors are consumed without logging database details/credentials.
  // A subsequent checkout fails with the redacted UNAVAILABLE error.
  pool.on("error", () => {});
  database = createDatabase(pool, config);
  return database;
}
