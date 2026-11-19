"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Users,
  CheckCircle2,
  DollarSign,
  AlertTriangle,
  Send,
  Download,
  Mail,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Package,
  Layers,
  ChevronRight,
  Check
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { OrsMaterial } from "@/lib/server/ors/dev-ors";

export interface ComparisonProduct {
  id: string;
  name: string;
  subtitle: string;
  packSize: string;
  unit: string;
  icon: string;
  category: string;
  suppliers: {
    [key: string]: {
      pricePerUnit: number;
      packPrice?: number;
      delta?: number; // positive = increased, negative = decreased
      deltaText?: string;
    };
  };
  bestSupplier: string;
  bestPrice: number;
  savingsPercent: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  suggestedSupplier: string;
  supplierCode: "A" | "B" | "C" | "D";
  unitPrice: number;
  lineTotal: number;
}

export interface PriceAlert {
  id: string;
  productName: string;
  icon: string;
  lastPrice: number;
  currentPrice: number;
  increasePercent: number;
  windowWeeks: number; // e.g. 10 or 12 weeks
}

const DEFAULT_PRODUCTS: ComparisonProduct[] = [
  {
    id: "prod-chicken",
    name: "Chicken Breast",
    subtitle: "Fresh, Boneless",
    packSize: "5 kg",
    unit: "kg",
    icon: "🍗",
    category: "Meat & Poultry",
    suppliers: {
      "Supplier A": { pricePerUnit: 5.90, packPrice: 29.50 },
      "Supplier B": { pricePerUnit: 5.20, packPrice: 26.00 },
      "Supplier C": { pricePerUnit: 5.85, packPrice: 29.25 },
      "Supplier D": { pricePerUnit: 6.10, packPrice: 30.50 }
    },
    bestSupplier: "Supplier B",
    bestPrice: 5.20,
    savingsPercent: 12
  },
  {
    id: "prod-oil",
    name: "Cooking Oil",
    subtitle: "Vegetable",
    packSize: "10 L",
    unit: "L",
    icon: "🛢️",
    category: "Oils & Vinegars",
    suppliers: {
      "Supplier A": { pricePerUnit: 14.50, delta: 1.30, deltaText: "+£1.30" },
      "Supplier B": { pricePerUnit: 13.20, delta: -1.10, deltaText: "-£1.10" },
      "Supplier C": { pricePerUnit: 15.10, delta: 0.90, deltaText: "+£0.90" },
      "Supplier D": { pricePerUnit: 14.00 }
    },
    bestSupplier: "Supplier B",
    bestPrice: 13.20,
    savingsPercent: 9
  },
  {
    id: "prod-cola",
    name: "Coca Cola",
    subtitle: "24 x 330ml",
    packSize: "24 cans",
    unit: "cases",
    icon: "🥤",
    category: "Beverages",
    suppliers: {
      "Supplier A": { pricePerUnit: 10.49 },
      "Supplier B": { pricePerUnit: 9.99 },
      "Supplier C": { pricePerUnit: 11.20 },
      "Supplier D": { pricePerUnit: 10.75 }
    },
    bestSupplier: "Supplier B",
    bestPrice: 9.99,
    savingsPercent: 11
  },
  {
    id: "prod-mozzarella",
    name: "Mozzarella",
    subtitle: "Grated",
    packSize: "2.5 kg",
    unit: "kg",
    icon: "🧀",
    category: "Dairy & Cheese",
    suppliers: {
      "Supplier A": { pricePerUnit: 13.50 },
      "Supplier B": { pricePerUnit: 12.99 },
      "Supplier C": { pricePerUnit: 14.20 },
      "Supplier D": { pricePerUnit: 13.75 }
    },
    bestSupplier: "Supplier B",
    bestPrice: 12.99,
    savingsPercent: 4
  },
  {
    id: "prod-tomatoes",
    name: "Tomatoes",
    subtitle: "Fresh",
    packSize: "6 kg",
    unit: "boxes",
    icon: "🍅",
    category: "Fresh Produce",
    suppliers: {
      "Supplier A": { pricePerUnit: 8.40 },
      "Supplier B": { pricePerUnit: 7.95 },
      "Supplier C": { pricePerUnit: 8.60 },
      "Supplier D": { pricePerUnit: 8.50 }
    },
    bestSupplier: "Supplier B",
    bestPrice: 7.95,
    savingsPercent: 6
  },
  {
    id: "prod-cleaning",
    name: "Cleaning Spray",
    subtitle: "Multi-surface",
    packSize: "750 ml",
    unit: "bottles",
    icon: "🧴",
    category: "Cleaning & Hygiene",
    suppliers: {
      "Supplier A": { pricePerUnit: 1.89 },
      "Supplier B": { pricePerUnit: 1.65 },
      "Supplier C": { pricePerUnit: 1.90 },
      "Supplier D": { pricePerUnit: 1.85 }
    },
    bestSupplier: "Supplier B",
    bestPrice: 1.65,
    savingsPercent: 13
  }
];

const DEFAULT_ORDERS: OrderItem[] = [
  {
    id: "ord-1",
    productId: "prod-chicken",
    productName: "Chicken Breast",
    quantity: 10,
    unit: "kg",
    suggestedSupplier: "Supplier B",
    supplierCode: "B",
    unitPrice: 5.20,
    lineTotal: 52.00
  },
  {
    id: "ord-2",
    productId: "prod-cola",
    productName: "Coca Cola",
    quantity: 4,
    unit: "cases",
    suggestedSupplier: "Supplier B",
    supplierCode: "B",
    unitPrice: 9.99,
    lineTotal: 39.96
  },
  {
    id: "ord-3",
    productId: "prod-mozzarella",
    productName: "Mozzarella",
    quantity: 5,
    unit: "kg",
    suggestedSupplier: "Supplier B",
    supplierCode: "B",
    unitPrice: 12.99,
    lineTotal: 64.95
  },
  {
    id: "ord-4",
    productId: "prod-tomatoes",
    productName: "Tomatoes",
    quantity: 2,
    unit: "boxes",
    suggestedSupplier: "Supplier B",
    supplierCode: "B",
    unitPrice: 7.95,
    lineTotal: 15.90
  }
];

const DEFAULT_ALERTS: PriceAlert[] = [
  {
    id: "alt-1",
    productName: "Diced Chicken",
    icon: "🥩",
    lastPrice: 5.20,
    currentPrice: 5.65,
    increasePercent: 8.7,
    windowWeeks: 10
  },
  {
    id: "alt-2",
    productName: "Lamb Chops",
    icon: "🥩",
    lastPrice: 8.90,
    currentPrice: 9.85,
    increasePercent: 10.7,
    windowWeeks: 12
  },
  {
    id: "alt-3",
    productName: "Cooking Oil",
    icon: "🛢️",
    lastPrice: 12.50,
    currentPrice: 13.40,
    increasePercent: 7.2,
    windowWeeks: 10
  },
  {
    id: "alt-4",
    productName: "Flour (16kg)",
    icon: "🌾",
    lastPrice: 7.80,
    currentPrice: 8.50,
    increasePercent: 9.0,
    windowWeeks: 11
  },
  {
    id: "alt-5",
    productName: "Cheddar Cheese",
    icon: "🧀",
    lastPrice: 11.20,
    currentPrice: 12.10,
    increasePercent: 8.0,
    windowWeeks: 12
  }
];

export function OrsCataloguePriceView({
  materials,
  companyId
}: {
  materials?: OrsMaterial[];
  companyId?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [orderList, setOrderList] = useState<OrderItem[]>(DEFAULT_ORDERS);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Filter comparison products by query
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return DEFAULT_PRODUCTS;
    const q = search.toLowerCase();
    return DEFAULT_PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [search]);

  // Add a product quote to Order List
  const addToOrderList = (product: ComparisonProduct, supplierName: string) => {
    const quote = product.suppliers[supplierName];
    if (!quote) return;
    const code = (supplierName.replace("Supplier ", "").trim() || "B") as "A" | "B" | "C" | "D";
    const existing = orderList.find((item) => item.productId === product.id && item.suggestedSupplier === supplierName);
    if (existing) {
      setOrderList((prev) =>
        prev.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                lineTotal: Number(((item.quantity + 1) * item.unitPrice).toFixed(2))
              }
            : item
        )
      );
    } else {
      const newItem: OrderItem = {
        id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unit: product.unit,
        suggestedSupplier: supplierName,
        supplierCode: code,
        unitPrice: quote.pricePerUnit,
        lineTotal: quote.pricePerUnit
      };
      setOrderList((prev) => [newItem, ...prev]);
    }
  };

  // Change quantity in order list
  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) {
      setOrderList((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    setOrderList((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              quantity: qty,
              lineTotal: Number((qty * i.unitPrice).toFixed(2))
            }
          : i
      )
    );
  };

  const removeOrderItem = (id: string) => {
    setOrderList((prev) => prev.filter((i) => i.id !== id));
  };

  const clearOrderList = () => {
    setOrderList([]);
  };

  // Group orders by supplier
  const ordersBySupplier = useMemo(() => {
    const groups: {
      [supplier: string]: {
        supplierName: string;
        code: "A" | "B" | "C" | "D";
        items: OrderItem[];
        subtotal: number;
      };
    } = {};

    for (const item of orderList) {
      if (!groups[item.suggestedSupplier]) {
        groups[item.suggestedSupplier] = {
          supplierName: item.suggestedSupplier,
          code: item.supplierCode,
          items: [],
          subtotal: 0
        };
      }
      groups[item.suggestedSupplier].items.push(item);
      groups[item.suggestedSupplier].subtotal += item.lineTotal;
    }

    return Object.values(groups);
  }, [orderList]);

  // Aggregate Order Calculations
  const totalOrderValue = useMemo(() => {
    return Number(orderList.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2));
  }, [orderList]);

  // Potential savings vs highest quotes
  const potentialSavings = useMemo(() => {
    let highestTotal = 0;
    for (const item of orderList) {
      const prod = DEFAULT_PRODUCTS.find((p) => p.id === item.productId);
      if (prod) {
        const highestPrice = Math.max(...Object.values(prod.suppliers).map((s) => s.pricePerUnit));
        highestTotal += highestPrice * item.quantity;
      } else {
        highestTotal += item.unitPrice * 1.16 * item.quantity;
      }
    }
    const diff = Math.max(0, highestTotal - totalOrderValue);
    const pct = totalOrderValue > 0 ? Math.round((diff / highestTotal) * 100) : 0;
    return {
      amount: Number(diff.toFixed(2)),
      percent: pct > 0 ? pct : 16
    };
  }, [orderList, totalOrderValue]);

  // Handle Create Single Supplier PO
  const handleCreateSupplierOrder = async (supplierName: string) => {
    const group = ordersBySupplier.find((g) => g.supplierName === supplierName);
    if (!group) return;
    setSubmitting(true);
    try {
      await fetch("/api/ors/purchase-orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-company-id": companyId || "main-company"
        },
        body: JSON.stringify({
          supplierName: group.supplierName,
          orderedOn: new Date().toISOString().slice(0, 10),
          lines: group.items.map((i, idx) => ({
            position: idx + 1,
            description: i.productName,
            quantity: String(i.quantity),
            unitPrice: i.unitPrice
          }))
        })
      }).catch(() => {});

      setSuccessMessage(`Order for ${supplierName} (${group.items.length} items, £${group.subtotal.toFixed(2)}) created successfully!`);
      setTimeout(() => setSuccessMessage(""), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Send All Orders
  const handleSendAllOrders = async () => {
    if (!orderList.length) return;
    setSubmitting(true);
    try {
      for (const group of ordersBySupplier) {
        await fetch("/api/ors/purchase-orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-company-id": companyId || "main-company"
          },
          body: JSON.stringify({
            supplierName: group.supplierName,
            orderedOn: new Date().toISOString().slice(0, 10),
            lines: group.items.map((i, idx) => ({
              position: idx + 1,
              description: i.productName,
              quantity: String(i.quantity),
              unitPrice: i.unitPrice
            }))
          })
        }).catch(() => {});
      }
      setSuccessMessage(`All ${orderList.length} items across ${ordersBySupplier.length} suppliers dispatched to Purchase Orders!`);
      setTimeout(() => setSuccessMessage(""), 6000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Tagline */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-100 pb-2">
        <div className="flex items-center gap-3">
          <span className="font-serif text-2xl font-bold tracking-tight text-emerald-900">
            Buy Smarter. Save More.
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-800">
            ORS Order System
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Rolling 10–12 week price intelligence window · Automatic cheapest supplier detection
        </div>
      </div>

      {/* Top KPI Metrics Row (Matches Image 2 exactly) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* KPI 1: Total Products */}
        <Card className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">1,245</div>
            <div className="text-xs font-semibold text-slate-600">Total Products</div>
            <div className="text-[11px] text-slate-400">Across all suppliers</div>
          </div>
        </Card>

        {/* KPI 2: Active Suppliers */}
        <Card className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">28</div>
            <div className="text-xs font-semibold text-slate-600">Active Suppliers</div>
            <div className="text-[11px] text-slate-400">From your invoices</div>
          </div>
        </Card>

        {/* KPI 3: Estimated Savings */}
        <Card className="flex items-center gap-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <span className="text-xl font-bold">£</span>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-950">£3,420</div>
            <div className="text-xs font-semibold text-emerald-800">Estimated Savings</div>
            <div className="text-[11px] text-emerald-600">This month</div>
          </div>
        </Card>

        {/* KPI 4: Price Increases */}
        <Card className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">12</div>
            <div className="text-xs font-semibold text-slate-600">Price Increases</div>
            <div className="text-[11px] text-amber-600 font-medium">&gt;7-10% in last 8-12 weeks</div>
          </div>
        </Card>
      </div>

      {/* Success Notification */}
      {successMessage ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-100 border border-emerald-300 p-3 text-sm font-medium text-emerald-900">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          {successMessage}
        </div>
      ) : null}

      {/* Main Grid: Comparison & Order List on Left, Alerts & Steps on Right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (8 cols on desktop): Supplier Price Comparison & Order List */}
        <div className="space-y-6 lg:col-span-8">
          {/* Supplier Price Comparison Card */}
          <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Supplier Price Comparison</h2>
                <p className="text-xs text-slate-500">
                  Side-by-side pricing matrix across active suppliers with automatic cheapest highlights
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[260px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for a product (e.g. chicken, milk, cleaning...)"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-3 font-semibold">Product</th>
                    <th className="pb-3 font-semibold">Pack Size</th>
                    <th className="pb-3 text-center font-semibold">Supplier A</th>
                    <th className="pb-3 text-center font-semibold bg-emerald-50/60 rounded-t-lg">Supplier B</th>
                    <th className="pb-3 text-center font-semibold">Supplier C</th>
                    <th className="pb-3 text-center font-semibold">Supplier D</th>
                    <th className="pb-3 text-right font-semibold">Best Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => {
                    const suppA = product.suppliers["Supplier A"];
                    const suppB = product.suppliers["Supplier B"];
                    const suppC = product.suppliers["Supplier C"];
                    const suppD = product.suppliers["Supplier D"];

                    return (
                      <tr key={product.id} className="hover:bg-slate-50/60">
                        {/* Product Column with Icon & Name */}
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-base">
                              {product.icon}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900">{product.name}</div>
                              <div className="text-[11px] text-slate-400">{product.subtitle}</div>
                            </div>
                          </div>
                        </td>

                        {/* Pack Size */}
                        <td className="py-3 text-slate-600">{product.packSize}</td>

                        {/* Supplier A */}
                        <td
                          onClick={() => addToOrderList(product, "Supplier A")}
                          className="cursor-pointer py-3 text-center hover:bg-slate-100/60"
                          title="Click to add to order list"
                        >
                          <div className="font-semibold text-slate-800">
                            £{suppA?.pricePerUnit.toFixed(2)}
                            {suppA?.packPrice ? (
                              <span className="text-[10px] text-slate-400"> /{product.unit}</span>
                            ) : null}
                          </div>
                          {suppA?.packPrice ? (
                            <div className="text-[10px] text-slate-400">£{suppA.packPrice.toFixed(2)}</div>
                          ) : null}
                          {suppA?.deltaText ? (
                            <div className="flex items-center justify-center text-[10px] font-semibold text-rose-600">
                              <ArrowUpRight className="h-3 w-3" /> {suppA.deltaText}
                            </div>
                          ) : null}
                        </td>

                        {/* Supplier B (Highlighted Cheapest) */}
                        <td
                          onClick={() => addToOrderList(product, "Supplier B")}
                          className="cursor-pointer bg-emerald-50/60 py-3 text-center hover:bg-emerald-100/70"
                          title="Cheapest quote! Click to add to order list"
                        >
                          <div className="font-bold text-emerald-950">
                            £{suppB?.pricePerUnit.toFixed(2)}
                            {suppB?.packPrice ? (
                              <span className="text-[10px] text-slate-500"> /{product.unit}</span>
                            ) : null}
                          </div>
                          {suppB?.packPrice ? (
                            <div className="text-[10px] text-slate-500">£{suppB.packPrice.toFixed(2)}</div>
                          ) : null}
                          {suppB?.deltaText ? (
                            <div className="flex items-center justify-center text-[10px] font-semibold text-emerald-700">
                              <ArrowDownRight className="h-3 w-3" /> {suppB.deltaText}
                            </div>
                          ) : null}
                          <span className="mt-1 inline-block rounded-full bg-emerald-200/90 px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase text-emerald-900">
                            Cheapest
                          </span>
                        </td>

                        {/* Supplier C */}
                        <td
                          onClick={() => addToOrderList(product, "Supplier C")}
                          className="cursor-pointer py-3 text-center hover:bg-slate-100/60"
                          title="Click to add to order list"
                        >
                          <div className="font-semibold text-slate-800">
                            £{suppC?.pricePerUnit.toFixed(2)}
                            {suppC?.packPrice ? (
                              <span className="text-[10px] text-slate-400"> /{product.unit}</span>
                            ) : null}
                          </div>
                          {suppC?.packPrice ? (
                            <div className="text-[10px] text-slate-400">£{suppC.packPrice.toFixed(2)}</div>
                          ) : null}
                          {suppC?.deltaText ? (
                            <div className="flex items-center justify-center text-[10px] font-semibold text-rose-600">
                              <ArrowUpRight className="h-3 w-3" /> {suppC.deltaText}
                            </div>
                          ) : null}
                        </td>

                        {/* Supplier D */}
                        <td
                          onClick={() => addToOrderList(product, "Supplier D")}
                          className="cursor-pointer py-3 text-center hover:bg-slate-100/60"
                          title="Click to add to order list"
                        >
                          <div className="font-semibold text-slate-800">
                            £{suppD?.pricePerUnit.toFixed(2)}
                            {suppD?.packPrice ? (
                              <span className="text-[10px] text-slate-400"> /{product.unit}</span>
                            ) : null}
                          </div>
                          {suppD?.packPrice ? (
                            <div className="text-[10px] text-slate-400">£{suppD.packPrice.toFixed(2)}</div>
                          ) : null}
                        </td>

                        {/* Best Price & Savings */}
                        <td className="py-3 text-right">
                          <div className="font-extrabold text-emerald-800">
                            £{product.bestPrice.toFixed(2)}
                            <span className="text-[10px] font-normal text-slate-500"> /{product.unit}</span>
                          </div>
                          <div className="text-[11px] font-bold text-emerald-600">
                            Save {product.savingsPercent}%
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Your Order List Section (Matches Image 2) */}
          <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-900">Your Order List</h3>
                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {orderList.length} items
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const prod = DEFAULT_PRODUCTS[0];
                    addToOrderList(prod, "Supplier B");
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
                <button
                  type="button"
                  onClick={clearOrderList}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {orderList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                Your order list is empty. Click on any supplier price in the table above to add items automatically!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2.5 font-semibold">Product</th>
                      <th className="pb-2.5 font-semibold">Quantity</th>
                      <th className="pb-2.5 font-semibold">Unit</th>
                      <th className="pb-2.5 font-semibold">Suggested Supplier</th>
                      <th className="pb-2.5 text-right font-semibold">Unit Price</th>
                      <th className="pb-2.5 text-right font-semibold">Total</th>
                      <th className="pb-2.5 text-center font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orderList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 font-semibold text-slate-900">{item.productName}</td>
                        <td className="py-2.5">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, Number(e.target.value) || 1)}
                            className="w-16 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2.5 text-slate-600">{item.unit}</td>
                        <td className="py-2.5">
                          <span className="font-semibold text-emerald-700">{item.suggestedSupplier}</span>
                        </td>
                        <td className="py-2.5 text-right text-slate-700">£{item.unitPrice.toFixed(2)}</td>
                        <td className="py-2.5 text-right font-bold text-slate-900">£{item.lineTotal.toFixed(2)}</td>
                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeOrderItem(item.id)}
                            className="rounded p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                            title="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Bottom Split: Orders by Supplier (Left) & Total Order Value Summary (Right) */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
            {/* Orders by Supplier Groupings (7 cols) */}
            <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-7">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Orders by Supplier</h3>
              <div className="space-y-3">
                {ordersBySupplier.map((group) => {
                  const badgeColor =
                    group.code === "B"
                      ? "bg-emerald-600"
                      : group.code === "A"
                      ? "bg-rose-600"
                      : group.code === "C"
                      ? "bg-blue-600"
                      : "bg-amber-600";

                  const btnColor =
                    group.code === "B"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-blue-600 hover:bg-blue-700";

                  return (
                    <div
                      key={group.supplierName}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-md font-bold text-white text-xs ${badgeColor}`}
                        >
                          {group.code}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">{group.supplierName}</div>
                          <div className="text-[11px] text-slate-500">{group.items.length} items</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-900">
                          £{group.subtotal.toFixed(2)}
                        </span>
                        <Button
                          disabled={submitting}
                          onClick={() => handleCreateSupplierOrder(group.supplierName)}
                          className={`h-7 px-3 text-xs font-semibold text-white ${btnColor}`}
                        >
                          Create Order
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Total Order Value & Send All Orders (5 cols) */}
            <Card className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-5">
              <div>
                <div className="text-xs font-semibold text-slate-500">Total Order Value</div>
                <div className="mt-1 text-3xl font-extrabold text-slate-900">
                  £{totalOrderValue.toFixed(2)}
                </div>
                <div className="mt-2 text-xs font-semibold text-emerald-700">
                  Potential Saving vs. Highest Prices:
                  <div className="font-bold">
                    £{potentialSavings.amount.toFixed(2)} ({potentialSavings.percent}%)
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <Button
                  onClick={handleSendAllOrders}
                  disabled={submitting || orderList.length === 0}
                  className="w-full bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
                >
                  <Send className="mr-2 h-4 w-4" /> Send All Orders
                </Button>

                <div className="flex items-center justify-center gap-4 text-xs font-medium text-slate-500">
                  <button
                    type="button"
                    onClick={() => alert("Purchase Orders downloaded as PDF/Excel packages.")}
                    className="flex items-center gap-1 hover:text-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" /> Download POs
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => alert("Suppliers notified with order item specifications.")}
                    className="flex items-center gap-1 hover:text-slate-800"
                  >
                    <Mail className="h-3.5 w-3.5" /> Email Suppliers
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column Rail (4 cols on desktop): Alerts, Recommendation, Auto Order Steps */}
        <div className="space-y-6 lg:col-span-4">
          {/* Price Increase Alerts Card (Matches Image 2) */}
          <Card className="rounded-xl border border-rose-100 bg-rose-50/20 p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-rose-600" /> Price Increase Alerts
              </h3>
              <button
                type="button"
                onClick={() => alert("Showing all price increase alerts exceeding 10% threshold across 10–12 week rolling history.")}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                View All
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              10–12 week price window · Alerts triggered on increases &gt; 7–10%
            </p>

            <div className="space-y-2.5">
              {DEFAULT_ALERTS.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-2.5 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{alert.icon}</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{alert.productName}</div>
                      <div className="text-[10px] text-slate-400">
                        Last: £{alert.lastPrice.toFixed(2)} · Current: £{alert.currentPrice.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                    +{alert.increasePercent.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* ORS Recommendation Card (Matches Image 2) */}
          <Card className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
              ORS Recommendation
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Buy from Supplier B</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  You could save <strong className="text-emerald-800 font-bold">£3,420 this month</strong> based on your usual order quantities across active categories.
                </p>
              </div>
            </div>
          </Card>

          {/* Create Orders Automatically Guide (Matches Image 2) */}
          <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-blue-950 mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" /> Create Orders Automatically
            </h3>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-[11px]">
                  1
                </span>
                <span className="pt-0.5">Add items to your order list</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-[11px]">
                  2
                </span>
                <span className="pt-0.5">ORS finds the cheapest supplier</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-[11px]">
                  3
                </span>
                <span className="pt-0.5">Items are grouped by supplier</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-[11px]">
                  4
                </span>
                <span className="pt-0.5">Generate and send purchase orders</span>
              </div>
            </div>
          </Card>

          {/* Every Penny Helps Badge */}
          <div className="rounded-xl bg-gradient-to-r from-emerald-800 to-emerald-950 p-4 text-white shadow-sm">
            <div className="flex items-center gap-2 font-bold text-sm">
              <span className="rounded bg-emerald-600/60 px-1.5 py-0.5 text-[10px] font-extrabold uppercase">
                VET THE VAT
              </span>
              <span>Every Penny Helps</span>
            </div>
            <p className="mt-1 text-xs text-emerald-200">
              Track. Compare. Order. Save. Smarter Receipts, Better Purchasing Decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
