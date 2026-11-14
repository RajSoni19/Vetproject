"use client";

import { useAppState } from "@/components/app-state";
import { ServerAnalytics } from "@/components/server-analytics";
import { Card } from "@/components/ui/card";

export default function AnalyticsPage() {
  const { selectedCompanyId } = useAppState();

  if (!selectedCompanyId) {
    return <Card className="p-6">Select a company to view analytics.</Card>;
  }

  return <ServerAnalytics companyId={selectedCompanyId} initialTab="Executive" />;
}
