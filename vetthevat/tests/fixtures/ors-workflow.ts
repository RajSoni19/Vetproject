// Historical synthetic workflow fixtures, test-only. No production import.
import type { OrsState } from "@/lib/ors/contracts";
export function orsFixtures(): OrsState {
  return { materials: [{ id: "material-steel", companyId: "synthetic-company", name: "Steel sheet", unit: "sheets", reorderQuantity: 10 }, { id: "material-pack", companyId: "synthetic-company", name: "Packing cartons", unit: "cartons", reorderQuantity: 25 }], suppliers: [{ id: "supplier-test", companyId: "synthetic-company", contactSupplierId: null, name: "Synthetic Materials Ltd" }], requests: [], orders: [], receipts: [], movements: [], history: [], attachments: [] };
}
export function requestMaterial(state: OrsState, materialId: string, quantity: number, id: string): OrsState {
  if (!state.materials.some(row => row.id === materialId && row.companyId === "synthetic-company") || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || state.requests.some(row => row.id === id)) throw new Error("Select a material and quantity between 1 and 10,000.");
  return { ...state, requests: [...state.requests, { id, companyId: "synthetic-company", supplierId: "supplier-test", items: [{ materialId, quantity, unitCostMinor: "0", vatRate: null }], status: "draft", requestedBy: "fixture-user" }], history: [...state.history, { id: `history-${id}`, companyId: "synthetic-company", requestId: id, actorId: "fixture-user", action: "requested" }] };
}
export function approveRequest(state: OrsState, id: string): OrsState {
  if (!state.requests.some(row => row.id === id && row.status === "draft")) throw new Error("Only draft requests can be approved.");
  return { ...state, requests: state.requests.map(row => row.id === id ? { ...row, status: "approved" } : row), history: [...state.history, { id: `approved-${id}`, companyId: "synthetic-company", requestId: id, actorId: "fixture-reviewer", action: "approved" }] };
}
export function placeOrder(state: OrsState, requestId: string): OrsState {
  const request = state.requests.find(row => row.id === requestId && row.status === "approved");
  if (!request || state.orders.some(row => row.requestId === requestId)) throw new Error("Approve the request before ordering.");
  return { ...state, requests: state.requests.map(row => row.id === requestId ? { ...row, status: "ordered" } : row), orders: [...state.orders, { id: `order-${requestId}`, companyId: request.companyId, requestId, supplierId: request.supplierId, items: request.items.map(item => ({ ...item })), status: "open", vatInvoiceId: null }], history: [...state.history, { id: `ordered-${requestId}`, companyId: request.companyId, requestId, actorId: "fixture-user", action: "ordered" }] };
}
export function receiveOrder(state: OrsState, orderId: string, quantity: number, receiptId: string): OrsState {
  const order = state.orders.find(row => row.id === orderId && row.status === "open");
  if (!order || !Number.isSafeInteger(quantity) || quantity < 1 || state.receipts.some(row => row.id === receiptId)) throw new Error("Receipt is invalid.");
  const item = order.items[0], received = state.receipts.filter(row => row.orderId === orderId).reduce((sum, row) => sum + row.quantity, 0);
  if (quantity + received > item.quantity) throw new Error("Quantity exceeds the remaining order.");
  const receipt = { id: receiptId, companyId: order.companyId, orderId, materialId: item.materialId, quantity, receivedBy: "fixture-user" };
  return { ...state, receipts: [...state.receipts, receipt], orders: state.orders.map(row => row.id === orderId && quantity + received === item.quantity ? { ...row, status: "received" } : row), movements: [...state.movements, { id: `movement-${receiptId}`, companyId: order.companyId, receiptId, materialId: item.materialId, quantity, kind: "receipt" }], history: [...state.history, { id: `received-${receiptId}`, companyId: order.companyId, requestId: order.requestId, actorId: "fixture-user", action: "received" }] };
}
