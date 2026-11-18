import { invoiceExtractHandler } from "@/lib/server/saas/invoice-extract-http";
import { businessServices } from "@/lib/server/saas/services";
import { manualInvoicesEnabled } from "@/lib/server/saas/manual-activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(request: Request) {
  if (!manualInvoicesEnabled(process.env)) return Response.json({ error: { code: "UNAVAILABLE", message: "Invoice records are not enabled for this installation." } }, { status: 503, headers: { "cache-control": "private, no-store" } });
  return invoiceExtractHandler(businessServices())(request);
}

export const GET = handle;
export const POST = handle;
