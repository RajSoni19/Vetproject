import { createPublicLeadHandler } from "@/lib/server/leads/core";
import { leadServices } from "@/lib/server/leads/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) { return createPublicLeadHandler(leadServices()?.deps)(request); }
export async function GET() { return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } }); }
