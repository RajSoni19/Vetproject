const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { parseAiInvoice } = loadSource('lib/ai-invoice');
const { dateWarning, lineTotal, missingPageWarning, totalsWarning } = loadSource('lib/invoice-checks');
const { hasTotalsProblem, invoiceDraftFromAi, invoiceDraftFromText } = loadSource('lib/captured-invoice-draft');
const { AI_CACHE_TTL_MS, aiCacheKey, readAiCache, writeAiCache } = loadSource('lib/ai-invoice-cache');
const { AiExtractionError, extractWithGemini } = loadSource('lib/ai-extraction');
const { invoiceExtractHandler, INVOICE_EXTRACT_LIMITS } = loadSource('lib/server/saas/invoice-extract-http');

// All parties and amounts are synthetic.
const today = new Date('2026-11-18T12:00:00Z');
const line = (extra) => ({ description: 'Item', quantity: 1, unit: null, unit_price: null, discount: null, offer_price: null, amount: null, vat_rate: null, vat_code: null, ...extra });
const invoice = (extra = {}) => parseAiInvoice({ document_type: 'invoice', supplier_name: 'Example Foods Ltd', customer_name: 'Example Bistro Ltd', vat_number: null, invoice_number: 'A-1', invoice_date: '2026-11-17', due_date: null, prices_include_vat: false, lines: [], vat_summary: [], subtotal: null, net_total: null, vat_total: null, gross_total: null, page_info: null, ...extra });
const draft = (extra, context = {}) => invoiceDraftFromAi(invoice(extra), 'scan.jpg', { today, pageCount: 1, readBy: 'gemini', ...context });

test('missing page, date and line arithmetic checks', () => {
  assert.match(missingPageWarning('Page 1 / 2', 1), /^Page 2 may be missing/);
  assert.match(missingPageWarning('Page 1 of 3', 2), /^Page 3 may be missing/);
  assert.equal(missingPageWarning('Page 2 / 2', 2), null);
  assert.equal(missingPageWarning(null, 1), null);
  assert.match(dateWarning('2026-12-01', today), /Please check the date/);
  assert.match(dateWarning('2025-10-01', today), /Please check the date/);
  assert.equal(dateWarning('2026-11-18', today), null);
  assert.equal(dateWarning('2025-12-01', today), null);
  assert.equal(lineTotal(2, 15, 6), 24);
  assert.equal(lineTotal(3, 22.75, 38.25), 30);
  assert.match(totalsWarning(371.89, 404.3, 14), /^A page or item may be missing/);
  assert.equal(totalsWarning(72, 72, 1), null);
});

test('an unsupported model reply is rejected and bad values become null', () => {
  assert.throws(() => parseAiInvoice({ supplier_name: 'No lines' }));
  const parsed = invoice({ invoice_date: '17/11/2026', lines: [line({ description: '  Tea  ', discount: -2, unit_price: 'x' }), line({ description: ' ' })] });
  assert.equal(parsed.invoice_date, null);
  assert.deepEqual(parsed.lines.map(l => [l.description, l.discount, l.unit_price]), [['Tea', 2, null]]);
});

test('invoice with no VAT shown: one line, tick amount, VAT not claimed', () => {
  const result = draft({ lines: [line({ description: 'Greek style yogurt 5kg', quantity: 6, unit_price: 12, amount: 72 })], gross_total: 72 });
  assert.deepEqual(result.lines, [{ description: 'Greek style yogurt 5kg', quantity: '6', unitPrice: '12', discount: '0', rate: '0', treatment: 'not-evidenced', pricing: 'exclusive', printed: '72.00' }]);
  assert.deepEqual([result.summary.net, result.summary.gross, result.readBy], [72, 72, 'gemini']);
  assert.ok(!result.warnings.some(w => /may be missing/.test(w)));
});

test('printed page marking with only one page sent warns about the missing page', () => {
  const result = draft({ page_info: 'Page 1 / 2', lines: [line({ quantity: 1, unit_price: 67.58, amount: 67.58 }), line({ quantity: 2, unit_price: 27.46, amount: 54.92 })], gross_total: 122.5 });
  assert.ok(result.warnings.some(w => /^Page 2 may be missing/.test(w)));
  assert.equal(result.summary.gross, 122.5);
  assert.ok(!draft({ page_info: 'Page 1 / 2', gross_total: 1 }, { pageCount: 2 }).warnings.some(w => /^Page 2/.test(w)));
});

test('lines at 20% that fall short of the amount to pay warn that something is missing', () => {
  const result = draft({ lines: [line({ quantity: 1, unit_price: 309.91, amount: 309.91, vat_rate: 20 })], gross_total: 404.3 });
  assert.equal(result.summary.net, 309.91);
  assert.equal(result.summary.vat, 61.98);
  assert.ok(result.warnings.some(w => /^A page or item may be missing/.test(w)));
});

test('a goods total that disagrees with the lines is not trusted', () => {
  const result = draft({ lines: [line({ quantity: 1, unit_price: 309.91, amount: 309.91, vat_rate: 20 })], subtotal: 337.5, net_total: 337.5, vat_total: 67.5, gross_total: 404.3 });
  assert.deepEqual([result.summary.net, result.summary.vat, result.summary.gross], [309.91, 61.98, 404.3]);
  assert.ok(result.warnings.some(w => /items come to £371.89 but the document total is £404.30/.test(w)));
});

test('receipt discounts stay on their items and reconcile to subtotal and total', () => {
  const items = [[2, 15, 6, 30], [3, 22.75, 38.25, 68.25], [2, 12.5, 13, 25], [6, 1.75, null, 10.5], [3, 24.5, 16.5, 73.5], [1, 1.25, null, 1.25], [1, 1.7, 0.5, 1.7], [1, 1.3, null, 1.3], [1, 0.91, null, 0.91]];
  const result = draft({ document_type: 'receipt', prices_include_vat: true, vat_number: 'GB 220 4302 31', lines: items.map(([quantity, unit_price, discount, amount]) => line({ quantity, unit_price, discount, amount })), subtotal: 212.41, gross_total: 138.16 });
  assert.equal(result.receipt, true);
  assert.equal(draft({ lines: [line({ description: '2 Demo Drink 70cl', quantity: 2, unit_price: 1, amount: 2 })] }).lines[0].description, 'Demo Drink 70cl');
  assert.equal(result.supplierVatNumber, 'GB220430231');
  assert.deepEqual([result.lines[0].discount, result.lines[0].printed, result.lines[0].pricing], ['6', '24.00', 'inclusive']);
  assert.ok(!result.warnings.some(w => /may be missing|check digit/.test(w)));
});

test('member prices give exact discounts, and one returned as a discount is repaired from the total', () => {
  const offer = draft({ document_type: 'receipt', prices_include_vat: true, lines: [line({ quantity: 3, unit_price: 22.75, offer_price: 10, discount: 10, amount: 68.25 })], gross_total: 30 });
  assert.deepEqual([offer.lines[0].discount, offer.lines[0].printed], ['38.25', '30.00']);
  const wrong = draft({ document_type: 'receipt', prices_include_vat: true, lines: [line({ quantity: 3, unit_price: 22.75, discount: 10, amount: 68.25 }), line({ quantity: 2, unit_price: 15, discount: 6, amount: 30 })], gross_total: 54 });
  assert.deepEqual(wrong.lines.map(l => [l.discount, l.printed]), [['38.25', '30.00'], ['6', '24.00']]);
  assert.ok(!wrong.warnings.some(w => /may be missing/.test(w)));
  const unknown = draft({ document_type: 'receipt', prices_include_vat: true, lines: [line({ quantity: 1, unit_price: 5, discount: 1, amount: 5 })], gross_total: 99 });
  assert.equal(unknown.lines[0].discount, '1');
  assert.ok(unknown.warnings.some(w => /may be missing/.test(w)));
});

test('an invoice is only treated as VAT-inclusive when its figures prove it', () => {
  const noVat = draft({ prices_include_vat: true, lines: [line({ quantity: 1, unit_price: 67.58, amount: 67.58 })], gross_total: 67.58 });
  assert.equal(noVat.lines[0].pricing, 'exclusive');
  const onTop = draft({ prices_include_vat: true, lines: [line({ quantity: 1, unit_price: 100, amount: 100, vat_rate: 20 })], vat_total: 20, gross_total: 120 });
  assert.equal(onTop.lines[0].pricing, 'exclusive');
  const included = draft({ prices_include_vat: true, lines: [line({ quantity: 1, unit_price: 120, amount: 120, vat_rate: 20 })], vat_total: 20, gross_total: 120 });
  assert.equal(included.lines[0].pricing, 'inclusive');
});

test('VAT codes use the printed VAT table; a bad VAT number is flagged', () => {
  const result = draft({ document_type: 'receipt', prices_include_vat: true, vat_number: 'GB350396897', vat_summary: [{ code: 'A', rate: 0, goods: 22.2, vat: 0 }, { code: 'B', rate: 20, goods: 0.65, vat: 0.11 }], lines: [line({ quantity: 1, unit_price: 22.2, amount: 22.2, vat_code: 'A' }), line({ quantity: 1, unit_price: 0.65, amount: 0.65, vat_code: 'B' })], gross_total: 22.85 });
  assert.deepEqual(result.lines.map(l => [l.treatment, l.rate]), [['zero', '0'], ['standard', '20']]);
  assert.deepEqual([result.summary.vat, result.summary.net], [0.11, 22.74]);
  assert.ok(result.warnings.some(w => /check digit/.test(w)));
});

test('the customer is never taken as the supplier; a chosen supplier wins', () => {
  assert.equal(draft({ supplier_name: 'Example Bistro Ltd' }).supplierName, '');
  const chosen = draft({ vat_number: 'bad' }, { supplier: { id: 's1', name: 'Saved Supplier Ltd', vatNumber: 'GB220430231' } });
  assert.deepEqual([chosen.supplierId, chosen.supplierName, chosen.supplierVatNumber], ['s1', 'Saved Supplier Ltd', 'GB220430231']);
  assert.ok(!chosen.warnings.some(w => /^VAT number/.test(w)));
});

test('a text reading whose lines do not reach the printed total is flagged for a re-check', () => {
  const header = 'Example Foods Ltd\nInvoice No: A-1\nInvoice date: 12/11/2026\nDescription\tQty\tPrice\tVAT\tAmount\nSample Rice\t2\t10.00\tZ\t20.00\nSubtotal\t20.00\nVAT\t0.00\n';
  const bad = invoiceDraftFromText(header + 'Total\t99.00', 'x.pdf', { today });
  assert.ok(bad.warnings.some(w => /^A page or item may be missing/.test(w)));
  assert.equal(hasTotalsProblem(bad), true);
  assert.equal(hasTotalsProblem(invoiceDraftFromText(header + 'Total\t20.00', 'x.pdf', { today })), false);
});

test('the same page and date checks apply to text readings', () => {
  const text = 'Example Foods Ltd\nInvoice No: A-1\nInvoice date: 01/01/2020\nTotal: 10.00\nPage 1 / 2';
  const result = invoiceDraftFromText(text, 'x.jpg', { today, pageCount: 1, readBy: 'tesseract' });
  assert.ok(result.warnings.some(w => /^Page 2 may be missing/.test(w)) && result.warnings.some(w => /Please check the date/.test(w)));
  assert.equal(result.readBy, 'tesseract');
});

const page = { mimeType: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 1]) };
const env = { GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'test-model' };
const reply = { text: JSON.stringify(invoice({ gross_total: 5 })), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 1, totalTokenCount: 31 } };
const client = (generateContent) => ({ models: { generateContent } });
const status = (code) => Object.assign(new Error('provider text that may quote the document'), { status: code });

test('Gemini call: all pages and JSON settings are sent; usage is returned', async () => {
  let request;
  const result = await extractWithGemini([page, page], { env, client: client(async (value) => { request = value; return reply; }) });
  assert.equal(request.model, 'test-model');
  assert.equal(request.contents[0].parts.filter(part => part.inlineData).length, 2);
  assert.equal(request.config.responseMimeType, 'application/json');
  assert.equal(request.config.thinkingConfig.thinkingLevel, 'MINIMAL');
  assert.equal(request.config.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
  assert.equal(result.invoice.gross_total, 5);
  assert.equal(result.usage.totalTokens, 31);
});

test('Gemini failures: 429, timeout, invalid JSON, missing key; 503 is retried once', async () => {
  const code = (expected) => (error) => error instanceof AiExtractionError && error.code === expected;
  await assert.rejects(extractWithGemini([page], { env, client: client(async () => { throw status(429); }) }), code('RATE_LIMITED'));
  await assert.rejects(extractWithGemini([page], { env, timeoutMs: 10, client: client(() => new Promise(() => {})) }), code('TIMEOUT'));
  await assert.rejects(extractWithGemini([page], { env, client: client(async () => ({ text: 'not json' })) }), code('INVALID_RESPONSE'));
  await assert.rejects(extractWithGemini([page], { env: {} }), code('NOT_CONFIGURED'));
  let calls = 0;
  await extractWithGemini([page], { env, retryDelayMs: 1, client: client(async () => { if (++calls === 1) throw status(503); return reply; }) });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(extractWithGemini([page], { env, retryDelayMs: 1, client: client(async () => { calls++; throw status(500); }) }), code('PROVIDER_ERROR'));
  assert.equal(calls, 1);
});

const services = (buckets = []) => ({ auth: { config: { csrfSecret: 'a'.repeat(64) }, store: { consume: async (items) => { buckets.push(...items); return { allowed: true, retryAfterSeconds: 0 }; } } } });
const authorize = async () => ({ companyId: 'company-1', actorId: 'user-1' });
const post = (files) => { const form = new FormData(); for (const file of files) form.append('page', file); return new Request('http://localhost/api/business/invoice-extract', { method: 'POST', body: form }); };
const jpeg = () => new File([new Uint8Array([255, 216, 255, 224, 0])], 'page.jpg', { type: 'image/jpeg' });
const parsed = invoice({ gross_total: 9 });

test('route: returns the reading with limits applied, and logs no invoice content', async () => {
  const logs = [], buckets = [];
  const handler = invoiceExtractHandler(services(buckets), { env, authorize, log: entry => logs.push(entry), extract: async (pages) => { assert.equal(pages.length, 2); return { invoice: parsed, usage: { totalTokens: 3 }, model: 'm' }; } });
  const response = await handler(post([jpeg(), jpeg()])), body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual([body.data.source, body.data.invoice.gross_total], ['gemini', 9]);
  assert.deepEqual(buckets.map(b => b.limit), [120, 1000, 5000]);
  assert.ok(!JSON.stringify(logs).includes('Example Foods'));
  assert.deepEqual(INVOICE_EXTRACT_LIMITS, { userPerHour: 120, companyPerDay: 1000, sitePerDay: 5000 });
});

test('route: provider errors are returned without provider text; bad uploads are refused', async () => {
  const failing = (code) => invoiceExtractHandler(services(), { env, authorize, log() {}, extract: async () => { throw new AiExtractionError(code, 500); } });
  assert.equal((await failing('RATE_LIMITED')(post([jpeg()]))).status, 429);
  for (const code of ['TIMEOUT', 'INVALID_RESPONSE', 'PROVIDER_ERROR']) { const response = await failing(code)(post([jpeg()])); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /quote the document/); }
  const handler = invoiceExtractHandler(services(), { env, authorize, log() {}, extract: async () => assert.fail('must not call the provider') });
  assert.equal((await handler(post([new File(['x'], 'a.txt', { type: 'text/plain' })]))).status, 400);
  assert.equal((await handler(post([new File(['not a pdf'], 'a.pdf', { type: 'application/pdf' })]))).status, 400);
  assert.equal((await handler(post([new File(['not a jpeg'], 'a.jpg', { type: 'image/jpeg' })]))).status, 400);
  assert.equal((await handler(post(Array.from({ length: 11 }, jpeg)))).status, 400);
});

test('route: without a key it reports unavailable and never calls the provider', async () => {
  const handler = invoiceExtractHandler(services(), { env: {}, authorize, log() {}, extract: async () => assert.fail('must not call the provider') });
  assert.equal((await (await handler(new Request('http://localhost/x'))).json()).data.available, false);
  assert.equal((await handler(post([jpeg()]))).status, 503);
});

test('scanned PDFs go to the reader as PDFs at medium resolution', async () => {
  let request;
  await extractWithGemini([{ mimeType: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.7') }], { env, client: client(async (value) => { request = value; return reply; }) });
  assert.equal(request.contents[0].parts[0].inlineData.mimeType, 'application/pdf');
  assert.equal(request.config.mediaResolution, 'MEDIA_RESOLUTION_MEDIUM');
  const pages = []; const handler = invoiceExtractHandler(services(), { env, authorize, log() {}, extract: async (value) => { pages.push(...value); return { invoice: parsed, usage: {}, model: 'm' }; } });
  assert.equal((await handler(post([new File(['%PDF-1.7 scan'], 'a.pdf', { type: 'application/pdf' })]))).status, 200);
  assert.equal(pages[0].mimeType, 'application/pdf');
});

test('totals problems are detected so a text PDF can be re-read', () => {
  assert.equal(hasTotalsProblem(draft({ lines: [line({ quantity: 1, unit_price: 10, amount: 10 })], gross_total: 10 })), false);
  assert.equal(hasTotalsProblem(draft({ lines: [line({ quantity: 1, unit_price: 10, amount: 10 })], gross_total: 90 })), true);
  assert.equal(hasTotalsProblem(draft({ gross_total: null })), true);
});

test('saved readings are per company and file, expire after 24 hours and hold no image', async () => {
  const data = new Map(), store = { get length() { return data.size; }, key: (index) => [...data.keys()][index] ?? null, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const file = new Blob(['photo bytes']), key = await aiCacheKey('company-1', [file]), reading = { invoice: invoice({ gross_total: 7 }), pageCount: 1 };
  assert.equal(key, await aiCacheKey('company-1', [new Blob(['photo bytes'])]));
  assert.notEqual(key, await aiCacheKey('company-2', [file]));
  assert.notEqual(key, await aiCacheKey('company-1', [new Blob(['other bytes'])]));
  writeAiCache(store, key, reading, 1000);
  assert.ok(!data.get(key).includes('photo bytes'));
  assert.equal(readAiCache(store, key, 2000).invoice.gross_total, 7);
  assert.equal(readAiCache(store, key, 1000 + AI_CACHE_TTL_MS), null);
  assert.equal(data.size, 0);
});

test('a Gemini request that never answers is asked once more within the time limit', async () => {
  let calls = 0;
  const result = await extractWithGemini([page], { env, timeoutMs: 400, client: client(() => ++calls === 1 ? new Promise(() => {}) : Promise.resolve(reply)) });
  assert.equal(calls, 2);
  assert.ok(result.invoice);
  calls = 0;
  await assert.rejects(extractWithGemini([page], { env, timeoutMs: 100, client: client(() => { calls++; return new Promise(() => {}); }) }), (error) => error.code === 'TIMEOUT');
  assert.equal(calls, 2);                     // one retry, never more
});

test('a busy main model (503 "high demand") is retried on the backup model, which is reported', async () => {
  const models = [];
  const result = await extractWithGemini([page], { env, retryDelayMs: 1, client: client(async (request) => { models.push(request.model); if (models.length === 1) throw status(503); return reply; }) });
  assert.deepEqual(models, ['test-model', 'gemini-3.1-flash-lite']);
  assert.equal(result.model, 'gemini-3.1-flash-lite');
  // A silent (timed-out) attempt is asked again on the same model.
  models.length = 0;
  await extractWithGemini([page], { env: { ...env, GEMINI_FALLBACK_MODEL: 'off' }, retryDelayMs: 1, client: client(async (request) => { models.push(request.model); if (models.length === 1) throw status(503); return reply; }) });
  assert.deepEqual(models, ['test-model', 'test-model']);
});
