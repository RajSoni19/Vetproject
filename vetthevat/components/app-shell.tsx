"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Bell, Building2, ChevronRight, FileText, LayoutDashboard, Menu, Plus, Search, Settings, Upload, ShoppingCart, Package, Truck, Layers, FileCheck } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/components/app-state";
import { useNavigationGuard } from "@/components/navigation-guard";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Feedback } from "@/components/ui/feedback";
import { activeWorkspaceRoute, workspaceBreadcrumb, workspaceNavigation } from "@/lib/workspace-navigation";
import { orsWorkflowRoutes } from "@/lib/workflow-routes";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

export function AppShell({ children, softwareAdministrator = false }: { children: React.ReactNode; softwareAdministrator?: boolean }) {
  const pathname = usePathname(), router = useRouter();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"notifications" | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const { allowLeave } = useNavigationGuard();
  const { companies, selectedCompanyId, setSelectedCompanyId, notifications, markNotificationRead, settings, storageReady } = useAppState();

  const isOrs = pathname.startsWith("/app/ors");
  const active = activeWorkspaceRoute(pathname);
  const unread = notifications.filter((item) => !item.read).length;
  const { locale } = useLocale();

  const tr = (text: string) => {
    if (locale === "hi-IN") {
      const map: Record<string, string> = {
        "Workspace": "कार्यक्षेत्र",
        "Insights": "इनसाइट्स",
        "Organisation": "संगठन",
        "Purchasing": "खरीद",
        "Stock": "स्टॉक / इन्वेंटरी",
        "Sales": "बिक्री",
        "Dashboard": "डैशबोर्ड",
        "Invoices": "चालान",
        "Upload & OCR": "अपलोड और OCR",
        "Create Invoice": "चालान बनाएँ", "Create Manual Invoice": "मैन्युअल चालान बनाएँ",
        "OCR Review": "OCR समीक्षा",
        "Documents": "दस्तावेज़",
        "Customers": "ग्राहक",
        "Suppliers": "आपूर्तिकर्ता",
        "Analytics": "विश्लेषण",
        "VAT Management": "VAT प्रबंधन",
        "Reports": "रिपोर्ट",
        "Bank Reconciliation": "बैंक मिलान",
        "POS Invoice": "POS चालान",
        "Companies": "कंपनियाँ",
        "Team": "टीम",
        "Audit Log": "ऑडिट लॉग",
        "Settings": "सेटिंग्स",
        "Lead Enquiries": "लीड पूछताछ",
        "Subscription": "सदस्यता",
        "Administration": "प्रशासन",
        "All Orders": "सभी ऑर्डर",
        "Create Order": "ऑर्डर बनाएँ",
        "Purchase Orders": "खरीद ऑर्डर",
        "Supplier Invoices": "आपूर्तिकर्ता चालान",
        "Product Catalogue": "उत्पाद कैटलॉग",
        "Inventory": "इन्वेंटरी",
        "Goods Receipts": "माल प्राप्ति",
        "Sales Orders": "बिक्री ऑर्डर",
        "Marketplace": "मार्केटप्लेस",
        "Account settings": "खाता सेटिंग्स",
        "Live workspace": "लाइव कार्यक्षेत्र",
        "All changes saved": "सभी बदलाव सेव हैं",
        "Operations, Stock & Ordering active": "संचालन, स्टॉक और ऑर्डरिंग सक्रिय",
        "VAT & Invoice management active": "VAT और चालान प्रबंधन सक्रिय"
      };
      return map[text] || text;
    }
    return text;
  };

  const vatGroups = ["Workspace", "Insights", "Organisation"];
  const orsGroups = ["Purchasing", "Stock", "Sales", "Organisation"];

  const currentGroups = isOrs ? orsGroups : vatGroups;

  const currentNavItems = isOrs
    ? [
        { href: "/app/ors/prices", label: "Price Comparison", group: "Purchasing" },
        { href: "/app/ors/orders", label: "All Orders", group: "Purchasing" },
        { href: "/app/ors/orders/new", label: "Create Order", group: "Purchasing" },
        { href: "/app/ors/purchase-orders", label: "Purchase Orders", group: "Purchasing" },
        { href: "/app/ors/supplier-invoices", label: "Supplier Invoices", group: "Purchasing" },
        { href: "/app/ors/catalogue", label: "Product Catalogue", group: "Stock" },
        { href: "/app/ors/inventory", label: "Inventory", group: "Stock" },
        { href: "/app/ors/goods-receipts", label: "Goods Receipts", group: "Stock" },
        { href: "/app/bank-matching", label: "Bank VAT Matching", group: "Stock" },
        { href: "/app/ors/sales", label: "Sales Orders", group: "Sales" },
        { href: "/app/ors/shopping", label: "Marketplace", group: "Sales" },
        { href: "/app/settings", label: "Settings", group: "Organisation" },
      ]
    : workspaceNavigation.filter((item) => !item.hidden && vatGroups.includes(item.group) && (softwareAdministrator || !item.href.startsWith("/app/admin")));

  const navigation = (
    <nav aria-label="Workspace navigation" className="workspace-navigation">
      {currentGroups.map((group) => {
        const items = currentNavItems.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <p className="nav-group">{tr(group === "Insights" ? "Accounts" : group)}</p>
            {items.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/app/dashboard" && item.href !== "/app/ors/orders" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn("nav-item", isActive && "nav-item-active")}
                  onClick={() => setOpen(false)}
                >
                  <span className="nav-marker" aria-hidden="true" />
                  {tr(item.label)}
                  {isActive ? <ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" /> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const logo = (
    <Link href={isOrs ? "/app/ors/orders" : "/app/dashboard"} className="workspace-logo">
      <span className="brand-monogram">V</span>
      <span>
        VET THE VAT
        <small>{isOrs ? "Operations & Ordering" : "Business workspace"}</small>
      </span>
    </Link>
  );

  return (
    <div className="workspace" data-mode={isOrs ? "ors" : "vat"}>
      <a href="#workspace-content" className="skip-link">Skip to workspace</a>

      {/* Sidebar */}
      <aside className="workspace-sidebar">
        <div className="px-5 py-7">{logo}</div>

        {/* Mode Switcher */}
        <div className="px-4">
          <div className="mode-switch" aria-label="Product mode">
            <Link
              href="/app/dashboard"
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all", !isOrs ? "mode-selected" : "text-muted hover:bg-white")}
            >
              VAT
            </Link>
            <Link
              href="/app/ors/orders"
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all", isOrs ? "mode-selected" : "text-muted hover:bg-white")}
            >
              ORS
            </Link>
          </div>
          <p id="mode-description" className="mt-2 px-1 text-xs leading-5 text-muted">
            {isOrs ? tr("Operations, Stock & Ordering active") : tr("VAT & Invoice management active")}
          </p>
        </div>

        {navigation}

        <div className="sidebar-footer">
          <span className="local-dot" />
          {tr("Live workspace")}
          <p>{tr("All changes saved")}</p>
          <Link href="/app/settings" className="mt-3 inline-flex items-center gap-2 text-sm font-medium">
            {tr("Account settings")} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>

      {/* Main Workspace Body */}
      <div className="workspace-body">
        {/* Single Modern Sticky Header */}
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-line bg-white px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <Button className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 px-0 lg:hidden" variant="ghost" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>

            <nav aria-label="Breadcrumb" className="breadcrumb hidden sm:flex items-center gap-2 text-xs text-muted">
              <Link href={isOrs ? "/app/ors/orders" : "/app/dashboard"} className="font-semibold text-ink hover:text-brand-700">
                {isOrs ? "ORS" : "Workspace"}
              </Link>
              <ChevronRight className="hidden h-3.5 w-3.5 sm:inline text-muted" aria-hidden="true" />
              <span aria-current="page" className="truncate font-medium text-ink">
                {workspaceBreadcrumb(pathname)}
              </span>
            </nav>

            {/* Company selector */}
            <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-line bg-wash/80 px-2 sm:px-2.5 py-1 text-xs font-semibold text-ink max-w-[135px] sm:max-w-[220px]">
              <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-brand-700" aria-hidden="true" />
              <select
                aria-label="Workspace company"
                disabled={!storageReady}
                value={selectedCompanyId}
                className="bg-transparent font-semibold text-xs outline-none cursor-pointer max-w-[90px] sm:max-w-[180px] truncate"
                onChange={(event) => {
                  try {
                    setSelectedCompanyId(event.target.value);
                    setError("");
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Company selection failed.");
                  }
                }}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search bar */}
          <form
            className="header-search hidden md:flex h-9 w-[220px] lg:w-[280px] shrink-0 items-center gap-2 rounded-lg border border-line bg-wash px-3 text-muted"
            onSubmit={(event) => {
              event.preventDefault();
              if (allowLeave()) router.push(`/app/invoices?query=${encodeURIComponent(query)}`);
            }}
          >
            <Search className="h-4 w-4 text-muted" aria-hidden="true" />
            <input
              aria-label="Workspace search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isOrs ? (locale === "hi-IN" ? "ऑर्डर या उत्पाद खोजें…" : "Find orders or products…") : (locale === "hi-IN" ? "चालान खोजें…" : "Find an invoice…")}
              className="w-full bg-transparent text-xs text-ink placeholder:text-muted outline-none"
            />
          </form>

          {/* Header Right Actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Mode Switcher pill in header */}
            <div className="flex items-center rounded-lg border border-line bg-wash p-0.5 text-xs font-medium">
              <Link
                href="/app/dashboard"
                className={cn("rounded-md px-2 sm:px-3 py-1 text-xs font-semibold transition-all", !isOrs ? "bg-brand-700 text-white shadow-xs" : "text-muted hover:text-ink")}
              >
                VAT
              </Link>
              <Link
                href="/app/ors/orders"
                className={cn("rounded-md px-2 sm:px-3 py-1 text-xs font-semibold transition-all", isOrs ? "bg-brand-700 text-white shadow-xs" : "text-muted hover:text-ink")}
              >
                ORS
              </Link>
            </div>

            {/* Notifications */}
            <Button
              variant="ghost"
              className="relative h-8 w-8 sm:h-9 sm:w-9 shrink-0 px-0"
              aria-label="Notifications"
              disabled={!storageReady || !settings.notificationsEnabled}
              onClick={() => setPanel("notifications")}
            >
              <Bell className="h-4 w-4" />
              {unread && settings.notificationsEnabled ? <span className="notification-count">{unread}</span> : null}
            </Button>

            {/* Profile Avatar */}
            <Link href="/app/settings" className="profile-avatar h-8 w-8 sm:h-9 sm:w-9" aria-label="Local profile settings">
              {(settings.profileName || "R").slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>

        {error ? (
          <div className="px-4 pt-3 lg:px-8">
            <Feedback kind="error" title="Action failed">{error}</Feedback>
          </div>
        ) : null}

        {/* Real Children Page Content */}
        <main id="workspace-content" tabIndex={-1} className="workspace-main">
          {children}
        </main>

        {/* Mobile Navigation */}
        <nav className="mobile-bottom-nav" aria-label="Mobile workspace navigation">
          {[
            { href: isOrs ? "/app/ors/orders" : "/app/dashboard", label: isOrs ? "Orders" : "Home", Icon: LayoutDashboard },
            { href: isOrs ? "/app/ors/catalogue" : "/app/invoices", label: isOrs ? "Catalogue" : "Invoices", Icon: FileText },
            { href: isOrs ? "/app/ors/goods-receipts" : "/app/invoices/upload", label: isOrs ? "Receipts" : "Upload", Icon: Upload },
            { href: isOrs ? "/app/ors/orders/new" : "/app/invoices/new", label: "New", Icon: Plus },
          ].map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn(pathname === href && "text-brand-700")}>
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          ))}
          <button type="button" onClick={() => setOpen(true)} aria-label="More navigation">
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </nav>
      </div>

      {/* Mobile Drawer */}
      {open ? (
        <Dialog title="Workspace navigation" drawer onClose={() => setOpen(false)}>
          <div className="p-5">{logo}</div>
          {navigation}
        </Dialog>
      ) : null}

      {/* Notifications Drawer */}
      {panel === "notifications" ? (
        <Dialog title="Notifications" onClose={() => setPanel(null)}>
          <div className="p-5">
            {!notifications.length ? (
              <Feedback title="You’re all caught up">No notifications in this company.</Feedback>
            ) : (
              notifications.map((note) => (
                <div key={note.id} className="border-t border-line py-4">
                  <p className="font-semibold">{note.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{note.description}</p>
                  {!note.read ? (
                    <Button variant="ghost" className="mt-2 h-9 px-2" onClick={() => { try { markNotificationRead(note.id); } catch (reason) { setError(reason instanceof Error ? reason.message : "Read state could not be saved."); } }}>
                      Mark read
                    </Button>
                  ) : (
                    <span className="mt-2 block text-xs text-muted">Read</span>
                  )}
                </div>
              ))
            )}
            <Button variant="outline" onClick={() => setPanel(null)}>Close notifications</Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
