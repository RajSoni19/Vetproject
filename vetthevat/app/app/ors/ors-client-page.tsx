"use client";
import { usePathname } from "next/navigation";
import { useAppState } from "@/components/app-state";
import { OrsWorkspace } from "@/components/ors-workspace";

export function OrsClientPage() {
  const pathname = usePathname();
  const { selectedCompanyId } = useAppState();
  return <OrsWorkspace companyId={selectedCompanyId || "company-demo-business"} path={pathname} shoppingEnabled={true} />;
}
