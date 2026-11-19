import {orsWorkflowRoutes,workflowRoute} from "@/lib/workflow-routes";
import type {MessageKey} from "@/lib/i18n/catalog";

// hidden: kept for breadcrumbs and active-page detection, but not shown in the menu.
export const workspaceNavigation: {href:string;label:string;key?:MessageKey;group:string;hidden?:boolean}[] = [
  { href: "/app/dashboard", label: "Dashboard", key:"navDashboard", group: "Workspace" },
  { href: "/app/invoices", label: "Invoices", key:"navInvoices", group: "Workspace" },
  { href: "/app/invoices/upload", label: "Upload & OCR", group: "Workspace" },
  { href: "/app/invoices/new", label: "Create Manual Invoice", group: "Workspace" },
  { href: "/app/invoices/review", label: "OCR Review", group: "Workspace" },
  { href: "/app/documents", label: "Documents", key:"navDocuments", group: "Workspace" },
  // Hidden from the menu for now (client request); the page still works at /app/customers.
  { href: "/app/customers", label: "Customers", key:"navCustomers", group: "Workspace", hidden: true },
  { href: "/app/suppliers", label: "Suppliers", key:"navSuppliers", group: "Workspace" },
  ...orsWorkflowRoutes.filter(r=>"group" in r).map(r=>({href:r.path,label:r.title,group:"group" in r?r.group:"Purchasing"})),
  { href: "/app/analytics", label: "Analytics", key:"navAnalytics", group: "Insights" },
  { href: "/app/bank-matching", label: "Bank Matching", group: "Insights" },
  // Hidden from the menu for now (client request); the page still works at /app/vat.
  { href: "/app/vat", label: "VAT Reports", group: "Insights", hidden: true },
  { href: "/app/reports", label: "Reports", key:"navReports", group: "Insights" },
  { href: "/app/pos", label: "POS invoice", key:"navPosInvoice", group: "Insights" },
  { href: "/app/companies", label: "Companies", key:"navCompanies", group: "Organisation" },
  { href: "/app/team", label: "Team", key:"navTeam", group: "Organisation" },
  { href: "/app/audit", label: "Activity", key:"navActivity", group: "Organisation" },
  { href: "/app/settings", label: "Settings", key:"navSettings", group: "Organisation" },
  { href: "/app/admin/leads", label: "Lead enquiries", key:"navLeadEnquiries", group: "Organisation" },
  { href: "/app/subscription", label: "Subscription", key:"navPlanInformation", group: "Organisation" },
  { href: "/app/support", label: "Support", key:"navSupport", group: "Organisation" }
];

export function activeWorkspaceRoute(pathname: string) {
  return [...workspaceNavigation].sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))?.href;
}

export function workspaceBreadcrumb(pathname: string,translate?:(key:MessageKey)=>string) {
  const workflow=workflowRoute(pathname);if(workflow)return workflow.title;
  const active = workspaceNavigation.find((item) => item.href === activeWorkspaceRoute(pathname));
  if (!active) return translate?translate(pathname === "/app/admin" ? "navAdministration" : "navWorkspace"):pathname === "/app/admin" ? "Administration" : "Workspace";
  if(active.href === "/app/invoices" && pathname !== active.href)return translate?translate("navInvoiceDetails"):"Invoice details";
  return translate&&active.key?translate(active.key):active.label;
}
