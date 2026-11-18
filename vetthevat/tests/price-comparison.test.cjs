const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { comparePrices, productKey } = loadSource('lib/price-comparison');

let n = 0;
const obs = (supplier, description, unitPrice, issuedOn, quantity = 1) => ({
  lineId: `l${++n}`, invoiceId: `i${n}`, invoiceNumber: `INV-${n}`, issuedOn, supplierId: supplier, supplierName: supplier.toUpperCase(),
  supplierEmail: `${supplier}@example.test`, supplierPhone: null, description, quantity, unitPrice, currency: 'GBP'
});

test('product key ignores stock codes, case and spacing', () => {
  assert.equal(productKey('51010 Cobra Beer KEG'), productKey('COBRA  BEER keg'));
  assert.equal(productKey('Red onion 10 kg'), productKey('RED ONION 10KG'));
  assert.notEqual(productKey('Red onion 10kg'), productKey('Red onion 20kg'));
});

test('cheapest supplier, saving percent and potential saving from real purchases', () => {
  const result = comparePrices([
    obs('temple', 'Cooking Oil 20L', 27.50, '2026-11-01', 3),
    obs('westfield', 'COOKING OIL 20L', 24.75, '2026-10-20', 2),
    obs('booker', 'cooking oil 20l', 26.00, '2026-10-25')
  ], { asOf: '2026-11-13' });
  const oil = result.products[0];
  assert.equal(oil.suppliers.length, 3);
  assert.equal(oil.bestSupplierId, 'westfield');
  assert.equal(oil.bestPrice, 24.75);
  assert.equal(oil.savingPercent, 10);                 // (27.50 - 24.75) / 27.50
  assert.equal(oil.potentialSaving, 8.25);             // last bought 3 at 27.50 from temple
  assert.deepEqual(result.suppliers.map(s => [s.id, s.cheapestCount]), [['westfield', 1], ['booker', 0], ['temple', 0]]);
  assert.equal(result.totals.potentialSaving, 8.25);
});

test('price alerts at 10% or more, increases and decreases, within 12 weeks only', () => {
  const result = comparePrices([
    obs('temple', 'Diced chicken 5kg', 5.20, '2026-09-10'), obs('temple', 'Diced chicken 5kg', 5.85, '2026-11-05'),  // +12.5%
    obs('temple', 'Flour 16kg', 8.00, '2026-09-10'), obs('temple', 'Flour 16kg', 8.40, '2026-11-05'),                // +5%: no alert
    obs('rk', 'Tomatoes 6kg', 10.00, '2026-10-01'), obs('rk', 'Tomatoes 6kg', 8.50, '2026-11-01'),                    // -15%
    obs('rk', 'Mint bunches', 1.00, '2026-06-01'), obs('rk', 'Mint bunches', 2.00, '2026-11-01')                     // old price outside window
  ], { asOf: '2026-11-13' });
  assert.deepEqual(result.alerts.map(a => [a.name, a.changePercent]), [['Tomatoes 6kg', -15], ['Diced chicken 5kg', 12.5]]);
  assert.equal(result.window.from, '2026-08-21');
});

test('custom window and threshold; nothing outside the window counts', () => {
  const rows = [obs('a', 'Milk 2L', 1.00, '2026-10-01'), obs('a', 'Milk 2L', 1.06, '2026-11-01')];
  assert.equal(comparePrices(rows, { asOf: '2026-11-13', thresholdPercent: 5 }).alerts.length, 1);
  assert.equal(comparePrices(rows, { asOf: '2026-11-13', weeks: 2 }).products[0].suppliers[0].observations, 1);
});

test('supplier spelling mistakes and "loose" are compared as one product', () => {
  const { sameProduct, matchesProductSearch } = loadSource('lib/price-comparison');
  const same = (a, b) => sameProduct(productKey(a), productKey(b));
  assert.ok(same('Loose tomatoes', 'Tomatoes'));
  assert.ok(same('Losee tomatoes', 'TOMATOES'));
  assert.ok(same('Okara', 'Okra'));
  assert.ok(same('Red onions', 'onion red'));
  assert.ok(same('Corriander', 'Coriander'));
  assert.ok(!same('Bread', 'Bream'));
  assert.ok(!same('Beef', 'Beer'));
  assert.ok(!same('Tomatoes 6kg', 'Tomatoes 5kg'));
  assert.ok(!same('Cherry tomatoes', 'Tomatoes'));
  const result = comparePrices([
    obs('rk', 'Loose tomatoes', 1.20, '2026-11-01'), obs('vbns', 'Tomatoes', 1.05, '2026-11-02'),
    obs('costco', 'Losee tomatoes', 1.10, '2026-11-03'), obs('rk', 'Okara', 3.00, '2026-11-01'), obs('vbns', 'Okra', 2.70, '2026-11-02')
  ], { asOf: '2026-11-13' });
  assert.equal(result.products.length, 2);
  const tomatoes = result.products.find(p => /tomato/i.test(p.name));
  assert.equal(tomatoes.suppliers.length, 3);
  assert.equal(tomatoes.bestSupplierId, 'vbns');
  assert.equal(tomatoes.name, 'Losee tomatoes');
  assert.deepEqual(tomatoes.aliases.sort(), ['Loose tomatoes', 'Tomatoes']);
  assert.ok(matchesProductSearch([tomatoes.name, ...tomatoes.aliases], 'tomatos'));
  assert.ok(matchesProductSearch(['Okara'], 'okra'));
  assert.ok(matchesProductSearch(['Tomatoes'], 'tom'));
  assert.ok(!matchesProductSearch(['Okara'], 'tomato'));
});

test('display name drops the supplier stock code', () => {
  assert.equal(comparePrices([obs('temple', '10442 Cobra Beer 24x330ml', 18.99, '2026-11-01')], { asOf: '2026-11-13' }).products[0].name, 'Cobra Beer 24x330ml');
});
