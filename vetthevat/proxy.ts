import { NextResponse, type NextRequest } from "next/server";
import { privateRouteDecision } from "@/lib/server/private-routing";
import { authorizeCookie,administrator } from "@/lib/server/web-auth/core";
import { administratorAuthServices } from "@/lib/server/admin-services";
import { ApiError } from "@/lib/server/api-v1";

export async function proxy(request: NextRequest) {
  let response: NextResponse;
  if(request.nextUrl.pathname==="/api/public/contact-challenge")return request.method==='GET'?NextResponse.next():new NextResponse(null,{status:405});
  if (["/api/health/live","/api/health/ready"].includes(request.nextUrl.pathname)) {
    const health=request.method==='GET'?NextResponse.next():new NextResponse(null,{status:405,headers:{Allow:'GET'}});health.headers.set('Cache-Control','no-store');return health;
  }
  // Exact exceptions only; each handler owns its bot/origin/worker protection.
  if (request.nextUrl.pathname === "/api/public/leads" || request.nextUrl.pathname === "/api/public/contact" || request.nextUrl.pathname === "/api/internal/lead-notifications" || request.nextUrl.pathname === "/api/internal/auth-notifications" || request.nextUrl.pathname === "/api/providers/stripe" || request.nextUrl.pathname === "/api/internal/stripe-reconciliation") {
    response = request.method === "POST" ? NextResponse.next() : new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
  } else {
    const decision = await privateRouteDecision(request, process.env.VETTHEVAT_MARKETING_ONLY === "1", async cookie => {
      const services = administratorAuthServices();
      if (!services) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
      const principal=await authorizeCookie(cookie,services);
      if(request.nextUrl.pathname.startsWith("/app/admin")||request.nextUrl.pathname.startsWith("/api/admin/")&&request.nextUrl.pathname!=='/api/admin/platform')administrator(principal);
      return principal;
    });
    if (decision.kind === "setup") {
      response = ["GET", "HEAD"].includes(request.method) ? NextResponse.next() : NextResponse.json({ error: { code: "UNAVAILABLE", message: "Authentication is not configured." } }, { status: 503 });
    } else if (decision.kind === "login") {
      response = NextResponse.redirect(new URL("/login?setup=required", request.url));
    } else if (decision.kind === "deny") {
      if (request.nextUrl.pathname.startsWith("/api/ors") || request.nextUrl.pathname.startsWith("/api/business")) {
        response = NextResponse.next();
      } else {
        const code = decision.status === 404 ? "NOT_FOUND" : decision.status === 403 ? "FORBIDDEN" : decision.status === 503 ? "UNAVAILABLE" : "UNAUTHENTICATED";
        const message = decision.status === 404 ? "Not found." : decision.status === 403 ? "Administrator access required." : decision.status === 503 ? "Web authentication is not configured." : "Sign in required.";
        response = NextResponse.json({ error: { code, message } }, { status: decision.status });
      }
    } else response = NextResponse.next(); // Handlers/layouts repeat verified authorization.
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy","no-referrer");
  return response;
}
export const config = { matcher: ["/app/:path*", "/super-admin", "/api/:path*", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/onboarding"] };
