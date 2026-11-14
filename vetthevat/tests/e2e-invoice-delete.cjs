// Live check of invoice deletion on the running server + real database, using
// the fixed synthetic account e2e-smoke@example.test (disabled afterwards).
//   node tests/e2e-invoice-delete.cjs [origin]
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const { Client } = require(path.join(root, "node_modules", "pg"));
const origin = process.argv[2] || "http://localhost:3000";
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter(l => /^[A-Z_0-9]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
let failed = 0; const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect();
  const email = "e2e-smoke@example.test";
  await db.query("UPDATE web_auth.users SET status='active' WHERE email=$1", [email]);
  try {
    const call = async (route, { method = "GET", body, session, headers = {}, version } = {}) => {
      const h = { ...headers, ...(session ? { cookie: session.cookie } : {}) };
      if (method !== "GET") Object.assign(h, { origin, "sec-fetch-site": "same-origin", ...(session ? { "x-csrf-token": session.csrf, "idempotency-key": crypto.randomUUID() } : {}), ...(version ? { "if-match": `"${version}"` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) });
      const r = await fetch(origin + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text(); let json; try { json = JSON.parse(text); } catch {}
      return { status: r.status, body: json, text, headers: r.headers };
    };
    const login = await call("/api/auth/session", { method: "POST", body: { email, password: "Synthetic-E2E-Pass-2026!" } });
    check("sign in", login.status === 200, String(login.status)); if (login.status !== 200) return;
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const session = { cookie, csrf: (await call("/api/auth/session", { session: { cookie } })).body.csrfToken };
    const co = { "x-company-id": (await call("/api/account/companies", { session })).body.companies[0].id };
    const supplier = (await call("/api/business/contacts?kind=supplier&limit=1", { session, headers: co })).body.data.items[0];
    const create = async (n) => (await call("/api/business/invoices", { method: "POST", session, headers: co, version: 1, body: { direction: "purchase", kind: "invoice", contactId: supplier.id, number: `DEL-${n}-${Date.now().toString(36)}`, issuedOn: "2026-11-01", dueOn: null, currency: "GBP", rounding: "line-half-up", lines: [{ description: "Delete test item", quantity: "1", unitPrice: "10", discount: "0", rate: "20", treatment: "standard", pricing: "exclusive" }], notes: "", creditForId: null } })).body.data;
    const listed = async (id) => (await call("/api/business/payable-invoices", { session, headers: co })).body.data.items.some(i => i.id === id);

    // 1. Draft: plain delete.
    const draft = await create("D");
    const delDraft = await call(`/api/business/invoices/${draft.id}`, { method: "DELETE", session, headers: co, version: draft.version });
    check("draft invoice deleted", delDraft.status === 200, `${delDraft.status} ${delDraft.text.slice(0, 120)}`);
    check("deleted draft gone from lists", !(await listed(draft.id)));

    // 2. Confirmed: needs a reason.
    const inv = await create("C");
    const confirmed = await call(`/api/business/invoices/${inv.id}/confirm`, { method: "POST", session, headers: co, version: inv.version, body: {} });
    check("invoice confirmed", confirmed.status === 200, `${confirmed.status} ${confirmed.text.slice(0, 120)}`);
    const version = confirmed.body?.data?.version ?? inv.version + 1;
    check("confirmed invoice listed", await listed(inv.id));
    const unconfirmedFlag = await call(`/api/business/invoices/${inv.id}`, { method: "DELETE", session, headers: co, version, body: { confirmed: false } });
    check("confirmed invoice NOT deleted without explicit confirmation", unconfirmedFlag.status === 403 && await listed(inv.id), `${unconfirmedFlag.status} ${unconfirmedFlag.body?.error?.message ?? ""}`);
    const erase = await call(`/api/business/invoices/${inv.id}`, { method: "DELETE", session, headers: co, version, body: { confirmed: true } });
    check("confirmed invoice deleted", erase.status === 200, `${erase.status} ${erase.text.slice(0, 160)}`);
    check("deleted invoice gone from lists", !(await listed(inv.id)));
    const left = (await db.query("SELECT (SELECT count(*) FROM business.invoices WHERE id=$1)+(SELECT count(*) FROM business.invoice_lines WHERE invoice_id=$1)+(SELECT count(*) FROM business.invoice_revisions WHERE invoice_id=$1) AS n", [inv.id])).rows[0].n;
    check("invoice, lines and history erased from the database", left === "0", `rows left ${left}`);
    const draftLeft = (await db.query("SELECT count(*) AS n FROM business.invoices WHERE id=$1", [draft.id])).rows[0].n;
    check("deleted draft erased from the database", draftLeft === "0", `rows left ${draftLeft}`);

    // 2b. A deleted invoice can be saved again with the same number; a live duplicate is still refused.
    const number = `REDO-${Date.now().toString(36)}`;
    const body = n => ({ direction: "purchase", kind: "invoice", contactId: supplier.id, number: n, issuedOn: "2026-11-01", dueOn: null, currency: "GBP", rounding: "line-half-up", lines: [{ description: "Re-save test item", quantity: "1", unitPrice: "5", discount: "0", rate: "0", treatment: "zero", pricing: "exclusive" }], notes: "", creditForId: null });
    const first = (await call("/api/business/invoices", { method: "POST", session, headers: co, version: 1, body: body(number) })).body.data;
    const dup = await call("/api/business/invoices", { method: "POST", session, headers: co, version: 1, body: body(number) });
    check("live duplicate invoice number still refused", dup.status === 409, `${dup.status} ${dup.body?.error?.message ?? ""}`);
    await call(`/api/business/invoices/${first.id}`, { method: "DELETE", session, headers: co, version: first.version });
    const again = await call("/api/business/invoices", { method: "POST", session, headers: co, version: 1, body: body(number) });
    check("same invoice number can be saved again after delete", again.status === 200, `${again.status} ${again.body?.error?.message ?? ""}`);
    if (again.body?.data) await call(`/api/business/invoices/${again.body.data.id}`, { method: "DELETE", session, headers: co, version: again.body.data.version });

    // 3. Database still refuses any other change to a confirmed invoice.
    const other = await create("X");
    const conf2 = await call(`/api/business/invoices/${other.id}/confirm`, { method: "POST", session, headers: co, version: other.version, body: {} });
    let refused = false;
    try { await db.query("BEGIN"); await db.query("UPDATE business.invoices SET gross=999, version=version+1 WHERE id=$1", [other.id]); } catch { refused = true; } finally { await db.query("ROLLBACK"); }
    check("database refuses changing amounts on a confirmed invoice", refused && conf2.status === 200);
    await call(`/api/business/invoices/${other.id}`, { method: "DELETE", session, headers: co, version: conf2.body?.data?.version ?? other.version + 1, body: { confirmed: true } });
  } finally {
    await db.query("UPDATE web_auth.sessions s SET revoked_at=now() FROM web_auth.users u WHERE u.id=s.user_id AND u.email=$1 AND s.revoked_at IS NULL", [email]);
    await db.query("UPDATE web_auth.users SET status='disabled' WHERE email=$1", [email]);
    await db.end();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll invoice delete checks passed");
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
