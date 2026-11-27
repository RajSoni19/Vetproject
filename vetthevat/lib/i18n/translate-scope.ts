// Pages where the language switcher may use Google Translate: the public site and, since the product
// owner approved it (2026-11-27), the signed-in workspace too. Business data on those pages (supplier and
// product names, amounts, invoice numbers) is marked translate="no" and is not translated. Admin pages,
// the API, and pages whose links carry secret tokens never use it. Kept in sync with the privateRoutes
// list in next.config.ts (the security policy).
const privatePrefixes = ["/super-admin", "/api", "/reset-password", "/verify-email"];

export function machineTranslationAllowed(pathname: string) {
  return !privatePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

// Brand names Google must not translate ("VET THE VAT" became "वैट की पशु
// चिकित्सक" — vet as in veterinarian). Each occurrence in page text is wrapped in
// <span translate="no">, which Google Translate leaves as is.
const BRAND = /VET\s+THE\s+VAT|Vet\s+The\s+Vat|VetTheVat/g;

export function protectBrandNames(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('[translate="no"], .notranslate, script, style, textarea, input')) return NodeFilter.FILTER_REJECT;
      BRAND.lastIndex = 0;
      return BRAND.test(node.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.nodeValue ?? "";
    const fragment = document.createDocumentFragment();
    let last = 0;
    BRAND.lastIndex = 0;
    for (const match of text.matchAll(BRAND)) {
      fragment.append(text.slice(last, match.index));
      const span = document.createElement("span");
      span.setAttribute("translate", "no");
      span.className = "notranslate";
      span.textContent = match[0];
      fragment.append(span);
      last = match.index + match[0].length;
    }
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }
}
