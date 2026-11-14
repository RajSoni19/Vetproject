// End-to-end OCR -> database: reads real invoice PDFs with the browser's text
// layout code, builds the draft the capture screen builds, then saves it through
// the same API calls ManualInvoiceWorkspace makes, and reads it back.
// Uses the fixed synthetic account e2e-smoke@example.test (disabled afterwards).
//   node tests/e2e-ocr-save.cjs <pdf>... [--origin http://127.0.0.1:3197]
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const { Client } = require(path.join(root, "node_modules", "pg"));
const { loadSource } = require("./load-source.cjs");
const { layoutPositionedText, normalizeDocumentText } = loadSource("lib/document-text-layout");
const { invoiceDraftFromText } = loadSource("lib/captured-invoice-draft");

const args = process.argv.slice(2), oi = args.indexOf("--origin");
const origin = oi >= 0 ? args.splice(oi, 2)[1] : "http://127.0.0.1:3197";
const files = args.length ? args : [path.join(root, ".local-demo", "invoices", "SYN-001.pdf")];
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter(l => /^[A-Z_0-9]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
let failed = 0; const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  — " + detail : ""}`); };

async function pdfText(file) {
  const pdfjs = await import(pathToFileURL(path.join(root, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(normalizeDocumentText(layoutPositionedText(content.items.flatMap(i => "str" in i ? [{ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width, height: i.height || Math.abs(i.transform[3]) }] : []))));
  }
  return normalizeDocumentText(pages.join("\n"));
}

(async () => {
  const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect();
  const email = "e2e-smoke@example.test";
  await db.query("UPDATE web_auth.users SET status='active' WHERE email=$1", [email]);
  try {
    const call = async (route, { method = "GET", body, session, headers = {}, version = 1 } = {}) => {
      const h = { ...headers };
      if (session) h.cookie = session.cookie;
      if (method !== "GET") { Object.assign(h, { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" }); if (session) Object.assign(h, { "x-csrf-token": session.csrf, "if-match": `"${version}"`, "idempotency-key": crypto.randomUUID() }); }
      const r = await fetch(origin + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text(); let json; try { json = JSON.parse(text); } catch {}
      return { status: r.status, body: json, text, headers: r.headers };
    };
    const login = await call("/api/auth/session", { method: "POST", body: { email, password: "Synthetic-E2E-Pass-2026!" } });
    check("sign in", login.status === 200, String(login.status));
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const session = { cookie, csrf: (await call("/api/auth/session", { session: { cookie } })).body.csrfToken };
    const companyId = (await call("/api/account/companies", { session })).body.companies[0].id;
    const co = { "x-company-id": companyId };

    for (const file of files) {
      const name = path.basename(file);
      const text = await pdfText(file);
      const draft = invoiceDraftFromText(text, name, { companyName: "E2E Synthetic Kitchen Ltd" });
      console.log(`--- ${name}: supplier="${draft.supplierName}" no=${draft.number} date=${draft.issuedOn} net=${draft.summary.net} vat=${draft.summary.vat} gross=${draft.summary.gross} lines=${draft.lines.length}`);
      check(`${name}: supplier, number, date and gross read`, Boolean(draft.supplierName && draft.number && draft.issuedOn && draft.summary.gross !== null));

      // Supplier: reuse a saved one with the same name, else create it (as "Save & select this supplier" does).
      const list = await call("/api/business/contacts?" + new URLSearchParams({ kind: "supplier", limit: "100" }), { session, headers: co });
      let supplier = list.body.data.items.find(c => c.name.toLowerCase() === draft.supplierName.toLowerCase());
      if (!supplier) {
        const created = await call("/api/business/contacts", { method: "POST", session, headers: co, body: { kind: "supplier", status: "active", name: draft.supplierName, email: "", phone: "", vatNumber: draft.supplierVatNumber, address: "" } });
        check(`${name}: supplier saved to database`, created.status === 200, `${created.status} ${created.text.slice(0, 160)}`);
        supplier = created.body?.data;
      }
      if (!supplier) continue;

      // Same body ManualInvoiceWorkspace.save() posts. A unique number per run avoids the duplicate-invoice guard.
      const number = `${draft.number}-T${Date.now().toString(36)}`;
      const saved = await call("/api/business/invoices", { method: "POST", session, headers: co, body: {
        direction: "purchase", kind: "invoice", contactId: supplier.id, number, issuedOn: draft.issuedOn, dueOn: draft.dueOn || null,
        currency: draft.currency || "GBP", rounding: "line-half-up", lines: draft.lines, notes: "E2E OCR test from " + name, creditForId: null } });
      check(`${name}: invoice saved to database`, saved.status === 200, `${saved.status} ${saved.text.slice(0, 200)}`);
      if (saved.status !== 200) continue;
      const read = await call(`/api/business/invoices/${saved.body.data.id}`, { session, headers: co });
      const stored = read.body?.data?.invoice ?? {};
      const calc = stored.calculation ?? {};
      const net = Number(calc.net ?? calc.totals?.net ?? stored.net), vat = Number(calc.vat ?? calc.totals?.vat ?? stored.vat), gross = Number(calc.gross ?? calc.totals?.gross ?? stored.gross);
      check(`${name}: read back from database`, read.status === 200 && stored.number === number, `${read.status}`);
      check(`${name}: stored totals match the document`, (draft.summary.net === null || Math.abs(net - draft.summary.net) < 0.011) && (draft.summary.gross === null || Math.abs(gross - draft.summary.gross) < 0.011), `stored net ${net} vat ${vat} gross ${gross}`);
      const row = (await db.query("SELECT count(*)::int n FROM business.invoices WHERE company_id=$1 AND number=$2", [companyId, number])).rows[0].n;
      check(`${name}: row present in business.invoices`, row === 1);
    }
  } finally {
    await db.query("UPDATE web_auth.sessions s SET revoked_at=now() FROM web_auth.users u WHERE u.id=s.user_id AND u.email=$1 AND s.revoked_at IS NULL", [email]);
    await db.query("UPDATE web_auth.users SET status='disabled' WHERE email=$1", [email]);
    await db.end();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll OCR-to-database checks passed");
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
