// Live check of ORS order history (orders sent to suppliers by WhatsApp/email)
// on the running server + real database, using the synthetic account
// e2e-smoke@example.test (disabled again afterwards).
//   node tests/e2e-supplier-orders.cjs [origin]
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
  let companyId;
  try {
    const call = async (route, { method = "GET", body, session, headers = {}, key } = {}) => {
      const h = { ...headers, ...(session ? { cookie: session.cookie } : {}) };
      if (method !== "GET") Object.assign(h, { origin, "sec-fetch-site": "same-origin", ...(session ? { "x-csrf-token": session.csrf, "idempotency-key": key ?? crypto.randomUUID() } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) });
      const r = await fetch(origin + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text(); let json; try { json = JSON.parse(text); } catch {}
      return { status: r.status, body: json, text, headers: r.headers };
    };
    const login = await call("/api/auth/session", { method: "POST", body: { email, password: "Synthetic-E2E-Pass-2026!" } });
    check("sign in", login.status === 200, String(login.status)); if (login.status !== 200) return;
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const session = { cookie, csrf: (await call("/api/auth/session", { session: { cookie } })).body.csrfToken };
    companyId = (await call("/api/account/companies", { session })).body.companies[0].id;
    const co = { "x-company-id": companyId };
    const order = { supplierId: null, supplierName: "E2E Fresh Foods Ltd", channel: "whatsapp", currency: "GBP", lines: [{ name: "Tomatoes 5kg", quantity: 2, unitPrice: 11 }, { name: "Onions 10kg", quantity: 1, unitPrice: 7.5 }], total: 1 };

    const key = crypto.randomUUID();
    const first = await call("/api/business/supplier-orders", { method: "POST", session, headers: co, body: order, key });
    check("order saved", first.status === 200 && /^PO-\d{4}$/.test(first.body?.data?.number ?? ""), `${first.status} ${first.text.slice(0, 160)}`);
    check("total is recomputed by the server (not trusted from browser)", first.body?.data?.total === 29.5, String(first.body?.data?.total));
    check("new order starts as Sent", first.body?.data?.status === "sent");
    const retry = await call("/api/business/supplier-orders", { method: "POST", session, headers: co, body: order, key });
    check("retry with same key does not create a duplicate", retry.body?.data?.id === first.body?.data?.id);
    const second = await call("/api/business/supplier-orders", { method: "POST", session, headers: co, body: { ...order, channel: "email" } });
    const n = s => Number(s.slice(3));
    check("order numbers count up", second.status === 200 && n(second.body.data.number) === n(first.body.data.number) + 1, `${first.body?.data?.number} -> ${second.body?.data?.number}`);

    const list = await call("/api/business/supplier-orders", { session, headers: co });
    check("order history lists saved orders newest first", list.status === 200 && list.body.data.items[0].id === second.body.data.id && list.body.data.items.some(o => o.id === first.body.data.id));
    check("history keeps the items", JSON.stringify(list.body.data.items.find(o => o.id === first.body.data.id)?.lines) === JSON.stringify(order.lines));

    const delivered = await call(`/api/business/supplier-orders/${first.body.data.id}`, { method: "PATCH", session, headers: co, body: { status: "delivered" } });
    check("order marked delivered", delivered.status === 200 && delivered.body.data.status === "delivered", `${delivered.status} ${delivered.text.slice(0, 120)}`);
    const cancelled = await call(`/api/business/supplier-orders/${second.body.data.id}`, { method: "PATCH", session, headers: co, body: { status: "cancelled" } });
    check("order cancelled", cancelled.body?.data?.status === "cancelled");

    const bad = [
      [{ ...order, lines: [] }, "empty order"], [{ ...order, lines: [{ name: "X", quantity: 0, unitPrice: 1 }] }, "zero quantity"],
      [{ ...order, lines: [{ name: "X", quantity: 1.5, unitPrice: 1 }] }, "fractional quantity"], [{ ...order, channel: "sms" }, "unknown channel"],
      [{ ...order, supplierName: "" }, "no supplier"], [{ ...order, supplierId: "not-a-uuid" }, "bad supplier id"],
    ];
    for (const [body, label] of bad) { const r = await call("/api/business/supplier-orders", { method: "POST", session, headers: co, body }); check(`refused: ${label}`, r.status === 400, `${r.status} ${r.body?.error?.message ?? ""}`); }
    const badStatus = await call(`/api/business/supplier-orders/${first.body.data.id}`, { method: "PATCH", session, headers: co, body: { status: "paid" } });
    check("refused: unknown status", badStatus.status === 400);
    const unknown = await call(`/api/business/supplier-orders/${crypto.randomUUID()}`, { method: "PATCH", session, headers: co, body: { status: "sent" } });
    check("unknown order is 404", unknown.status === 404, String(unknown.status));
    const noCsrf = await call("/api/business/supplier-orders", { method: "POST", session: { cookie, csrf: "wrong" }, headers: co, body: order });
    check("refused without valid CSRF token", noCsrf.status === 403, String(noCsrf.status));
    const otherCompany = await call("/api/business/supplier-orders", { session, headers: { "x-company-id": crypto.randomUUID() } });
    check("another company's orders are not readable", otherCompany.status === 403 || (otherCompany.status === 200 && otherCompany.body.data.items.length === 0), String(otherCompany.status));
    const anon = await call("/api/business/supplier-orders", { headers: co });
    check("signed-out request refused", anon.status === 401, String(anon.status));

    // Business mobile number (shown to suppliers on orders) and supplier WhatsApp number.
    const putPhone = (phone, h = co) => call("/api/business/company-contact", { method: "PUT", session, headers: h, body: { phone } });
    const okPhone = await putPhone("07306 361031");
    check("company mobile saved and normalised to +44", okPhone.status === 200 && okPhone.body?.data?.phone === "+447306361031", `${okPhone.status} ${okPhone.text.slice(0, 100)}`);
    const readPhone = await call("/api/business/company-contact", { session, headers: co });
    check("company mobile can be read back", readPhone.body?.data?.phone === "+447306361031");
    check("company mobile with letters refused", (await putPhone("call me")).status === 400);
    check("too-short company mobile refused", (await putPhone("123")).status === 400);
    check("company mobile of another company refused", [403, 404].includes((await putPhone("07306 361031", { "x-company-id": crypto.randomUUID() })).status));
  } finally {
    if (companyId) await db.query("DELETE FROM business.supplier_orders WHERE company_id=$1 AND supplier_name='E2E Fresh Foods Ltd'", [companyId]).catch(e => console.log("cleanup skipped:", e.message));
    await db.query("UPDATE web_auth.sessions s SET revoked_at=now() FROM web_auth.users u WHERE u.id=s.user_id AND u.email=$1 AND s.revoked_at IS NULL", [email]);
    await db.query("UPDATE web_auth.users SET status='disabled' WHERE email=$1", [email]);
    await db.end();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll order history checks passed");
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
