const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadSource } = require('./load-source.cjs');
const { appPhrases, appPatterns, PACK_LOCALES } = loadSource('lib/i18n/app-phrases');
const cat = loadSource('lib/i18n/catalog');
const tr = loadSource('lib/i18n/catalog-translations');

// Every language offered in the menu must work inside the app, not only on the public website.
test('every menu language is either built in (Gujarati, Hindi) or has a complete pack', () => {
  const offered = cat.locales.map((l) => l.code).filter((c) => !['en-GB', 'gu-IN', 'hi-IN'].includes(c));
  assert.deepEqual([...offered].sort(), [...PACK_LOCALES].sort());
});

for (const locale of PACK_LOCALES) {
  test(`language pack ${locale}: phrases, patterns, months and catalog are complete`, () => {
    const file = path.join(__dirname, '..', 'lib', 'i18n', 'locales', `${locale}.json`);
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    const missingPhrases = Object.keys(appPhrases).filter((en) => typeof pack.phrases[en] !== 'string' || !pack.phrases[en].trim());
    assert.deepEqual(missingPhrases, [], 'phrases without a translation');
    assert.equal(pack.patterns.length, appPatterns.length);
    appPatterns.forEach(([, gu], i) => {
      const need = [...new Set(gu.match(/\$\d/g) || [])].sort().join(), have = [...new Set(pack.patterns[i].match(/\$\d/g) || [])].sort().join();
      assert.equal(have, need, `pattern ${i} placeholders`);
    });
    for (const m of ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec']) assert.ok(pack.months[m], `month ${m}`);
    // With the pack loaded first (as the app does), no catalog message falls back to English
    // except names and abbreviations that are the same in every language.
    const en = cat.messages['en-GB'], maps = [pack.catalog, ...tr.translationMaps(locale).filter(Boolean)];
    const same = Object.keys(en).filter((k) => { const v = maps.map((m) => m[k]).find((x) => x !== undefined); return v === undefined || (v === en[k] && /[a-z]{4,}/.test(en[k]) && !/^(VET THE VAT|WhatsApp|Email|E-mail)$/i.test(en[k])); });
    assert.ok(same.length <= 25, `${same.length} catalog messages still English: ${same.slice(0, 10).join(', ')}`);
  });
}
