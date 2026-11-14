import { randomUUID } from "node:crypto";

export interface SupplierPriceQuote {
  supplierId: string;
  supplierName: string;
  price: number;
  currency: string;
  unit: string;
  date: string;
  leadTimeDays: number;
  moq: number;
  isCheapest: boolean;
  savingsPercent?: number;
}

export interface OrsMaterial {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorder_point: number;
  state: string;
  supplierPrices: SupplierPriceQuote[];
}

export interface DevContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  vatNumber?: string;
  address?: string;
  kind: "supplier" | "customer";
  status: "active" | "archived";
  version?: number;
}

export interface OrsItem {
  id?: string;
  [key: string]: any;
}

export let devContacts: DevContact[] = [
  { id: "supplier-greenharvest", name: "GREEN HARVEST PRODUCE LTD.", email: "orders@greenharvest.co.uk", phone: "020 8945 1100", vatNumber: "GB890123456", address: "Wholesale Market, Unit 14, London", kind: "supplier", status: "active", version: 1 },
  { id: "supplier-rkfruits", name: "RK Fruits & Vegetables Limited", email: "rkfruitsnveg@gmail.com", phone: "079 4000 1234", vatNumber: "GB234567890", address: "12 High Street, Southall, UB1 3HA", kind: "supplier", status: "active", version: 1 },
  { id: "supplier-abc", name: "ABC Supplies Ltd", email: "orders@abcsupplies.co.uk", phone: "0161 496 0012", vatNumber: "GB123456789", address: "44 Industrial Park, Manchester", kind: "supplier", status: "active", version: 1 },
  { id: "supplier-northbridge", name: "Northbridge Office Supplies Ltd", email: "sales@northbridge.co.uk", phone: "0113 496 0199", vatNumber: "GB987654321", address: "9 Commercial Way, Leeds", kind: "supplier", status: "active", version: 1 },
  { id: "supplier-westfield", name: "Westfield Wholesale Ltd", email: "orders@westfield.co.uk", phone: "0121 496 0555", vatNumber: "GB456789012", address: "Westfield Hub, Birmingham", kind: "supplier", status: "active", version: 1 },
  { id: "cust-1", name: "Mumbai Fusion", email: "contact@mumbaifusion.co.uk", phone: "020 7946 0911", vatNumber: "GB112233445", address: "88 Curry Mile, London", kind: "customer", status: "active", version: 1 },
  { id: "cust-2", name: "Acme Developments", email: "procurement@acme.co.uk", phone: "020 7946 0145", vatNumber: "GB556677889", address: "20 Tower Bridge Rd, London", kind: "customer", status: "active", version: 1 }
];

export function getDevContacts() {
  return devContacts;
}

export function addDevContact(contact: Partial<DevContact> & { name: string; kind?: "supplier" | "customer" }): DevContact {
  const normName = contact.name.trim();
  const existing = devContacts.find(c => c.name.toLowerCase() === normName.toLowerCase() || (contact.id && c.id === contact.id));
  if (existing) {
    if (contact.email) existing.email = contact.email;
    if (contact.phone) existing.phone = contact.phone;
    if (contact.vatNumber) existing.vatNumber = contact.vatNumber;
    if (contact.address) existing.address = contact.address;
    return existing;
  }
  const id = contact.id || ("supplier-" + normName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30));
  const newContact: DevContact = {
    id,
    name: normName,
    email: contact.email || "",
    phone: contact.phone || "",
    vatNumber: contact.vatNumber || "",
    address: contact.address || "",
    kind: contact.kind || "supplier",
    status: "active",
    version: 1
  };
  devContacts.push(newContact);
  return newContact;
}

let materials: OrsMaterial[] = [
  {
    id: "mat-gh-1",
    sku: "PRD-AVOCADO-01",
    name: "Organic Haas Avocados Box",
    unit: "BOX",
    reorder_point: 20,
    state: "active",
    supplierPrices: [
      { supplierId: "supplier-greenharvest", supplierName: "GREEN HARVEST PRODUCE LTD.", price: 22.50, currency: "GBP", unit: "BOX", date: "2026-11-12", leadTimeDays: 1, moq: 2, isCheapest: true }
    ]
  },
  {
    id: "mat-gh-2",
    sku: "PRD-SPINACH-02",
    name: "Fresh Baby Spinach 500g",
    unit: "PACK",
    reorder_point: 30,
    state: "active",
    supplierPrices: [
      { supplierId: "supplier-greenharvest", supplierName: "GREEN HARVEST PRODUCE LTD.", price: 4.80, currency: "GBP", unit: "PACK", date: "2026-11-12", leadTimeDays: 1, moq: 5, isCheapest: true }
    ]
  },
  {
    id: "mat-gh-3",
    sku: "PRD-TOMATO-03",
    name: "Heritage Tomatoes Tray",
    unit: "TRAY",
    reorder_point: 15,
    state: "active",
    supplierPrices: [
      { supplierId: "supplier-greenharvest", supplierName: "GREEN HARVEST PRODUCE LTD.", price: 18.00, currency: "GBP", unit: "TRAY", date: "2026-11-12", leadTimeDays: 1, moq: 2, isCheapest: true }
    ]
  },
  {
    id: "mat-gh-4",
    sku: "PRD-CUCUMBER-04",
    name: "English Cucumbers Box (14pk)",
    unit: "BOX",
    reorder_point: 10,
    state: "active",
    supplierPrices: [
      { supplierId: "supplier-greenharvest", supplierName: "GREEN HARVEST PRODUCE LTD.", price: 13.70, currency: "GBP", unit: "BOX", date: "2026-11-12", leadTimeDays: 1, moq: 1, isCheapest: true }
    ]
  },
  {
    id: "mat-rk-1",
    sku: "PRD-ONION-RED",
    name: "Red Onion (Sack)",
    unit: "SACK",
    reorder_point: 25,
    state: "active",
    supplierPrices: [
      { supplierId: "supplier-rkfruits", supplierName: "RK Fruits & Vegetables Limited", price: 15.00, currency: "GBP", unit: "SACK", date: "2024-03-08", leadTimeDays: 1, moq: 1, isCheapest: true }
    ]
  },
  {
    id: "mat-1",
    sku: "MAT-STEEL-01",
    name: "Structural Steel Bars 12mm",
    unit: "KG",
    reorder_point: 100,
    state: "active",
    supplierPrices: [
      { supplierId: "supplier-abc", supplierName: "ABC Supplies Ltd", price: 11.20, currency: "GBP", unit: "KG", date: "2026-11-10", leadTimeDays: 2, moq: 50, isCheapest: true, savingsPercent: 24 },
      { supplierId: "supplier-northbridge", supplierName: "Northbridge Office Supplies Ltd", price: 13.50, currency: "GBP", unit: "KG", date: "2026-11-04", leadTimeDays: 3, moq: 20, isCheapest: false }
    ]
  },
  {
    id: "mat-2",
    sku: "MAT-TIMBER-02",
    name: "Treated Timber Beams 4x2",
    unit: "EA",
    reorder_point: 50,
    state: "active",
    supplierPrices: [
      { supplierId: "supplier-westfield", supplierName: "Westfield Wholesale Ltd", price: 18.50, currency: "GBP", unit: "EA", date: "2026-11-08", leadTimeDays: 3, moq: 25, isCheapest: true, savingsPercent: 21 },
      { supplierId: "supplier-abc", supplierName: "ABC Supplies Ltd", price: 21.00, currency: "GBP", unit: "EA", date: "2026-11-01", leadTimeDays: 2, moq: 15, isCheapest: false }
    ]
  }
];

let warehouses: OrsItem[] = [
  { id: "wh-1", code: "WH-MAIN", name: "Main Central Depot", state: "active" },
  { id: "wh-2", code: "WH-NORTH", name: "North Regional Hub", state: "active" }
];

let locations: OrsItem[] = [
  { id: "loc-1", warehouseId: "wh-1", warehouse_code: "WH-MAIN", code: "BAY-A1", name: "Bay A1 Bulk Storage", state: "active" },
  { id: "loc-2", warehouseId: "wh-1", warehouse_code: "WH-MAIN", code: "BAY-B2", name: "Bay B2 Fresh Produce", state: "active" },
  { id: "loc-3", warehouseId: "wh-2", warehouse_code: "WH-NORTH", code: "NORTH-D1", name: "North Bay D1", state: "active" }
];

let requests: OrsItem[] = [
  {
    id: "req-greenharvest-1",
    supplier_id: "supplier-greenharvest",
    supplier_name: "GREEN HARVEST PRODUCE LTD.",
    requested_on: "2026-11-12",
    state: "approved",
    version: 1,
    notes: "Organic fresh produce replenishment",
    lines: [
      { materialId: "mat-gh-1", description: "Organic Haas Avocados Box", quantity: "5", unitPrice: 22.50 },
      { materialId: "mat-gh-2", description: "Fresh Baby Spinach 500g", quantity: "10", unitPrice: 4.80 },
      { materialId: "mat-gh-3", description: "Heritage Tomatoes Tray", quantity: "8", unitPrice: 18.00 },
      { materialId: "mat-gh-4", description: "English Cucumbers Box (14pk)", quantity: "3", unitPrice: 13.70 }
    ]
  },
  {
    id: "req-rkfruits-110",
    supplier_id: "supplier-rkfruits",
    supplier_name: "RK Fruits & Vegetables Limited",
    requested_on: "2024-03-08",
    state: "approved",
    version: 1,
    notes: "Weekly wholesale vegetables order",
    lines: [
      { materialId: "mat-rk-1", description: "Red onion", quantity: "1", unitPrice: 15.00 },
      { materialId: "mat-rk-2", description: "Onions", quantity: "3", unitPrice: 14.50 }
    ]
  },
  {
    id: "req-1",
    supplier_id: "supplier-abc",
    supplier_name: "ABC Supplies Ltd",
    requested_on: "2026-11-10",
    state: "approved",
    version: 1,
    notes: "Urgent site delivery",
    lines: [{ materialId: "mat-1", quantity: "150" }]
  },
  {
    id: "req-2",
    supplier_id: "supplier-northbridge",
    supplier_name: "Northbridge Office Supplies Ltd",
    requested_on: "2026-11-11",
    state: "ordered",
    version: 1,
    notes: "Standard restocking",
    lines: [{ materialId: "mat-2", quantity: "80" }]
  }
];

let orders: OrsItem[] = [
  {
    id: "po-greenharvest-1",
    supplier_id: "supplier-greenharvest",
    supplier_name: "GREEN HARVEST PRODUCE LTD.",
    ordered_on: "2026-11-12",
    state: "ordered",
    version: 1,
    invoice_number: "GH-89021",
    total_amount: 345.80,
    currency: "GBP",
    lines: [
      { position: 1, materialId: "mat-gh-1", description: "Organic Haas Avocados Box", quantity: "5", receivedQuantity: "5", unitPrice: 22.50 },
      { position: 2, materialId: "mat-gh-2", description: "Fresh Baby Spinach 500g", quantity: "10", receivedQuantity: "10", unitPrice: 4.80 },
      { position: 3, materialId: "mat-gh-3", description: "Heritage Tomatoes Tray", quantity: "8", receivedQuantity: "8", unitPrice: 18.00 },
      { position: 4, materialId: "mat-gh-4", description: "English Cucumbers Box (14pk)", quantity: "3", receivedQuantity: "3", unitPrice: 13.70 }
    ]
  },
  {
    id: "po-rkfruits-110",
    supplier_id: "supplier-rkfruits",
    supplier_name: "RK Fruits & Vegetables Limited",
    ordered_on: "2024-03-08",
    state: "ordered",
    version: 1,
    invoice_number: "INV-000110",
    total_amount: 212.50,
    currency: "GBP",
    lines: [
      { position: 1, materialId: "mat-rk-1", description: "Red onion", quantity: "1", receivedQuantity: "1", unitPrice: 15.00 },
      { position: 2, materialId: "mat-rk-2", description: "Onions", quantity: "3", receivedQuantity: "3", unitPrice: 14.50 },
      { position: 3, materialId: "mat-rk-3", description: "Button mushroom", quantity: "1", receivedQuantity: "1", unitPrice: 13.00 },
      { position: 4, materialId: "mat-rk-4", description: "Piper", quantity: "1", receivedQuantity: "1", unitPrice: 16.00 },
      { position: 5, materialId: "mat-rk-5", description: "Peeld garlic Box", quantity: "1", receivedQuantity: "1", unitPrice: 19.00 },
      { position: 6, materialId: "mat-rk-6", description: "Bird eye chilli", quantity: "1", receivedQuantity: "1", unitPrice: 8.00 },
      { position: 7, materialId: "mat-rk-7", description: "Spinich (PALAK)", quantity: "1", receivedQuantity: "1", unitPrice: 12.00 },
      { position: 8, materialId: "mat-rk-8", description: "Aubergine 400", quantity: "1", receivedQuantity: "1", unitPrice: 15.00 },
      { position: 9, materialId: "mat-rk-9", description: "Cabbage", quantity: "1", receivedQuantity: "1", unitPrice: 10.00 },
      { position: 10, materialId: "mat-rk-10", description: "Coriandar", quantity: "2", receivedQuantity: "2", unitPrice: 11.00 },
      { position: 11, materialId: "mat-rk-11", description: "Vine tomato", quantity: "2", receivedQuantity: "2", unitPrice: 9.00 },
      { position: 12, materialId: "mat-rk-12", description: "Mint Bunches", quantity: "1", receivedQuantity: "1", unitPrice: 10.00 }
    ]
  },
  {
    id: "po-1",
    supplier_id: "supplier-abc",
    supplier_name: "ABC Supplies Ltd",
    ordered_on: "2026-11-10",
    state: "ordered",
    version: 1,
    invoice_number: "ABC-1004",
    total_amount: 1680.00,
    currency: "GBP",
    lines: [{ position: 1, materialId: "mat-1", description: "Structural Steel Bars 12mm", quantity: "150", receivedQuantity: "50", unitPrice: 11.20 }]
  },
  {
    id: "po-2",
    supplier_id: "supplier-northbridge",
    supplier_name: "Northbridge Office Supplies Ltd",
    ordered_on: "2026-11-11",
    state: "part_received",
    version: 1,
    invoice_number: "NB-7821",
    total_amount: 1480.00,
    currency: "GBP",
    lines: [{ position: 1, materialId: "mat-2", description: "Treated Timber Beams 4x2", quantity: "80", receivedQuantity: "40", unitPrice: 18.50 }]
  }
];

let balances: OrsItem[] = [
  { sku: "PRD-AVOCADO-01", warehouse_code: "WH-MAIN", location_code: "BAY-B2", on_hand: 25, reserved: 5 },
  { sku: "PRD-SPINACH-02", warehouse_code: "WH-MAIN", location_code: "BAY-B2", on_hand: 50, reserved: 10 },
  { sku: "PRD-ONION-RED", warehouse_code: "WH-MAIN", location_code: "BAY-B2", on_hand: 40, reserved: 0 },
  { sku: "MAT-STEEL-01", warehouse_code: "WH-MAIN", location_code: "BAY-A1", on_hand: 450, reserved: 50 },
  { sku: "MAT-TIMBER-02", warehouse_code: "WH-MAIN", location_code: "BAY-B2", on_hand: 220, reserved: 20 }
];

let movements: OrsItem[] = [
  { kind: "Receipt", on_hand_delta: 25, reserved_delta: 0, reference: "GRN-GH-001", created_at: "2026-11-12T09:00:00Z" },
  { kind: "Receipt", on_hand_delta: 50, reserved_delta: 0, reference: "GRN-2026-001", created_at: "2026-11-10T10:00:00Z" },
  { kind: "Sales Allocation", on_hand_delta: 0, reserved_delta: 20, reference: "SO-2026-088", created_at: "2026-11-11T14:30:00Z" }
];

let receipts: OrsItem[] = [
  { id: "grn-gh-1", reference: "GRN-GH-001", received_on: "2026-11-12", state: "received", purchase_order_id: "po-greenharvest-1", supplier_name: "GREEN HARVEST PRODUCE LTD." },
  { id: "grn-1", reference: "GRN-2026-001", received_on: "2026-11-10", state: "received", purchase_order_id: "po-1", supplier_name: "ABC Supplies Ltd" }
];

let sales: OrsItem[] = [
  { id: "so-1", customer_id: "cust-1", customer_name: "Mumbai Fusion", ordered_on: "2026-11-11", state: "picking", version: 1, lines: [{ materialId: "mat-gh-1", locationId: "loc-2", quantity: "5" }] }
];

let matches: OrsItem[] = [
  { id: "match-1", number: "INV-000110", supplier_name: "RK Fruits & Vegetables Limited", invoice_state: "confirmed", status: "matched", purchase_order_id: "po-rkfruits-110", goods_receipt_id: "grn-1" },
  { id: "match-2", number: "GH-89021", supplier_name: "GREEN HARVEST PRODUCE LTD.", invoice_state: "confirmed", status: "matched", purchase_order_id: "po-greenharvest-1", goods_receipt_id: "grn-gh-1" }
];

let devSupplierInvoices: OrsItem[] = [
  {
    document_id: "doc-gh-1",
    id: "doc-gh-1",
    original_name: "GH-89021.pdf",
    supplier_id: "supplier-greenharvest",
    supplier_name: "GREEN HARVEST PRODUCE LTD.",
    state: "confirmed",
    version: 1,
    payload: {
      invoiceNumber: "GH-89021",
      supplier: "GREEN HARVEST PRODUCE LTD.",
      lines: [
        { materialId: "mat-gh-1", description: "Organic Haas Avocados Box", quantity: 5, unitPrice: 22.50 },
        { materialId: "mat-gh-2", description: "Fresh Baby Spinach 500g", quantity: 10, unitPrice: 4.80 }
      ]
    }
  },
  {
    document_id: "doc-rk-1",
    id: "doc-rk-1",
    original_name: "INV-000110.pdf",
    supplier_id: "supplier-rkfruits",
    supplier_name: "RK Fruits & Vegetables Limited",
    state: "confirmed",
    version: 1,
    payload: {
      invoiceNumber: "INV-000110",
      supplier: "RK Fruits & Vegetables Limited",
      lines: [
        { materialId: "mat-rk-1", description: "Red onion", quantity: 1, unitPrice: 15.00 },
        { materialId: "mat-rk-2", description: "Onions", quantity: 3, unitPrice: 14.50 }
      ]
    }
  }
];

export interface DevShoppingUnit {
  code: "pcs" | "kg" | "g" | "l" | "box";
  baseUnit: string;
  baseQuantityPerUnit: string;
}

export interface DevShoppingProductSupplier {
  id: string;
  name: string;
  source: "historical_order" | "manager_confirmed";
  productName: string | null;
  sku: string | null;
}

export interface DevShoppingProduct {
  id: string;
  sku: string;
  name: string;
  stock_unit: string;
  category: string;
  image_path: string | null;
  price_product_id: string | null;
  listed: boolean;
  version: number;
  historicalPrices: Array<{
    supplierId: string;
    supplierName: string;
    date: string;
    currency: "GBP" | "EUR" | "USD";
    unitPrice: string;
    unit: "kg" | "l" | "each";
    taxTreatment: string;
  }>;
  units: DevShoppingUnit[];
  suppliers: DevShoppingProductSupplier[];
}

export interface DevShoppingLine {
  id: string;
  materialId: string;
  sku: string;
  name: string;
  actualName?: string | null;
  actualSku?: string | null;
  quantity: string;
  unit: DevShoppingUnit["code"];
  baseUnit: string;
  baseQuantityPerUnit: string;
  note: string | null;
  state: string;
  actualQuantity?: string | null;
  actualUnit?: string | null;
  actualUnitPrice?: string | null;
  actualCurrency?: string | null;
  substitutionNote?: string | null;
  buyerNote?: string | null;
}

export interface DevShoppingGroup {
  id: string;
  supplier_id: string;
  supplier_name: string;
  state: string;
  purchase_request_id: string | null;
  purchase_order_id: string | null;
  version: number;
  lines: DevShoppingLine[];
}

export interface DevShoppingRequisition {
  id: string;
  requested_by: string;
  assigned_buyer_id: string | null;
  state: string;
  required_on: string | null;
  priority: string;
  instructions: string | null;
  version: number;
  groups: DevShoppingGroup[];
}

export let devShoppingRequisitions: Record<string, DevShoppingRequisition> = {};

export let devCart: DevShoppingRequisition = {
  id: "req-cart-active",
  requested_by: "Raj Soni",
  assigned_buyer_id: null,
  state: "draft",
  required_on: null,
  priority: "normal",
  instructions: null,
  version: 1,
  groups: []
};

export function getShoppingCatalogue(): DevShoppingProduct[] {
  return materials.map((m) => {
    const prices = m.supplierPrices || [];
    const suppliers: DevShoppingProductSupplier[] = prices.length > 0
      ? prices.map((p) => ({
          id: p.supplierId,
          name: p.supplierName,
          source: "manager_confirmed" as const,
          productName: m.name,
          sku: m.sku
        }))
      : [
          {
            id: "supplier-greenharvest",
            name: "GREEN HARVEST PRODUCE LTD.",
            source: "manager_confirmed" as const,
            productName: m.name,
            sku: m.sku
          }
        ];

    const historicalPrices = prices.map((p) => ({
      supplierId: p.supplierId,
      supplierName: p.supplierName,
      date: p.date || new Date().toISOString().slice(0, 10),
      currency: (p.currency === "EUR" || p.currency === "USD" ? p.currency : "GBP") as "GBP" | "EUR" | "USD",
      unitPrice: String(p.price || 10),
      unit: "each" as const,
      taxTreatment: "standard"
    }));

    const unitCode: DevShoppingUnit["code"] =
      m.unit?.toLowerCase() === "box" ? "box" :
      m.unit?.toLowerCase() === "kg" ? "kg" :
      m.unit?.toLowerCase() === "l" ? "l" :
      m.unit?.toLowerCase() === "g" ? "g" : "pcs";

    return {
      id: m.id,
      sku: m.sku,
      name: m.name,
      stock_unit: m.unit || "EA",
      category: m.sku.startsWith("MAT-TIMBER") || m.sku.startsWith("MAT-CEMENT") ? "Timber & Building" : "Groceries & Produce",
      image_path: null,
      price_product_id: m.id,
      listed: m.state === "active",
      version: 1,
      historicalPrices,
      units: [
        { code: unitCode, baseUnit: m.unit || "EA", baseQuantityPerUnit: "1" },
        { code: "pcs", baseUnit: m.unit || "EA", baseQuantityPerUnit: "1" }
      ],
      suppliers
    };
  });
}

export async function handleDevOrs(request: Request, segments: string[]): Promise<Response> {
  const method = request.method;
  const [first, second, third] = segments;

  if (method === "GET") {
    if (first === "catalogue") {
      return Response.json({ data: { materials, warehouses, locations } });
    }
    if (first === "browse") {
      if (second === "materials") return Response.json({ data: { items: materials, after: null } });
      if (second === "goods-receipts") return Response.json({ data: { items: receipts, after: null } });
      if (second === "purchase-requests") return Response.json({ data: { items: requests, after: null } });
      if (second === "purchase-orders") return Response.json({ data: { items: orders, after: null } });
      return Response.json({ data: { items: [], after: null } });
    }

    if (first === "materials") {
      if (second) {
        const mat = materials.find(m => m.id === second);
        return Response.json({ data: mat || materials[0] });
      }
      return Response.json({ data: materials });
    }

    if (first === "purchase-orders") {
      if (second) {
        const po = orders.find(o => o.id === second);
        return Response.json({ data: po || orders[0] });
      }
      return Response.json({ data: orders });
    }

    if (first === "purchase-requests") {
      if (second) {
        const req = requests.find(r => r.id === second);
        return Response.json({ data: req || requests[0] });
      }
      return Response.json({ data: requests });
    }

    if (first === "goods-receipts") {
      if (second) {
        const rec = receipts.find(r => r.id === second);
        return Response.json({ data: rec || receipts[0] });
      }
      return Response.json({ data: receipts });
    }

    if (first === "supplier-invoices") {
      if (second) {
        const inv = devSupplierInvoices.find(i => i.id === second || i.document_id === second);
        return Response.json(inv || devSupplierInvoices[0] || {});
      }
      return Response.json(devSupplierInvoices);
    }

    if (first === "inventory") return Response.json({ data: { balances, movements, receipts } });
    if (first === "sales-orders") return Response.json({ data: sales });
    if (first === "invoice-matches") return Response.json({ data: matches });

    if (first === "shopping") {
      if (second === "catalogue") {
        return Response.json({ data: getShoppingCatalogue() });
      }
      if (second === "cart") {
        return Response.json({ data: devCart });
      }
      if (second === "buyers") {
        return Response.json({
          data: {
            items: [
              { id: "buyer-1", name: "Raj Soni", role: "Procurement Lead" },
              { id: "buyer-2", name: "Sarah Jenkins", role: "Operations Manager" }
            ],
            canAssign: true
          }
        });
      }
      if (second === "inbox") {
        const rows = Object.values(devShoppingRequisitions).map(r => ({
          id: r.id,
          state: r.state,
          required_on: r.required_on,
          priority: r.priority,
          version: r.version,
          line_count: r.groups.reduce((n, g) => n + g.lines.length, 0)
        }));
        return Response.json({ data: rows });
      }
      if (second === "requisitions") {
        if (third) {
          const found = devShoppingRequisitions[third] || devCart;
          return Response.json({ data: found });
        }
        return Response.json({ data: Object.values(devShoppingRequisitions) });
      }
      if (second === "offers") {
        const catalogue = getShoppingCatalogue();
        const items = catalogue.flatMap(prod =>
          prod.suppliers.map(sup => ({
            material_id: prod.id,
            supplier_id: sup.id,
            supplier_name: sup.name,
            unit_code: prod.units[0]?.code || "pcs",
            unit_price: "15.00",
            currency: "GBP",
            min_quantity: "1",
            lead_time_days: 2,
            valid_until: null
          }))
        );
        return Response.json({ data: { ready: true, items, reason: "" } });
      }
      if (second === "orders") {
        if (third) {
          const found = orders.find(o => o.id === third);
          return Response.json({
            data: {
              ready: true,
              items: found ? [found] : [],
              lines: found?.lines || [],
              actions: []
            }
          });
        }
        return Response.json({ data: { ready: true, items: orders, lines: [], actions: [] } });
      }
      if (second === "quote") {
        return Response.json({
          data: {
            requisitionId: third || devCart.id,
            version: devCart.version || 1,
            fingerprint: "quote-1",
            groups: []
          }
        });
      }
      return Response.json({ data: [] });
    }
  }

  if (method === "POST" || method === "PUT") {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const newId = randomUUID();

    // 1. Supplier invoices and purchase orders
    if (first === "supplier-invoices" || first === "purchase-orders") {
      const rawSupplierName = body.supplier || body.supplierName || body.supplier_name || "GREEN HARVEST PRODUCE LTD.";
      const contact = addDevContact({ name: rawSupplierName, kind: "supplier" });
      const supplierName = contact.name;
      const supplierId = contact.id;

      const rawLines = body.lines || body.lineItems || [];
      const lines = rawLines.map((l: any, idx: number) => ({
        position: idx + 1,
        materialId: l.materialId || `mat-${idx + 1}`,
        description: l.description || `Item ${idx + 1}`,
        quantity: String(l.quantity || 1),
        receivedQuantity: String(l.quantity || 1),
        unitPrice: Number(l.unitPrice || l.price || 0)
      }));

      const newPo = {
        id: newId,
        supplier_id: supplierId,
        supplier_name: supplierName,
        ordered_on: body.invoiceDate || body.orderedOn || new Date().toISOString().slice(0, 10),
        state: "ordered",
        version: 1,
        invoice_number: body.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`,
        total_amount: Number(body.total || body.totalAmount || body.subtotal || 0),
        currency: body.currency || "GBP",
        lines: lines.length > 0 ? lines : [{ position: 1, materialId: "mat-1", description: "Wholesale items", quantity: "1", receivedQuantity: "1", unitPrice: 100 }]
      };

      orders.unshift(newPo);
      requests.unshift({
        id: newId,
        supplier_id: supplierId,
        supplier_name: supplierName,
        requested_on: newPo.ordered_on,
        state: "approved",
        version: 1,
        lines: newPo.lines
      });

      // Also register in supplier invoices list
      devSupplierInvoices.unshift({
        document_id: newId,
        id: newId,
        original_name: (newPo.invoice_number || "invoice") + ".pdf",
        supplier_id: supplierId,
        supplier_name: supplierName,
        state: "confirmed",
        version: 1,
        payload: {
          invoiceNumber: newPo.invoice_number,
          supplier: supplierName,
          lines: newPo.lines
        }
      });

      // Also register new catalogue products
      for (const line of newPo.lines) {
        if (!materials.some(m => m.name.toLowerCase() === line.description.toLowerCase())) {
          const sku = "PRD-" + line.description.toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 15);
          materials.unshift({
            id: `mat-${randomUUID()}`,
            sku,
            name: line.description,
            unit: "EA",
            reorder_point: 10,
            state: "active",
            supplierPrices: [
              {
                supplierId,
                supplierName,
                price: line.unitPrice,
                currency: newPo.currency,
                unit: "EA",
                date: newPo.ordered_on,
                leadTimeDays: 2,
                moq: 1,
                isCheapest: true
              }
            ]
          });
        }
      }

      return Response.json({ data: { id: newId, version: 1, purchaseOrderId: newId }, message: "Purchase order created in ORS." });
    }

    // 2. Purchase requests state transitions or creation
    if (first === "purchase-requests") {
      if (second && third) {
        // e.g. purchase-requests/[id]/approve or purchase-requests/[id]/purchase-order
        const req = requests.find(r => r.id === second);
        if (req) {
          if (third === "approve") req.state = "approved";
          else if (third === "reject") req.state = "rejected";
          else if (third === "purchase-order") {
            req.state = "ordered";
            orders.unshift({
              id: `po-${randomUUID()}`,
              supplier_id: req.supplier_id,
              supplier_name: req.supplier_name,
              ordered_on: new Date().toISOString().slice(0, 10),
              state: "ordered",
              version: 1,
              lines: req.lines
            });
          }
          req.version = (req.version || 1) + 1;
          return Response.json({ data: req, message: "Purchase request updated." });
        }
      }

      const supplier = devContacts.find(c => c.id === body.supplierId) || devContacts[0];
      const newReq = {
        id: newId,
        supplier_id: body.supplierId || supplier.id,
        supplier_name: supplier.name,
        requested_on: body.requestedOn || new Date().toISOString().slice(0, 10),
        state: "draft",
        version: 1,
        notes: body.notes || "",
        lines: body.lines || []
      };
      requests.unshift(newReq);
      return Response.json({ data: { id: newId, version: 1 }, message: "Purchase request created." });
    }

    // 3. Goods receipts
    if (first === "goods-receipts") {
      const order = orders.find(o => o.id === body.purchaseOrderId) || orders[0];
      const newReceipt = {
        id: newId,
        reference: body.reference || `GRN-${Date.now().toString().slice(-4)}`,
        received_on: body.receivedOn || new Date().toISOString().slice(0, 10),
        state: "received",
        purchase_order_id: body.purchaseOrderId || order?.id || "po-1",
        supplier_name: order?.supplier_name || "Supplier"
      };
      receipts.unshift(newReceipt);
      movements.unshift({
        kind: "Receipt",
        on_hand_delta: 50,
        reserved_delta: 0,
        reference: newReceipt.reference,
        created_at: new Date().toISOString()
      });
      return Response.json({ data: { id: newId, version: 1 }, message: "Goods receipt processed." });
    }

    // 4. Materials
    if (first === "materials") {
      const basePrice = Math.floor(Math.random() * 20) + 10;
      const newMat: OrsMaterial = {
        id: newId,
        sku: body.sku || `MAT-${Date.now().toString().slice(-4)}`,
        name: body.name || "New Material",
        unit: body.unit || "EA",
        reorder_point: Number(body.reorderPoint || 10),
        state: "active",
        supplierPrices: [
          {
            supplierId: "supplier-greenharvest",
            supplierName: "GREEN HARVEST PRODUCE LTD.",
            price: basePrice,
            currency: "GBP",
            unit: body.unit || "EA",
            date: new Date().toISOString().slice(0, 10),
            leadTimeDays: 1,
            moq: 5,
            isCheapest: true
          }
        ]
      };
      materials.unshift(newMat);
      return Response.json({ data: { id: newId, version: 1 }, message: "Material added to catalogue." });
    }

    // 5. Warehouses & locations
    if (first === "warehouses") {
      const newWh = { id: newId, code: body.code || "WH-NEW", name: body.name || "New Warehouse", state: "active" };
      warehouses.push(newWh);
      return Response.json({ data: { id: newId, version: 1 }, message: "Warehouse created." });
    }

    if (first === "locations") {
      const newLoc = { id: newId, warehouseId: body.warehouseId || "wh-1", warehouse_code: "WH-MAIN", code: body.code || "LOC-1", name: body.name || "Location", state: "active" };
      locations.push(newLoc);
      return Response.json({ data: { id: newId, version: 1 }, message: "Stock location created." });
    }

    // 6. Stock transfers & adjustments
    if (first === "stock-transfers") {
      movements.unshift({
        kind: "Transfer",
        on_hand_delta: 0,
        reserved_delta: 0,
        reference: body.reference || "ST-001",
        created_at: new Date().toISOString()
      });
      return Response.json({ data: { id: newId }, message: "Stock transfer recorded." });
    }

    if (first === "stock-adjustments") {
      const delta = Number(body.quantity || 0);
      movements.unshift({
        kind: "Adjustment",
        on_hand_delta: delta,
        reserved_delta: 0,
        reference: body.reason || "Inventory count adjustment",
        created_at: new Date().toISOString()
      });
      return Response.json({ data: { id: newId }, message: "Stock adjustment recorded." });
    }

    // 7. Sales orders and workflow transitions
    if (first === "sales-orders") {
      if (second && third) {
        // Transition: e.g. sales-orders/[id]/approve, picking, packed, dispatched, returned
        const sale = sales.find(s => s.id === second);
        if (sale) {
          const nextStateMap: Record<string, string> = {
            approve: "approved",
            picking: "picking",
            packed: "packed",
            dispatched: "dispatched",
            returned: "returned"
          };
          sale.state = nextStateMap[third] || body.state || third;
          sale.version = (sale.version || 1) + 1;
          return Response.json({ data: sale, message: `Sales order updated to ${sale.state}.` });
        }
      }

      const newSale = {
        id: newId,
        customer_id: body.customerId || "cust-1",
        customer_name: "Mumbai Fusion",
        ordered_on: body.orderedOn || new Date().toISOString().slice(0, 10),
        state: "draft",
        version: 1,
        notes: body.notes || "",
        lines: body.lines || []
      };
      sales.unshift(newSale);
      return Response.json({ data: { id: newId, version: 1 }, message: "Sales order placed." });
    }

    // 8. Invoice matches
    if (first === "invoice-matches") {
      const match = {
        id: newId,
        invoice_id: body.invoiceId,
        purchase_order_id: body.purchaseOrderId,
        goods_receipt_id: body.goodsReceiptId,
        status: "matched",
        invoice_state: "confirmed"
      };
      matches.unshift(match);
      return Response.json({ data: match, message: "Invoice matched to order and receipt." });
    }

    // 9. Shopping
    if (first === "shopping") {
      if (second === "cart" && third === "items") {
        const mat = materials.find(m => m.id === body.materialId);
        const supplier = devContacts.find(c => c.id === body.supplierId) || { id: body.supplierId || "supplier-1", name: "Preferred Supplier" };
        let group = devCart.groups.find(g => g.supplier_id === supplier.id);
        if (!group) {
          group = {
            id: `grp-${randomUUID()}`,
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            state: "draft",
            purchase_request_id: null,
            purchase_order_id: null,
            version: 1,
            lines: []
          };
          devCart.groups.push(group);
        }
        const unitCode: DevShoppingUnit["code"] =
          body.unit === "box" || body.unit === "kg" || body.unit === "g" || body.unit === "l" ? body.unit : "pcs";
        const newLine: DevShoppingLine = {
          id: `line-${randomUUID()}`,
          materialId: body.materialId,
          sku: mat?.sku || "SKU-ITEM",
          name: mat?.name || "Item",
          quantity: String(body.quantity || "1"),
          unit: unitCode,
          baseUnit: mat?.unit || "EA",
          baseQuantityPerUnit: "1",
          note: body.note || null,
          state: "pending"
        };
        group.lines.push(newLine);
        devCart.version = (devCart.version || 1) + 1;
        return Response.json({ data: devCart, message: "Added to cart" });
      }

      if (second === "assign") {
        const assignedReq: DevShoppingRequisition = {
          ...devCart,
          assigned_buyer_id: body.buyerId,
          priority: body.priority || "normal",
          required_on: body.requiredOn || null,
          instructions: body.instructions || null,
          state: "accepted",
          version: (devCart.version || 1) + 1
        };
        devShoppingRequisitions[assignedReq.id] = assignedReq;
        // reset devCart
        devCart = {
          id: `req-cart-${randomUUID()}`,
          requested_by: "Raj Soni",
          assigned_buyer_id: null,
          state: "draft",
          required_on: null,
          priority: "normal",
          instructions: null,
          version: 1,
          groups: []
        };
        return Response.json({ data: assignedReq, message: "Requisition assigned" });
      }

      if (second === "requisitions" && segments[3] && segments[4] === "lines" && segments[5] === "reconcile") {
        const reqId = segments[2];
        const req = devShoppingRequisitions[reqId] || devCart;
        if (req) {
          for (const group of req.groups) {
            const line = group.lines.find(l => l.id === body.lineId);
            if (line) {
              line.state = body.state || "purchased";
              if (body.actualQuantity) line.actualQuantity = String(body.actualQuantity);
              if (body.actualUnit) line.actualUnit = body.actualUnit;
              if (body.unitPrice) line.actualUnitPrice = String(body.unitPrice);
              if (body.currency) line.actualCurrency = body.currency;
              if (body.substitutionNote) line.substitutionNote = body.substitutionNote;
              if (body.buyerNote) line.buyerNote = body.buyerNote;
            }
          }
          req.version = (req.version || 1) + 1;
          return Response.json({ data: req, message: "Purchase reconciled" });
        }
      }

      if (second === "checkout") {
        return Response.json({
          data: {
            orders: [
              {
                id: `po-${randomUUID()}`,
                reference: `PO-${Date.now().toString().slice(-4)}`,
                supplierName: "GREEN HARVEST PRODUCE LTD.",
                state: "pending",
                message: "Order placed successfully",
                url: "#"
              }
            ]
          }
        });
      }
    }

    return Response.json({ data: { id: newId, version: 1 }, message: "Saved successfully." });
  }

  if (method === "PATCH") {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    if (first === "shopping") {
      if (second === "cart" && third === "items") {
        for (const group of devCart.groups) {
          const line = group.lines.find(l => l.id === body.lineId);
          if (line) {
            if (body.quantity) line.quantity = String(body.quantity);
            if (body.unit) line.unit = body.unit;
            if (body.note !== undefined) line.note = body.note;
          }
        }
        devCart.version = (devCart.version || 1) + 1;
        return Response.json({ data: devCart, message: "Cart line updated" });
      }

      if (second === "catalogue") {
        return Response.json({ data: { success: true }, message: "Settings saved" });
      }

      if (second === "requisitions" && third && segments[3] === "state") {
        const req = devShoppingRequisitions[third] || devCart;
        if (req) {
          req.state = body.state || req.state;
          req.version = (req.version || 1) + 1;
          return Response.json({ data: req, message: "Requisition state updated" });
        }
      }
    }

    return Response.json({ data: { success: true }, message: "Updated" });
  }

  if (method === "DELETE") {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    if (first === "shopping") {
      if (second === "cart" && third === "items") {
        for (const group of devCart.groups) {
          group.lines = group.lines.filter(l => l.id !== body.lineId);
        }
        devCart.groups = devCart.groups.filter(g => g.lines.length > 0);
        devCart.version = (devCart.version || 1) + 1;
        return Response.json({ data: devCart, message: "Item removed from cart" });
      }
    }

    return Response.json({ data: { success: true }, message: "Deleted" });
  }

  return Response.json({ data: [] });
}
