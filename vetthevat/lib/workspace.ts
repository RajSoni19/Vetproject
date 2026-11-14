import type { AuditEvent, Company, Customer, Invoice, NotificationItem, StoredDocument, Supplier, SupportTicket, TeamMember, WorkspaceSettings } from "@/lib/domain";
import { parseInvoiceDate } from "@/lib/invoice-rules";
import type {LegacySubscriptionPreferences} from "@/lib/subscription-contracts";

export const workspaceStorageKey = "vet-the-vat-workspace-v1";
export const defaultSettings: WorkspaceSettings = { profileName: "", email: "", notificationsEnabled: true };
export type Workspace = {
  invoices: Invoice[]; documents: StoredDocument[]; companies: Company[]; suppliers: Supplier[];
  tickets: SupportTicket[]; auditLog: AuditEvent[]; notifications: NotificationItem[]; teamMembers: TeamMember[];
  selectedCompanyId: string; settings: Record<string, WorkspaceSettings>;
  customers?: Customer[];
  subscriptionPreview?: LegacySubscriptionPreferences;
  legacyReviewBackups?: {key:string;at:string;count:number;companyIds:string[];protectedIds?:string[];restored?:boolean}[];
};

export function restoreWorkspace(raw: string | null, defaults: Workspace): Workspace {
  if (!raw) return defaults;
  const saved = JSON.parse(raw);
  if (!saved || typeof saved !== "object" || !Array.isArray(saved.invoices) || !Array.isArray(saved.documents)) throw new Error("Workspace data is malformed.");
  for (const key of ["invoices", "documents", "companies", "suppliers", "tickets", "auditLog", "notifications", "teamMembers", "customers"] as const) {
    if (saved[key] !== undefined && (!Array.isArray(saved[key]) || saved[key].some((item: { id?: string }) => !item || typeof item.id !== "string"))) throw new Error(`Invalid ${key} records. Existing data has not been overwritten.`);
  }
  if (saved.invoices.some((invoice: Invoice) => !Array.isArray(invoice.lineItems) || !Array.isArray(invoice.activity))) throw new Error("Invalid invoice structure.");
  const workspace: Workspace = { ...defaults, ...saved, settings: saved.settings ?? {} };
  workspace.customers=saved.customers??defaults.customers??[];
  if (!workspace.settings || typeof workspace.settings !== "object" || Array.isArray(workspace.settings)) throw new Error("Invalid settings.");
  if (workspace.tickets.some((ticket) => !Array.isArray(ticket.messages))) throw new Error("Invalid support records.");
  if (!workspace.companies.some((company) => company.id === workspace.selectedCompanyId)) workspace.selectedCompanyId = workspace.companies[0]?.id ?? "";
  const legacyCompany = defaults.companies[0]?.id ?? workspace.selectedCompanyId;
  // Legacy suppliers retain identity. If referenced by multiple companies, expose
  // scoped copies with the same ID rather than rewriting historical invoices.
  workspace.suppliers = workspace.suppliers.flatMap((supplier) => supplier.companyId ? [supplier] :
    [...new Set(workspace.invoices.filter((invoice) => invoice.supplierId === supplier.id).map((invoice) => invoice.companyId))].map((companyId) => ({ ...supplier, companyId })));
  const originalSuppliers: Supplier[] = saved.suppliers ?? defaults.suppliers;
  for (const supplier of originalSuppliers) if (!workspace.suppliers.some((item) => item.id === supplier.id)) workspace.suppliers.push({ ...supplier, companyId: legacyCompany });
  workspace.teamMembers = workspace.teamMembers.map((member) => ({ ...member, companyId: member.companyId ?? legacyCompany }));
  workspace.tickets = workspace.tickets.map((ticket) => ({ ...ticket, companyId: ticket.companyId ?? legacyCompany }));
  workspace.auditLog = workspace.auditLog.map((event) => ({ ...event, companyId: event.companyId ?? legacyCompany }));
  workspace.notifications = workspace.notifications.map((note) => ({ ...note, companyId: note.companyId ?? legacyCompany }));
  return workspace;
}

export function serializeWorkspace(workspace: Workspace) {
  return JSON.stringify({ ...workspace, documents: workspace.documents.map((document) => ({ ...document, textContent: undefined, localPreviewUrl: undefined })) });
}

export function persistWorkspace(storage: Pick<Storage, "setItem">, workspace: Workspace) {
  // Write first: callers publish the state only after this succeeds.
  storage.setItem(workspaceStorageKey, serializeWorkspace(workspace));
  return workspace;
}

export function validateCompany(company: Company, companies: Company[]) {
  const errors: string[] = [];
  if (!company.name.trim() || !company.country.trim()) errors.push("Company name and country are required.");
  if (!["GBP", "EUR", "USD"].includes(company.currency)) errors.push("Choose GBP, EUR or USD.");
  if (companies.some((item) => item.id !== company.id && item.name.trim().toLowerCase() === company.name.trim().toLowerCase())) errors.push("A company with this name already exists. Edit that record instead.");
  if (company.registrationNumber && !/^[A-Za-z0-9 -]{2,30}$/.test(company.registrationNumber)) errors.push("Check the company registration number format.");
  if (!["Active", "Review", "Archived"].includes(company.status)) errors.push("Choose a valid company status.");
  if (company.vatPeriodStart && !parseInvoiceDate(company.vatPeriodStart) || company.vatPeriodEnd && !parseInvoiceDate(company.vatPeriodEnd)) errors.push("Enter valid VAT period dates.");
  if (company.vatPeriodStart && company.vatPeriodEnd && company.vatPeriodStart > company.vatPeriodEnd) errors.push("VAT period start must precede its end.");
  return errors;
}

export function validateSupplier(supplier: Supplier, suppliers: Supplier[]) {
  const errors: string[] = [];
  const normal = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  if (!supplier.name.trim()) errors.push("Supplier name is required.");
  if (!["Active", "Review", "Archived"].includes(supplier.status)) errors.push("Choose a valid supplier status.");
  if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email)) errors.push("Enter a valid email address.");
  if (supplier.vatNumber && !/^[A-Za-z0-9 .-]{5,25}$/.test(supplier.vatNumber)) errors.push("Check the VAT identifier format. Registration is not verified by this application.");
  if (suppliers.some((item) => item.id !== supplier.id && item.companyId === supplier.companyId && (normal(item.name) === normal(supplier.name) || Boolean(supplier.vatNumber) && normal(item.vatNumber) === normal(supplier.vatNumber)))) errors.push("A supplier with this name or VAT identifier exists in this company. Review the existing record; suppliers are not merged automatically.");
  return errors;
}

export function validateMember(member: TeamMember, members: TeamMember[]) {
  const errors: string[] = [];
  if (!member.name.trim()) errors.push("Member name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) errors.push("Enter a valid email address.");
  if (!["Owner", "Admin", "Finance", "Accountant", "Staff", "Viewer"].includes(member.role)) errors.push("Choose a supported role.");
  if (members.some((item) => item.id !== member.id && item.companyId === member.companyId && item.email.trim().toLowerCase() === member.email.trim().toLowerCase())) errors.push("This email already has a member record in the selected company.");
  return errors;
}
