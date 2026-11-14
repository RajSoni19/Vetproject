import { createStage1Api } from "@/lib/server/stage1/http";

export const runtime = "nodejs";
// Deliberately unconfigured. Both this handler and the existing proxy deny live
// access. No env flag can install test doubles or activate production auth.
const handle = createStage1Api(undefined);
type Context = { params: Promise<{ segments: string[] }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).segments); }
export async function POST(request: Request, context: Context) { return handle(request, (await context.params).segments); }
export async function PUT(request: Request, context: Context) { return handle(request, (await context.params).segments); }
