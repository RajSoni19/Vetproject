// ORS is a bounded module. IDs and invoice links become server-authorized only
// when a reviewed backend adapter is connected. No browser state grants entitlement.
export type OrsMaterial = { id: string; companyId: string; name: string; unit: string; reorderQuantity: number };
export type OrsSupplier = { id: string; companyId: string; contactSupplierId: string | null; name: string };
export type OrsItem = { materialId: string; quantity: number; unitCostMinor: string; vatRate: string | null };
export type PurchaseRequest = { id: string; companyId: string; supplierId: string; items: OrsItem[]; status: "draft" | "approved" | "ordered"; requestedBy: string };
export type PurchaseOrder = { id: string; companyId: string; requestId: string; supplierId: string; items: OrsItem[]; status: "open" | "received"; vatInvoiceId: string | null };
export type GoodsReceipt = { id: string; companyId: string; orderId: string; materialId: string; quantity: number; receivedBy: string };
export type InventoryMovement = { id: string; companyId: string; receiptId: string; materialId: string; quantity: number; kind: "receipt" };
export type ApprovalHistory = { id: string; companyId: string; requestId: string; actorId: string; action: "requested" | "approved" | "ordered" | "received" };
export type OrsAttachment = { id: string; companyId: string; orderId: string; originalDocumentId: string };
export type OrsState = { materials: OrsMaterial[]; suppliers: OrsSupplier[]; requests: PurchaseRequest[]; orders: PurchaseOrder[]; receipts: GoodsReceipt[]; movements: InventoryMovement[]; history: ApprovalHistory[]; attachments: OrsAttachment[] };
export interface OrsRepository {
  listMaterials(companyId: string): Promise<OrsMaterial[]>;
  submitRequest(input: PurchaseRequest, idempotencyKey: string): Promise<PurchaseRequest>;
  approveRequest(companyId: string, requestId: string, version: string): Promise<PurchaseRequest>;
  placeOrder(companyId: string, requestId: string, idempotencyKey: string): Promise<PurchaseOrder>;
  receive(input: GoodsReceipt, idempotencyKey: string): Promise<GoodsReceipt>;
}
