export type PackEvidence = {
  itemsPerPack: string;
  contentPerItem: string | null;
  unit: "g" | "kg" | "ml" | "l" | "each" | null;
};

export type MatchProduct = {
  id: string;
  company_id: string;
  name: string;
  variant: string;
  unit: string;
};

export type MatchAlias = {
  company_id: string;
  supplier_id: string;
  description: string;
  product_id: string;
  items_per_pack: string;
  content_per_item: string;
  unit: NonNullable<PackEvidence["unit"]>;
};

export type ProductSuggestion = {
  productId: string;
  confidence: "exact supplier alias" | "exact normalized name";
  itemsPerPack: string | null;
  contentPerItem: string | null;
  unit: PackEvidence["unit"] | null;
};

const measureUnit = "(kg|g|l|ml|each|pcs?)";
const decimal = "(\\d+(?:\\.\\d+)?)";

export function normalizeProductText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function extractPackEvidence(value: string): PackEvidence | null {
  const packed = new RegExp(
    `${decimal}\\s*[x×]\\s*${decimal}\\s*${measureUnit}\\b`,
    "i",
  ).exec(value);
  if (packed) {
    return {
      itemsPerPack: packed[1],
      contentPerItem: packed[2],
      unit: normalizeUnit(packed[3]),
    };
  }

  const packOf = new RegExp(`\\b(?:pack|case|box)\\s+of\\s+${decimal}\\b`, "i").exec(value);
  if (packOf) {
    return { itemsPerPack: packOf[1], contentPerItem: null, unit: null };
  }

  const measured = new RegExp(`${decimal}\\s*${measureUnit}\\b`, "i").exec(value);
  if (measured) {
    return {
      itemsPerPack: "1",
      contentPerItem: measured[1],
      unit: normalizeUnit(measured[2]),
    };
  }
  return null;
}

function normalizeUnit(unit: string): NonNullable<PackEvidence["unit"]> {
  switch (unit.toLowerCase()) {
    case "kg":
    case "g":
    case "l":
    case "ml":
      return unit.toLowerCase() as NonNullable<PackEvidence["unit"]>;
    default:
      return "each";
  }
}

function baseUnit(unit: string) {
  if (unit === "g" || unit === "kg") return "kg";
  if (unit === "ml" || unit === "l") return "l";
  if (unit === "each") return "each";
  return null;
}

function productIdentity(product: MatchProduct) {
  return normalizeProductText(`${product.name} ${product.variant}`);
}

function withoutPackEvidence(value: string) {
  return normalizeProductText(
    value
      .replace(new RegExp(`${decimal}\\s*[x×]\\s*${decimal}\\s*${measureUnit}\\b`, "gi"), " ")
      .replace(new RegExp(`\\b(?:pack|case|box)\\s+of\\s+${decimal}\\b`, "gi"), " ")
      .replace(new RegExp(`${decimal}\\s*${measureUnit}\\b`, "gi"), " "),
  );
}

export function suggestProductMatches(input: {
  companyId: string;
  line: { description: string; supplierId: string };
  products: MatchProduct[];
  aliases: MatchAlias[];
}): ProductSuggestion[] {
  const text = normalizeProductText(input.line.description);
  const textWithoutPack = withoutPackEvidence(input.line.description);
  const evidence = extractPackEvidence(input.line.description);
  const productById = new Map(
    input.products
      .filter((product) => product.company_id === input.companyId)
      .map((product) => [product.id, product] as const),
  );
  const suggestions = new Map<string, ProductSuggestion>();

  for (const alias of input.aliases) {
    if (
      alias.company_id !== input.companyId ||
      alias.supplier_id !== input.line.supplierId ||
      normalizeProductText(alias.description) !== text
    ) {
      continue;
    }
    const product = productById.get(alias.product_id);
    if (!product || !baseUnit(product.unit) || baseUnit(product.unit) !== baseUnit(alias.unit)) {
      continue;
    }
    suggestions.set(product.id, {
      productId: product.id,
      confidence: "exact supplier alias",
      itemsPerPack: alias.items_per_pack,
      contentPerItem: alias.content_per_item,
      unit: alias.unit,
    });
  }

  for (const product of productById.values()) {
    const identity = productIdentity(product);
    if (
      !baseUnit(product.unit) ||
      identity !== textWithoutPack ||
      (evidence?.unit && baseUnit(product.unit) !== baseUnit(evidence.unit))
    ) {
      continue;
    }
    if (!suggestions.has(product.id)) {
      suggestions.set(product.id, {
        productId: product.id,
        confidence: "exact normalized name",
        itemsPerPack: evidence?.itemsPerPack ?? null,
        contentPerItem: evidence?.contentPerItem ?? null,
        unit: evidence?.unit ?? null,
      });
    }
  }

  return [...suggestions.values()];
}
