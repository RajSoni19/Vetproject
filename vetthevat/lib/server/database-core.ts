import type { BackendConfig } from "@/lib/server/config-validation";

// Dependency-injected transport. Only database.ts may supply the real driver.
export type SqlResult = { rows: Record<string, unknown>[]; rowCount: number | null };
export type SqlClient = { query(text: string, values?: unknown[]): Promise<SqlResult>; release(destroy?: boolean): void; on?(event: "error", handler: () => void): unknown; removeListener?(event: "error", handler: () => void): unknown };
export type SqlPool = { connect(): Promise<SqlClient>; end(): Promise<void> };
export class DatabaseError extends Error {
  readonly code: "UNAVAILABLE" | "UNSAFE_ROLE" | "CONFLICT" | "TIMEOUT" | "QUERY_FAILED" | "TRANSACTION_CLOSED" | "TRANSACTION_USAGE";
  constructor(code: DatabaseError["code"]) {
    super(`Database operation failed (${code}).`); this.name = "DatabaseError"; this.code = code;
  }
}
export function databaseError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return new DatabaseError(["23505","40001","40P01"].includes(code) ? "CONFLICT" : code === "57014" || (error instanceof Error && /timeout/i.test(error.message)) ? "TIMEOUT" : "QUERY_FAILED");
}
export function decimalString(value: unknown, scale = 2): string {
  // No parseFloat/Number conversion: NUMERIC and BIGINT remain exact strings.
  if (!Number.isInteger(scale) || scale < 0 || scale > 8 || typeof value !== "string" || value.length > 40 || !new RegExp(`^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,${Math.max(1,scale)}})?$`).test(value) || (scale === 0 && value.includes("."))) throw new DatabaseError("QUERY_FAILED");
  return value;
}
export const runtimePreflightSql = `
SELECT current_database() AS database, current_user AS role, session_user AS session_role,
 inet_server_addr()::text AS address, inet_server_port() AS port,
 r.rolcanlogin AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
 AND NOT has_database_privilege(current_user,current_database(),'CREATE')
 AND NOT has_database_privilege(current_user,current_database(),'TEMP')
 AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND has_schema_privilege(current_user,n.oid,'CREATE'))
 AND NOT EXISTS (SELECT 1 FROM pg_roles p WHERE p.oid <> r.oid AND pg_has_role(current_user,p.oid,'MEMBER'))
 AND NOT EXISTS (SELECT 1 FROM pg_database d WHERE d.datdba = r.oid)
 AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid)
 AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid)
 AND NOT EXISTS (SELECT 1 FROM pg_database d WHERE d.datname IN ('vetthevat_dev','vetthevat_test') AND d.datname<>current_database() AND has_database_privilege(current_user,d.oid,'CONNECT'))
 AS safe FROM pg_roles r WHERE r.rolname = current_user`;

export type Transaction = { query(text: string, values?: unknown[]): Promise<SqlResult> };
export function createDatabase(pool: SqlPool, target: BackendConfig["database"]) {
  return {
    async transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
      let client: SqlClient;
      try { client = await pool.connect(); } catch { throw new DatabaseError("UNAVAILABLE"); }
      let begun = false, destroy = false, closed = false, busy = false, misuse = false;
      const socketError = () => { destroy = true; closed = true; };
      client.on?.("error", socketError);
      let pending: Promise<SqlResult> | undefined;
      let queryFailure: DatabaseError | undefined;
      try {
        const check = (await client.query(runtimePreflightSql)).rows[0];
        if (!check || check.database !== target.name || check.role !== target.user || check.session_role !== target.user || check.port !== target.port || (["127.0.0.1","::1"].includes(target.host) && check.address !== target.host) || check.safe !== true) throw new DatabaseError("UNSAFE_ROLE");
        await client.query("BEGIN"); begun = true;
        const transaction: Transaction = {
          query(text, values) {
            if (closed) return Promise.reject(new DatabaseError("TRANSACTION_CLOSED"));
            // Only trusted server DAL code supplies SQL, never request text. This
            // low-level primitive is not a sandbox for arbitrary SQL/callbacks.
            if (busy) { misuse = true; return Promise.reject(new DatabaseError("TRANSACTION_USAGE")); }
            busy = true;
            pending = client.query(text, values).catch(error => {
              queryFailure = databaseError(error); throw queryFailure;
            }).finally(() => { busy = false; });
            // Keep abandoned callback promises from becoming unhandled rejections;
            // callers still receive the original rejected promise and rollback.
            void pending.catch(() => {});
            return pending;
          }
        };
        const result = await work(transaction);
        if (closed) throw new DatabaseError("UNAVAILABLE");
        closed = true;
        if (busy || misuse) { if (pending) await pending; throw new DatabaseError("TRANSACTION_USAGE"); }
        // PostgreSQL may answer COMMIT with ROLLBACK after an aborted query.
        // A callback cannot suppress a query failure and publish false success.
        if (queryFailure) throw queryFailure;
        // A COMMIT transport failure has an unknown outcome: never retry automatically.
        destroy = true;
        await client.query("COMMIT"); begun = false; destroy = false;
        return result;
      } catch (error) {
        closed = true;
        if (busy && pending) { try { await pending; } catch { destroy = true; } }
        const safeError = databaseError(error);
        if (safeError.code === "TIMEOUT" || safeError.code === "UNSAFE_ROLE") destroy = true;
        if (begun) { try { await client.query("ROLLBACK"); } catch { destroy = true; } }
        throw safeError;
      } finally { closed = true; client.removeListener?.("error",socketError); client.release(destroy); }
    },
    close: () => pool.end()
  };
}
