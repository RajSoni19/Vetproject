"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AuditEvent, Company, Customer, Invoice, NotificationItem, StoredDocument, Supplier, SupportTicket, TeamMember, WorkspaceSettings } from "@/lib/domain";
import { emptyWorkspace, loadLocalWorkspace, legacyRecordReview, exportLocalWorkspace } from "@/lib/workspace-bootstrap";
import {prepareLegacyDeletion,restoreLegacySelection,legacyRecoveryPrefix,type LegacySelection} from "@/lib/legacy-review";
import { validateCustomer } from "@/lib/customers";
import { EmptyWorkspace } from "@/components/empty-workspace";
import { scopedWorkspaceStorage } from "@/lib/scoped-workspace-storage";
import { browserReportExportService, browserDocumentStorageService, browserInvoiceProcessingService } from "@/lib/services";
import { upsertInvoice, validateInvoice, validateInvoiceDocument } from "@/lib/invoice-rules";
import { useNavigationGuard } from "@/components/navigation-guard";
import { associateDocument } from "@/lib/vat-workspace";
import {toMinorUnits} from "@/lib/money";
import {validateTaxReview} from "@/lib/invoice-tax-review";
import { resolveInvoiceSupplier } from "@/lib/invoice-supplier";
import { defaultSettings, persistWorkspace, serializeWorkspace, restoreWorkspace, validateCompany, validateMember, validateSupplier, workspaceStorageKey, type Workspace } from "@/lib/workspace";

type AppState = {
  legacyReviewRows:ReturnType<typeof legacyRecordReview>;
  legacyReviewBackups:NonNullable<Workspace["legacyReviewBackups"]>;
  deleteLegacyRecords:(rows:LegacySelection[])=>string|false;
  restoreLegacyRecords:(key:string)=>boolean;
  exportLegacyRecords:(key?:string)=>string;
  customers: Customer[]; saveCustomer: (customer: Customer) => void;
  invoices: Invoice[]; addInvoice: (invoice: Invoice) => void; updateInvoice: (invoice: Invoice) => void; saveInvoice: (invoice: Invoice) => void; deleteInvoice: (id: string) => void;
  storageReady: boolean; storageError: string;
  companies: Company[]; selectedCompany: Company; selectedCompanyId: string; setSelectedCompanyId: (id: string) => void; saveCompany: (company: Company) => void;
  suppliers: Supplier[]; addSupplier: (supplier: Supplier) => void; saveSupplier: (supplier: Supplier) => void;
  documents: StoredDocument[]; addDocument: (document: StoredDocument) => void; updateDocument: (document: StoredDocument) => void; deleteDocument: (id: string) => void;
  linkDocument: (documentId: string, invoiceId: string, supplierId: string) => void;
  tickets: SupportTicket[]; addTicket: (ticket: SupportTicket) => void; updateTicketStatus: (id: string, status: SupportTicket["status"]) => void; replyToTicket: (id: string, body: string) => void;
  auditLog: AuditEvent[]; addAuditEvent: (event: AuditEvent) => void;
  notifications: NotificationItem[]; markNotificationRead: (id: string) => void;
  teamMembers: TeamMember[]; saveTeamMember: (member: TeamMember) => void;
  settings: WorkspaceSettings; saveSettings: (settings: WorkspaceSettings) => void;
  services: { documents: typeof browserDocumentStorageService; processing: typeof browserInvoiceProcessingService; reports: typeof browserReportExportService };
};

const initial = emptyWorkspace();
const Context = createContext<AppState | null>(null);

export function AppStateProvider({ children, storageNamespace }: { children: React.ReactNode; storageNamespace: string }) {
  const { allowLeave } = useNavigationGuard();
  const [workspace, setWorkspace] = useState(initial);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const current = useRef(workspace);
  const blocked = useRef(false);
  const sessionUrls = useRef(new Set<string>());
  const isScoped = /^vtv-web-workspace-[a-f0-9]{64}:$/.test(storageNamespace);
  const storage = isScoped ? {
    getItem: (key:string) => scopedWorkspaceStorage(localStorage,storageNamespace).getItem(key),
    setItem: (key:string,value:string) => scopedWorkspaceStorage(localStorage,storageNamespace).setItem(key,value),
    removeItem: (key:string) => scopedWorkspaceStorage(localStorage,storageNamespace).removeItem(key)
  } : {
    getItem: (key:string) => localStorage.getItem(key),
    setItem: (key:string,value:string) => localStorage.setItem(key,value),
    removeItem: (key:string) => localStorage.removeItem(key)
  };
  useEffect(() => {
    try {
      const restored = loadLocalWorkspace(storage);
      current.current = restored; setWorkspace(restored);
    } catch {
      try { storage.removeItem(workspaceStorageKey); } catch {}
      const fallback = emptyWorkspace();
      current.current = fallback;
      setWorkspace(fallback);
      blocked.current = false;
      setStorageError("");
    }
    setStorageReady(true);
    const changed = (event: StorageEvent) => {
      if (event.key === storageNamespace + workspaceStorageKey || event.key === null) {
        blocked.current = true;
        setStorageError("This workspace changed in another tab. Reload before saving to avoid overwriting those changes.");
      }
    };
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener("storage", changed); for (const url of sessionUrls.current) URL.revokeObjectURL(url); };
  }, [storageNamespace]);

  function commit(next: Workspace) {
    if (!storageReady || blocked.current) throw new Error("Local storage is not ready or changed in another tab. Reload before saving; existing data will not be overwritten.");
    try { persistWorkspace(storage, next); }
    catch { setStorageError("Changes were not saved: browser storage is unavailable or full. Keep the form open and resolve storage before retrying."); throw new Error("Changes were not saved locally. Browser storage is unavailable or full."); }
    current.current = next; setWorkspace(next); setStorageError("");
  }
  function activity(next: Workspace, action: string, entity: string, companyId = next.selectedCompanyId) {
    const event: AuditEvent = { id: crypto.randomUUID(), companyId, user: "Local workspace user", action, entity, details: "Local browser workspace only; no external service request.", createdAt: new Date().toISOString() };
    return { ...next, auditLog: [event, ...next.auditLog] };
  }
  function recoveryArchive(key:string){
    if(!key.startsWith(legacyRecoveryPrefix)||!current.current.legacyReviewBackups?.some(row=>row.key===key))throw new Error("Recovery reference was not found in this workspace.");
    const raw=storage.getItem(key);if(!raw)throw new Error("The recovery snapshot is missing. Existing records have not been changed.");
    const archive=JSON.parse(raw) as {version:number;workspace:string;sourceRaw?:string;selections:LegacySelection[]};
    if(archive.version!==1||typeof archive.workspace!=="string"||!Array.isArray(archive.selections))throw new Error("The recovery snapshot is invalid. Existing records have not been changed.");
    return archive;
  }
  function deleteLegacyRecords(selections:LegacySelection[]){
    if(!allowLeave())return false;
    if(!storageReady||blocked.current)throw new Error("Reload before reviewing records; local storage is unavailable or changed in another tab.");
    const state=current.current,next=prepareLegacyDeletion(state,selections),key=legacyRecoveryPrefix+crypto.randomUUID(),at=new Date().toISOString();
    // Recovery must be durable in this browser before publishing any deletion.
    storage.setItem(key,JSON.stringify({version:1,workspace:serializeWorkspace(state),sourceRaw:exportLocalWorkspace(storage),selections}));
    const protectedIds=[...state.companies,...state.suppliers,...state.invoices,...state.documents,...state.teamMembers,...state.tickets,...state.auditLog,...state.notifications].map(row=>row.id);
    const metadata={key,at,count:selections.length,companyIds:state.companies.map(row=>row.id),protectedIds};
    commit(activity({...next,legacyReviewBackups:[...(state.legacyReviewBackups??[]),metadata]},"Selected legacy records removed locally","Legacy data review"));
    return key;
  }
  function restoreLegacyRecords(key:string){
    if(!allowLeave())return false;
    const state=current.current,metadata=state.legacyReviewBackups?.find(row=>row.key===key);
    if(metadata?.restored)throw new Error("This selection has already been restored.");
    const archive=recoveryArchive(key),original=restoreWorkspace(archive.workspace,emptyWorkspace());
    prepareLegacyDeletion(original,archive.selections);
    const next=restoreLegacySelection(state,original,archive.selections);
    commit(activity({...next,legacyReviewBackups:state.legacyReviewBackups?.map(row=>row.key===key?{...row,restored:true}:row)},"Legacy selection restored locally","Legacy data review"));
    return true;
  }
  function requireCompany(id?: string) {
    if (id !== current.current.selectedCompanyId) throw new Error("This record does not belong to the selected company.");
  }
  async function syncInvoiceToServer(invoice: Invoice, companyId: string) {
    try {
      if (invoice.transactionType !== "Sale") {
        await fetch("/api/ors/supplier-invoices", {
          method: "POST",
          headers: { "content-type": "application/json", "x-company-id": companyId },
          body: JSON.stringify({
            invoiceNumber: invoice.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`,
            supplier: invoice.supplierName || "Supplier",
            invoiceDate: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
            dueDate: invoice.dueDate || "",
            currency: invoice.currency || "GBP",
            subtotal: invoice.subtotal || 0,
            vat: invoice.vatAmount || 0,
            total: invoice.totalAmount || 0,
            lines: (invoice.lineItems || []).map((l, idx) => ({
              position: idx + 1,
              description: l.description,
              quantity: String(l.quantity || 1),
              unitPrice: l.unitPrice || 0,
              vatRate: l.vatRate || 20,
              lineTotal: l.netAmount || (Number(l.quantity || 1) * Number(l.unitPrice || 0))
            }))
          })
        }).catch(() => {});
      }
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
      if (sessionRes && sessionRes.ok) {
        const session = await sessionRes.json().catch(() => null);
        if (session?.csrfToken) {
          await fetch("/api/business/invoices", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-company-id": companyId,
              "x-csrf-token": session.csrfToken,
              "idempotency-key": crypto.randomUUID()
            },
            body: JSON.stringify({
              kind: "invoice",
              direction: invoice.transactionType === "Sale" ? "sale" : "purchase",
              number: invoice.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`,
              contactId: invoice.supplierId || invoice.customerId,
              issuedOn: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
              currency: invoice.currency || "GBP",
              lines: (invoice.lineItems || []).map((l, i) => ({
                position: i + 1,
                description: l.description,
                quantity: String(l.quantity || 1),
                rate: String(l.vatRate || 20),
                treatment: "standard",
                net: String(l.netAmount || (Number(l.quantity || 1) * Number(l.unitPrice || 0)))
              }))
            })
          }).catch(() => {});
        }
      }
    } catch {}
  }

  function saveInvoice(invoice: Invoice) {
    const state = current.current; requireCompany(invoice.companyId);
    if(invoice.supplierId && state.suppliers.some(row=>row.id===invoice.supplierId) && !state.suppliers.some(row=>row.id===invoice.supplierId&&row.companyId===invoice.companyId))throw new Error("Choose a supplier from this company.");
    if(invoice.customerId && (invoice.transactionType!=="Sale" || !(state.customers??[]).some(row=>row.id===invoice.customerId&&row.companyId===invoice.companyId)))throw new Error("Choose a customer from this company for a sales invoice.");
    const resolved=resolveInvoiceSupplier(invoice,state.suppliers);
    invoice=resolved.invoice;
    validateInvoiceDocument(invoice, state.documents, state.invoices);
    if (invoice.processingStatus === "Confirmed" || invoice.reviewStatus === "Reviewed") {
      const issues = [...validateInvoice(invoice, state.invoices),...validateTaxReview(invoice)]; if (issues.length) throw new Error(issues.join(" "));
    }
    if (invoice.supplierId && state.suppliers.some((supplier) => supplier.id === invoice.supplierId) && !state.suppliers.some((supplier) => supplier.id === invoice.supplierId && supplier.companyId === invoice.companyId)) throw new Error("Choose a supplier from this company.");
    const invoices = upsertInvoice(state.invoices, invoice);
    const documents = state.documents.map((document) => document.id === invoice.documentId ? { ...document, companyId: invoice.companyId, associatedInvoiceId: invoice.id, associatedSupplierId: invoice.supplierId, status: invoice.processingStatus === "Confirmed" ? "Processed" as const : "Needs Review" as const } : document);
    if (invoice.documentId && state.documents.some((document) => document.id === invoice.documentId && document.companyId && document.companyId !== invoice.companyId)) throw new Error("Choose an original from this company.");
    commit(activity({ ...state, invoices, documents, suppliers:resolved.suppliers }, invoice.status === "Draft" ? "Invoice draft saved locally" : "Invoice saved locally", invoice.invoiceNumber || invoice.id));
    void syncInvoiceToServer(invoice, invoice.companyId);
  }
  function deleteInvoice(id: string) {
    const state = current.current;
    const target = state.invoices.find((item) => item.id === id);
    if (!target) return;
    requireCompany(target.companyId);
    const invoices = state.invoices.filter((item) => item.id !== id);
    const documents = state.documents.map((doc) =>
      doc.associatedInvoiceId === id ? { ...doc, associatedInvoiceId: undefined } : doc
    );
    commit(activity({ ...state, invoices, documents }, "Invoice deleted locally", target.invoiceNumber || target.id));
  }
  function deleteDocument(id: string) {
    const state = current.current;
    const target = state.documents.find((item) => item.id === id);
    if (!target) return;
    requireCompany(target.companyId);
    const documents = state.documents.filter((item) => item.id !== id);
    const invoices = state.invoices.map((inv) =>
      inv.documentId === id ? { ...inv, documentId: "" } : inv
    );
    commit(activity({ ...state, invoices, documents }, "Document deleted locally", target.fileName));
  }
  function saveCompany(company: Company) {
    const state = current.current;
    const issues = validateCompany(company, state.companies); if (issues.length) throw new Error(issues.join(" "));
    const normalized = { ...company, name: company.name.trim(), country: company.country.trim() };
    commit(activity({ ...state, selectedCompanyId:state.selectedCompanyId||company.id, companies: [...state.companies.filter((item) => item.id !== company.id), normalized] }, "Company saved locally", normalized.name, company.id));
  }
  function saveSupplier(input: Supplier) {
    const state = current.current;
    const supplier = { ...input, companyId: input.companyId ?? state.selectedCompanyId, name: input.name.trim(), email: input.email.trim(), vatNumber: input.vatNumber.trim() };
    requireCompany(supplier.companyId);
    const issues = validateSupplier(supplier, state.suppliers); if (issues.length) throw new Error(issues.join(" "));
    commit(activity({ ...state, suppliers: [...state.suppliers.filter((item) => item.id !== supplier.id || item.companyId !== supplier.companyId), supplier] }, "Supplier saved locally", supplier.name));
  }
  function saveDocument(document: StoredDocument, update: boolean) {
    const state = current.current;
    const companyId = document.companyId ?? state.invoices.find((invoice) => invoice.documentId === document.id)?.companyId ?? state.selectedCompanyId;
    requireCompany(companyId);
    const previous = state.documents.find((item) => item.id === document.id);
    if (update && !previous) throw new Error("Document not found.");
    if (previous?.companyId && previous.companyId !== companyId) throw new Error("Document belongs to another company.");
    const next = { ...document, companyId };
    commit({ ...state, documents: [next, ...state.documents.filter((item) => item.id !== document.id)] });
    if (document.localPreviewUrl) sessionUrls.current.add(document.localPreviewUrl);
  }
  function addTicket(input: SupportTicket) {
    const state = current.current; const ticket = { ...input, companyId: input.companyId ?? state.selectedCompanyId };
    requireCompany(ticket.companyId);
    if (!ticket.subject.trim() || !ticket.messages[0]?.body.trim()) throw new Error("Subject and description are required.");
    if (ticket.subject.length > 200 || ticket.messages.some((message) => message.body.length > 5000)) throw new Error("Limit the subject to 200 characters and each message to 5,000 characters.");
    if (state.tickets.some((item) => item.id === ticket.id)) throw new Error("Ticket identifier already exists.");
    commit(activity({ ...state, tickets: [ticket, ...state.tickets] }, "Support ticket saved locally", ticket.subject));
  }
  function changeTicket(id: string, patch: Partial<SupportTicket>) {
    const state = current.current; const previous = state.tickets.find((item) => item.id === id && item.companyId === state.selectedCompanyId);
    if (!previous) throw new Error("Ticket not found in this company.");
    commit(activity({ ...state, tickets: state.tickets.map((item) => item === previous ? { ...item, ...patch, lastUpdate: new Date().toISOString() } : item) }, "Support ticket updated locally", previous.subject));
  }
  function saveTeamMember(input: TeamMember) {
    const state = current.current; const member = { ...input, companyId: input.companyId ?? state.selectedCompanyId, name: input.name.trim(), email: input.email.trim().toLowerCase() };
    requireCompany(member.companyId);
    const issues = validateMember(member, state.teamMembers); if (issues.length) throw new Error(issues.join(" "));
    const previous = state.teamMembers.find((item) => item.id === member.id && item.companyId === member.companyId);
    if (!previous && member.status !== "Invitation Draft") throw new Error("Invitations can't be sent yet.");
    if ((previous?.status === "Invitation Draft" || previous?.lastActive === "Never (local draft)") && (member.status === "Active" || member.status === "Invited")) throw new Error("A local invitation draft cannot become a delivered invitation or authenticated member without the backend.");
    commit(activity({ ...state, teamMembers: [...state.teamMembers.filter((item) => item.id !== member.id || item.companyId !== member.companyId), member] }, "Member record saved locally", member.email));
  }
  function resetStorage() {
    try { storage.removeItem(workspaceStorageKey); } catch {}
    const fallback = emptyWorkspace();
    current.current = fallback;
    setWorkspace(fallback);
    blocked.current = false;
    setStorageError("");
  }
  const selectedCompany = workspace.companies.find((company) => company.id === workspace.selectedCompanyId) ?? workspace.companies[0];
  if(!selectedCompany)return <EmptyWorkspace ready={storageReady} error={storageError} onCreate={saveCompany} onReset={resetStorage}/>;
  const scoped = <T extends { companyId?: string }>(items: T[]) => items.filter((item) => item.companyId === selectedCompany.id);
  const value: AppState = {
    legacyReviewRows:legacyRecordReview(workspace),legacyReviewBackups:workspace.legacyReviewBackups??[],deleteLegacyRecords,restoreLegacyRecords,
    exportLegacyRecords:key=>key?(recoveryArchive(key).sourceRaw??recoveryArchive(key).workspace):exportLocalWorkspace(storage),
    customers: scoped(workspace.customers??[]), saveCustomer: (customer) => {
      const state=current.current; requireCompany(customer.companyId);
      const previous=(state.customers??[]).find(row=>row.id===customer.id);
      if(previous && previous.companyId!==customer.companyId)throw new Error("Cannot move customers between companies.");
      const issues=validateCustomer(customer,state.customers??[]);if(issues.length)throw new Error(issues.join(" "));
      commit(activity({...state,customers:[...(state.customers??[]).filter(row=>row.id!==customer.id),{...customer,name:customer.name.trim(),email:customer.email.trim()}]},"Customer saved locally",customer.name));
    },
    invoices: workspace.invoices, addInvoice: saveInvoice, updateInvoice: saveInvoice, saveInvoice, deleteInvoice, storageReady, storageError,
    companies: workspace.companies, selectedCompany, selectedCompanyId: selectedCompany.id,
    setSelectedCompanyId: (id) => { if (id === current.current.selectedCompanyId) return; if (!current.current.companies.some((company) => company.id === id)) throw new Error("Company not found."); if (!allowLeave()) return; commit({ ...current.current, selectedCompanyId: id }); }, saveCompany,
    suppliers: scoped(workspace.suppliers), addSupplier: saveSupplier, saveSupplier,
    documents: workspace.documents, addDocument: (document) => saveDocument(document, false), updateDocument: (document) => saveDocument(document, true), deleteDocument,
    linkDocument: (documentId, invoiceId, supplierId) => {
      const state=current.current;const document=state.documents.find(row=>row.id===documentId);if(!document)throw new Error("Document not found.");
      const invoice=invoiceId?state.invoices.find(row=>row.id===invoiceId):undefined;const supplier=supplierId?state.suppliers.find(row=>row.id===supplierId&&row.companyId===state.selectedCompanyId):undefined;
      if(invoiceId&&!invoice||supplierId&&!supplier)throw new Error("Selected record not found in this company.");
      const linked=associateDocument(document,invoice,supplier,state.invoices,state.selectedCompanyId);
      commit(activity({...state,documents:state.documents.map(row=>row.id===documentId?linked:row),invoices:state.invoices.map(row=>row.id===invoiceId?{...row,documentId,...(!row.documentId?{status:"Pending Review" as const,reviewStatus:"Needs Review" as const,processingStatus:"Ready for Review" as const}:{}),updatedAt:new Date().toISOString()}:row)},"Document association saved locally",document.fileName));
    },
    tickets: scoped(workspace.tickets), addTicket,
    updateTicketStatus: (id, status) => { if (!["Open", "In Progress", "Waiting for Customer", "Resolved"].includes(status)) throw new Error("Choose a valid ticket status."); changeTicket(id, { status }); },
    replyToTicket: (id, body) => { const ticket = current.current.tickets.find((item) => item.id === id && item.companyId === selectedCompany.id); if (!ticket) throw new Error("Ticket not found."); if (!body.trim() || body.length > 5000) throw new Error("Enter a reply of 1?5,000 characters."); changeTicket(id, { messages: [...ticket.messages, { author: "Local workspace user", body: body.trim() }] }); },
    auditLog: scoped(workspace.auditLog), addAuditEvent: (event) => commit({ ...current.current, auditLog: [{ ...event, companyId: selectedCompany.id }, ...current.current.auditLog] }),
    notifications: scoped(workspace.notifications), markNotificationRead: (id) => { const state = current.current; if (!state.notifications.some((note) => note.id === id && note.companyId === selectedCompany.id)) throw new Error("Notification not found."); commit({ ...state, notifications: state.notifications.map((note) => note.id === id && note.companyId === selectedCompany.id ? { ...note, read: true } : note) }); },
    teamMembers: scoped(workspace.teamMembers), saveTeamMember,
    settings: workspace.settings[selectedCompany.id] ?? defaultSettings,
    saveSettings: (settings) => { if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) throw new Error("Enter a valid email address."); if (settings.profileName.length > 100) throw new Error("Profile name must be 100 characters or fewer."); commit(activity({ ...current.current, settings: { ...current.current.settings, [selectedCompany.id]: settings } }, "Settings saved locally", selectedCompany.name)); },
    services: { documents: browserDocumentStorageService, processing: browserInvoiceProcessingService, reports: browserReportExportService }
  };
  return <Context.Provider value={value}>{storageError ? <div role="alert" className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-800">{storageError}</div> : null}{children}</Context.Provider>;
}
export function useAppState() { const state = useContext(Context); if (!state) throw new Error("useAppState must be used inside AppStateProvider"); return state; }
