import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Sql, Transaction, UserRecord } from "@/lib/server/web-auth/store";
import type { WebAuthConfig } from "@/lib/server/web-auth/config";

interface StoredData {
  users: Array<{
    id: string;
    full_name: string;
    email: string;
    password_hash: string;
    email_verified_at: string | null;
    status: string;
    preferred_locale?: string;
  }>;
  sessions: Array<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
    revoked_at: string | null;
    last_seen_at: string;
  }>;
  companies: Array<{
    id: string;
    name: string;
    owner_id: string;
  }>;
  memberships: Array<{
    user_id: string;
    company_id: string;
    role: string;
    status: string;
  }>;
}

const STORE_PATH = path.join(process.cwd(), ".dev-auth.json");

function loadData(): StoredData {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    }
  } catch {}
  return {
    users: [],
    sessions: [],
    companies: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "VET THE VAT Demo Company",
        owner_id: "00000000-0000-4000-8000-000000000001",
      },
    ],
    memberships: [],
  };
}

function saveData(data: StoredData) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch {}
}

export function createDevTransaction(config: WebAuthConfig): Transaction {
  return async <T>(operation: (sql: Sql) => Promise<T>): Promise<T> => {
    const data = loadData();

    const sql: Sql = {
      async query(text: string, values: unknown[] = []): Promise<any> {
        const q = text.trim();

        // Installation / schema verification check
        if (q.includes("current_database()") || q.includes("web_auth.installation")) {
          return {
            rows: [
              {
                db: config.database.name,
                role: "vtv_web_runtime",
                session_role: "vtv_web_runtime",
                installation: config.installationId,
                tls: false,
                safe: true,
              },
            ],
            rowCount: 1,
            command: "SELECT",
          };
        }

        // Transactions
        if (q === "BEGIN ISOLATION LEVEL READ COMMITTED" || q === "COMMIT" || q === "ROLLBACK") {
          return { rows: [], rowCount: 0, command: q.split(" ")[0] };
        }

        // Rate limiting and locking
        if (q.includes("pg_advisory_xact_lock")) {
          return { rows: [{ pg_advisory_xact_lock: 1 }], rowCount: 1, command: "SELECT" };
        }
        if (q.includes("web_auth.rate_limits")) {
          if (q.startsWith("SELECT")) {
            return { rows: [{ count: 0, retry: 0 }], rowCount: 1, command: "SELECT" };
          }
          return { rows: [], rowCount: 0, command: "OK" };
        }

        // Insert new user (registration)
        if (q.includes("INSERT INTO web_auth.users")) {
          const fullName = String(values[0] ?? "");
          const email = String(values[1] ?? "").toLowerCase().trim();
          const passwordHash = String(values[2] ?? "");

          let existing = data.users.find((u) => u.email === email);
          if (existing) {
            return { rows: [], rowCount: 0, command: "INSERT" };
          }

          const newUser = {
            id: randomUUID(),
            full_name: fullName,
            email,
            password_hash: passwordHash,
            email_verified_at: new Date().toISOString(),
            status: "active",
          };
          data.users.push(newUser);

          // Add default membership to company
          data.memberships.push({
            user_id: newUser.id,
            company_id: "00000000-0000-4000-8000-000000000001",
            role: "Owner",
            status: "active",
          });

          saveData(data);
          return {
            rows: [{ id: newUser.id, email: newUser.email, full_name: newUser.full_name }],
            rowCount: 1,
            command: "INSERT",
          };
        }

        // Find user by email
        if (q.includes("FROM web_auth.users WHERE email=$1")) {
          const email = String(values[0] ?? "").toLowerCase().trim();
          const user = data.users.find((u) => u.email === email);
          if (user) {
            return {
              rows: [
                {
                  id: user.id,
                  full_name: user.full_name,
                  email: user.email,
                  password_hash: user.password_hash,
                  email_verified_at: user.email_verified_at ? new Date(user.email_verified_at) : new Date(),
                  status: user.status,
                },
              ],
              rowCount: 1,
              command: "SELECT",
            };
          }
          return { rows: [], rowCount: 0, command: "SELECT" };
        }

        // Find user by ID
        if (q.includes("FROM web_auth.users WHERE id=$1")) {
          const id = String(values[0] ?? "");
          const user = data.users.find((u) => u.id === id);
          if (user) {
            return {
              rows: [
                {
                  id: user.id,
                  full_name: user.full_name,
                  email: user.email,
                  password_hash: user.password_hash,
                  email_verified_at: user.email_verified_at ? new Date(user.email_verified_at) : new Date(),
                  status: user.status,
                  preferred_locale: user.preferred_locale ?? "en",
                },
              ],
              rowCount: 1,
              command: "SELECT",
            };
          }
          return { rows: [], rowCount: 0, command: "SELECT" };
        }

        // Update user email verified
        if (q.includes("UPDATE web_auth.users SET email_verified_at")) {
          const id = String(values[0] ?? "");
          const user = data.users.find((u) => u.id === id);
          if (user) {
            user.email_verified_at = new Date().toISOString();
            saveData(data);
          }
          return { rows: [], rowCount: 1, command: "UPDATE" };
        }

        // Create Session
        if (q.includes("INSERT INTO web_auth.sessions")) {
          const userId = String(values[0] ?? "");
          const tokenHash = String(values[1] ?? "");
          const expiresAt = new Date(Date.now() + 5 * 24 * 3600 * 1000);
          const session = {
            id: randomUUID(),
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
            revoked_at: null,
            last_seen_at: new Date().toISOString(),
          };
          data.sessions.push(session);
          saveData(data);
          return {
            rows: [{ id: session.id, expires_at: session.expires_at }],
            rowCount: 1,
            command: "INSERT",
          };
        }

        // Find Session / Principal
        if (q.includes("FROM web_auth.sessions s JOIN web_auth.users u")) {
          const tokenHash = String(values[0] ?? "");
          const session = data.sessions.find(
            (s) => s.token_hash === tokenHash && !s.revoked_at && new Date(s.expires_at) > new Date()
          );
          if (session) {
            const user = data.users.find((u) => u.id === session.user_id);
            if (user) {
              return {
                rows: [
                  {
                    id: session.id,
                    user_id: user.id,
                    expires_at: session.expires_at,
                    full_name: user.full_name,
                    roles: ["software_administrator", "Owner", "Admin"],
                  },
                ],
                rowCount: 1,
                command: "SELECT",
              };
            }
          }
          return { rows: [], rowCount: 0, command: "SELECT" };
        }

        // Revoke session
        if (q.includes("UPDATE web_auth.sessions SET revoked_at")) {
          const sessionId = String(values[0] ?? "");
          const session = data.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.revoked_at = new Date().toISOString();
            saveData(data);
            return { rows: [{ id: session.id }], rowCount: 1, command: "UPDATE" };
          }
          return { rows: [], rowCount: 0, command: "UPDATE" };
        }

        // List sessions
        if (q.includes("FROM web_auth.sessions WHERE user_id=$1")) {
          const userId = String(values[0] ?? "");
          const sessions = data.sessions
            .filter((s) => s.user_id === userId && !s.revoked_at && new Date(s.expires_at) > new Date())
            .map((s) => ({
              id: s.id,
              created_at: s.last_seen_at,
              last_seen_at: s.last_seen_at,
              expires_at: s.expires_at,
            }));
          return { rows: sessions, rowCount: sessions.length, command: "SELECT" };
        }

        // Companies and Memberships
        if (q.includes("FROM web_auth.companies c JOIN web_auth.company_memberships m")) {
          return {
            rows: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                name: "VET THE VAT Demo Company",
                role: "Owner",
              },
            ],
            rowCount: 1,
            command: "SELECT",
          };
        }

        if (q.includes("FROM web_auth.company_memberships WHERE user_id=$1")) {
          return { rows: [{ role: "Owner" }], rowCount: 1, command: "SELECT" };
        }

        if (q.includes("INSERT INTO web_auth.companies")) {
          const name = String(values[0] ?? "New Company");
          const company = {
            id: randomUUID(),
            name,
            owner_id: String(values[1] ?? ""),
          };
          data.companies.push(company);
          saveData(data);
          return { rows: [{ id: company.id, name: company.name }], rowCount: 1, command: "INSERT" };
        }

        // Audit logs, notifications, outbox
        if (q.includes("INSERT INTO web_auth.audit_logs") || q.includes("INSERT INTO web_auth.notification_outbox")) {
          return { rows: [{ id: randomUUID() }], rowCount: 1, command: "INSERT" };
        }

        return { rows: [], rowCount: 0, command: "OK" };
      },
    };

    return operation(sql);
  };
}
