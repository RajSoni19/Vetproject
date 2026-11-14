import "server-only";
import {readSaasConfiguration} from "@/lib/server/saas/config";
import {saasDatabase} from "@/lib/server/saas/runtime";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
import {companyService} from "@/lib/server/saas/companies";
import {documentWorkflow} from "@/lib/server/saas/documents";
import {privateAssets,privateOriginals} from "@/lib/server/saas/storage-runtime";
import {invoiceService} from "@/lib/server/saas/invoices";
import {operationsService} from "@/lib/server/ors/services";
import {shoppingService} from "@/lib/server/ors/shopping";
import {workspaceService} from "@/lib/server/saas/workspace";
import {reportService} from "@/lib/server/saas/reports";
import {moduleReviewService} from "@/lib/server/procurement/module-reviews";
import {supplierLogoService} from "@/lib/server/saas/supplier-logos";
import {invoiceFinancialService} from "@/lib/server/saas/invoice-financials";

// Deliberately not mounted by a financial route before real authorization tests.
// Both stores must resolve to the NEW instance; no cross-database email/UID copy.
export function businessServices(){
  const config=readSaasConfiguration(process.env);if(!config)return undefined;
  const auth=webAuthServices();
  if(!auth||auth.config.database.host!==config.database.host||auth.config.database.port!==config.database.port||auth.config.database.name!==config.database.name||Boolean(auth.config.managed)!==Boolean(config.managed))return undefined;
  const database=saasDatabase();if(!database)return undefined;
  const assets=privateAssets();
  return {auth,database,companies:companyService(database),documents:documentWorkflow(database,privateOriginals()),invoices:invoiceService(database),invoiceFinancials:invoiceFinancialService(database),supplierLogos:assets?supplierLogoService(database,assets):undefined,operations:operationsService(database),shopping:shoppingService(database),workspace:workspaceService(database),reports:reportService(database),moduleReviews:moduleReviewService(database)};
}
