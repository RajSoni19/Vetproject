// Live check of /api/business/price-comparison with the fixed synthetic
// account e2e-smoke@example.test (re-disabled afterwards).
//   node tests/e2e-price-comparison.cjs [origin]
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const { Client } = require(path.join(root, "node_modules", "pg"));
const origin = process.argv[2] || "http://127.0.0.1:3197";
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter(l => /^[A-Z_0-9]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
let failed = 0; const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  — " + detail : ""}`); };

(async () => {
  const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect();
  const email = "e2e-smoke@example.test";
  await db.query("UPDATE web_auth.users SET status='active' WHERE email=$1", [email]);
  try {
    const login = await fetch(origin + "/api/auth/session", { method: "POST", headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ email, password: "Synthetic-E2E-Pass-2026!" }) });
    check("sign in", login.status === 200, String(login.status));
    if (login.status !== 200) return;
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const company = (await (await fetch(origin + "/api/account/companies", { headers: { cookie } })).json()).companies[0].id;
    const started = Date.now();
    const response = await fetch(origin + "/api/business/price-comparison?weeks=12", { headers: { cookie, "x-company-id": company } });
    const body = await response.json();
    check("price comparison loads from the database", response.status === 200, `${response.status} in ${Date.now() - started}ms`);
    if (response.status === 200) {
      const d = body.data;
      console.log("  totals", JSON.stringify(d.totals), "window", d.window.from, "→", d.window.to);
      for (const p of d.products.slice(0, 6)) console.log("  -", p.name, "|", p.suppliers.map(s => `${s.supplierName}: ${s.latestPrice}${s.cheapest ? " (cheapest)" : ""}`).join(", "), "| save", p.savingPercent + "%");
      check("products built from saved invoice lines", d.products.length > 0, `${d.products.length} products`);
      check("every product has a cheapest supplier", d.products.every(p => p.suppliers.some(s => s.cheapest)));
    }
    // Bank matching source: purchase invoices with supplier and VAT.
    const payable = await fetch(origin + "/api/business/payable-invoices", { headers: { cookie, "x-company-id": company } });
    const payableBody = await payable.json();
    check("payable invoices for bank matching", payable.status === 200 && payableBody.data.items.length > 0 && payableBody.data.items.every(i => i.supplierName && Number.isFinite(i.vat) && Number.isFinite(i.gross)), `${payable.status} ${payableBody.data?.items?.length ?? 0} invoices`);
    const { matchTransactions, matchSummary } = require("./load-source.cjs").loadSource("lib/bank-matching");
    const sample = payableBody.data?.items?.[0];
    if (sample) {
      const rows = matchTransactions([{ id: "t1", date: sample.issuedOn, description: sample.supplierName.toUpperCase(), amount: sample.gross, direction: "out" }, { id: "t2", date: sample.issuedOn, description: "UNKNOWN SHOP", amount: 1.23, direction: "out" }], payableBody.data.items);
      check("a payment matches its saved invoice and shows its VAT", rows[0].status === "Matched" && rows[0].invoice.id === sample.id && rows[1].status === "No invoice", `${rows[0].status} VAT ${rows[0].invoice?.vat}`);
      console.log("  summary", JSON.stringify(matchSummary(rows)));
    }
    const invalid = await fetch(origin + "/api/business/price-comparison?weeks=999", { headers: { cookie, "x-company-id": company } });
    check("invalid period refused", invalid.status === 400, String(invalid.status));
    const other = await fetch(origin + "/api/business/price-comparison", { headers: { cookie, "x-company-id": crypto.randomUUID() } });
    check("another company's prices refused", [403, 404].includes(other.status), String(other.status));
  } finally {
    await db.query("UPDATE web_auth.sessions s SET revoked_at=now() FROM web_auth.users u WHERE u.id=s.user_id AND u.email=$1 AND s.revoked_at IS NULL", [email]);
    await db.query("UPDATE web_auth.users SET status='disabled' WHERE email=$1", [email]);
    await db.end();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll price comparison checks passed");
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
