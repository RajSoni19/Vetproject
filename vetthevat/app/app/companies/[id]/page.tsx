"use client";

import { use } from "react";
import { ServerCompanyDetails } from "@/components/server-company-details";

export default function CompanyRouteContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <ServerCompanyDetails
      id={id}
      selectedCompanyId=""
      manualEnabled={true}
      orsEnabled={true}
    />
  );
}
