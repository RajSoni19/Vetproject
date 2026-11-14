const UK_VAT = /(?<![A-Za-z0-9])(GB|XI)?\s?(\d{3})[\s.-]?(\d{4})[\s.-]?(\d{2})(?:[\s.-]?(\d{3}))?(?!\d)/gi;
const text = "VAT No GB 795 6444 76";
const matches = [...text.matchAll(UK_VAT)];
console.log("matches:", matches);

const rows = [{ text: "VAT No GB 795 6444 76", cells: ["VAT No GB 795 6444 76"] }];
console.log("labelled:", /v\.?\s?a\.?\s?t|tax\s*(?:reg|id\b|no\b|number)/i.test(rows[0].text));
