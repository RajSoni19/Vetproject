import { NextRequest } from "next/server";
import { operationsHttp } from "@/lib/server/ors/http";
import { businessServices } from "@/lib/server/saas/services";
import { orsEnabled, orsShoppingEnabled } from "@/lib/server/saas/manual-activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const unavailable = (message: string) => Response.json({ error: { code: "UNAVAILABLE", message } }, { status: 503, headers });

// ORS records come only from the configured database; errors are returned
// as-is (no demo-data substitute).
async function handle(request: NextRequest, context: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await context.params;
  if (!orsEnabled(process.env)) return unavailable("Ordering is not enabled for this installation.");
  if (segments[0] === "shopping" && !orsShoppingEnabled(process.env)) return unavailable("Shopping is not enabled for this installation.");
  return operationsHttp(request, businessServices(), segments);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
