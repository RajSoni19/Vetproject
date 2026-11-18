#!/usr/bin/env node
// Reads invoice images with the same code the server route uses.
//   node scripts/test-gemini.cjs page1.jpg [page2.jpg ...]
// All images are treated as pages of ONE invoice. Reads GEMINI_API_KEY and
// GEMINI_MODEL from the environment or .env.local. The key is never printed.
const fs = require("node:fs");
const path = require("node:path");
const { loadSource } = require("../tests/load-source.cjs");

const envFile = path.join(__dirname, "..", ".env.local");
const fileEnv = fs.existsSync(envFile) ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/).filter((line) => /^GEMINI_[A-Z_]+=/.test(line)).map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")]; })) : {};
const env = { ...fileEnv, ...process.env };
const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error("Usage: node scripts/test-gemini.cjs <image> [more pages]"); process.exit(2); }
  const pages = files.map((file) => {
    const mimeType = types[path.extname(file).toLowerCase()];
    if (!mimeType) throw new Error(`Unsupported file type: ${file}`);
    return { mimeType, bytes: new Uint8Array(fs.readFileSync(file)) };
  });
  const { extractWithGemini } = loadSource("lib/ai-extraction");
  const { invoiceDraftFromAi } = loadSource("lib/captured-invoice-draft");
  const started = Date.now();
  try {
    const { invoice, usage, model } = await extractWithGemini(pages, { env, timeoutMs: Number(env.GEMINI_TEST_TIMEOUT_MS || 25000) });
    const draft = invoiceDraftFromAi(invoice, path.basename(files[0]), { pageCount: pages.length, readBy: "gemini" });
    console.log(JSON.stringify({ model, latencyMs: Date.now() - started, usage, invoice, review: { supplier: draft.supplierName, vatNumber: draft.supplierVatNumber, number: draft.number, date: draft.issuedOn, summary: draft.summary, lines: draft.lines, warnings: draft.warnings } }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ failed: error.code ?? "ERROR", providerStatus: error.providerStatus ?? null, latencyMs: Date.now() - started }));
    process.exit(1);
  }
})();
