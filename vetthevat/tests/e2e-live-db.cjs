// End-to-end smoke test against a RUNNING server and its configured database.
// Creates one clearly synthetic account (e2e-*@example.test), exercises the
// main flows over real HTTP, then deletes everything it created.
//   node tests/e2e-live-db.cjs [origin]      default http://127.0.0.1:3197
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const origin = process.argv[2] || "http://127.0.0.1:3197";
const root = path.resolve(__dirname, "..");
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const results = []; let failed = 0;
const check = (name, ok, detail = "") => { results.push({ name, ok }); if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  — " + detail : ""}`); };
const timings = [];

async function request(route, { method = "GET", body, session, headers = {} } = {}) {
  const started = Date.now();
  const response = await fetch(origin + route, {
    method, redirect: "manual",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(method === "GET" ? {} : { origin, "sec-fetch-site": "same-origin" }),
      ...(session ? { cookie: session.cookie, ...(method === "GET" ? {} : { "x-csrf-token": session.csrf }) } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text(); let json; try { json = JSON.parse(text); } catch {}
  timings.push({ route: `${method} ${route.split("?")[0]}`, ms: Date.now() - started, status: response.status });
  return { status: response.status, body: json, text, headers: response.headers };
}
const describe = r => `${r.status} ${JSON.stringify(r.body?.error ?? r.body ?? r.text.slice(0, 160)).slice(0, 240)}`;

async function main() {
  // One fixed synthetic account, reused every run: company records are protected
  // against deletion, so a new account per run would leave data behind.
  const email = "e2e-smoke@example.test", password = "Synthetic-E2E-Pass-2026!";
  const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect();
  let userId;
  try {
    let user = (await db.query("SELECT id, email_verified_at FROM web_auth.users WHERE email=$1", [email])).rows[0];
    if (!user) {
      const reg = await request("/api/auth/register", { method: "POST", body: { fullName: "E2E Synthetic User", email, password } });
      check("register account (real DB)", [200, 201, 202].includes(reg.status), describe(reg));
      user = (await db.query("SELECT id, email_verified_at FROM web_auth.users WHERE email=$1", [email])).rows[0];
    } else await db.query("UPDATE web_auth.users SET status='active' WHERE id=$1", [user.id]);
    check("user row written to web_auth.users", Boolean(user));
    if (!user) return;
    userId = user.id;
    // Email delivery is not configured for this test; verify the synthetic address directly.
    if (!user.email_verified_at) await db.query("UPDATE web_auth.users SET email_verified_at=now() WHERE id=$1", [userId]);

    const login = await request("/api/auth/session", { method: "POST", body: { email, password } });
    check("sign in", login.status === 200, describe(login));
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const sessionInfo = await request("/api/auth/session", { session: { cookie } });
    check("session readable", sessionInfo.status === 200 && Boolean(sessionInfo.body?.csrfToken), describe(sessionInfo));
    const session = { cookie, csrf: sessionInfo.body?.csrfToken };

    const page = await request("/app/dashboard", { session });
    check("dashboard page renders for signed-in user", page.status === 200, String(page.status));

    // Company onboarding.
    const existingCompanies = await request("/api/account/companies", { session });
    const created = existingCompanies.body?.companies?.length ? { status: 200, body: { company: existingCompanies.body.companies[0] } } : await request("/api/account/companies", { method: "POST", session, headers: { "idempotency-key": crypto.randomUUID() }, body: { name: "E2E Synthetic Kitchen Ltd", currency: "GBP", accountId: null } });
    check("create company", [200, 201].includes(created.status), describe(created));
    const companies = await request("/api/account/companies", { session });
    const companyId = companies.body?.companies?.[0]?.id ?? created.body?.company?.id ?? created.body?.company;
    check("company listed", Boolean(companyId), describe(companies));
    if (!companyId) return;
    await request("/api/account/company-selection", { method: "POST", session, body: { companyId } });
    const co = { "x-company-id": companyId };

    // Business records.
    const supplier = await request("/api/business/contacts", { method: "POST", session, headers: { ...co, "idempotency-key": crypto.randomUUID(), "if-match": "\"1\"" }, body: { kind: "supplier", status: "active", name: "E2E Synthetic Produce Ltd", email: "orders@e2e.example.test", phone: "", vatNumber: "", address: "" } });
    check("create supplier", [200, 201].includes(supplier.status), describe(supplier));
    const contacts = await request("/api/business/contacts?kind=supplier", { session, headers: co });
    check("list suppliers from DB", contacts.status === 200, describe(contacts));
    const invoices = await request("/api/business/invoices", { session, headers: co });
    check("list invoices from DB", invoices.status === 200, describe(invoices));
    const dashboard = await request("/api/business/dashboard", { session, headers: co });
    check("business dashboard data", dashboard.status === 200, describe(dashboard));

    // ORS.
    for (const route of ["/api/ors/catalogue", "/api/ors/purchase-orders", "/api/ors/inventory", "/api/ors/shopping/catalogue", "/api/ors/shopping/cart", "/api/ors/supplier-invoices"]) {
      const r = await request(route, { session, headers: co });
      check(`ORS ${route.replace("/api/ors/", "")}`, r.status === 200, describe(r));
    }
    const foreign = await request("/api/business/invoices", { session, headers: { "x-company-id": crypto.randomUUID() } });
    check("another company's data is refused", [403, 404].includes(foreign.status), String(foreign.status));
  } finally {
    if (userId) {
      // Leave the synthetic account switched off between runs.
      await db.query("UPDATE web_auth.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
      await db.query("UPDATE web_auth.users SET status='disabled' WHERE id=$1", [userId]);
      console.log("cleanup: synthetic account disabled, sessions revoked");
    }
    await db.end();
  }
}

main().then(() => {
  const slow = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 6).map(t => `${t.route} ${t.ms}ms`).join(", ");
  console.log(`\n${results.length - failed}/${results.length} passed. Slowest: ${slow}`);
  if (failed) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
