import { preparedInvoiceHandler } from "@/lib/server/saas/invoice-http";
import { businessServices } from "@/lib/server/saas/services";
import { manualInvoicesEnabled } from "@/lib/server/saas/manual-activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Business records come only from the configured database. Errors (validation,
// not found, storage unavailable) are returned as-is so the UI can show them;
// there is no demo-data substitute.
async function handle(request: Request) {
  if (!manualInvoicesEnabled(process.env)) {
    return Response.json({ error: { code: "UNAVAILABLE", message: "Invoice records are not enabled for this installation." } }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  return preparedInvoiceHandler(businessServices())(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
