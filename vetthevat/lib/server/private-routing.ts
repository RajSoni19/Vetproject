import { ApiError } from "@/lib/server/api-v1";
import {manualInvoicesEnabled,manualInvoicePath,orsEnabled,orsPath} from "@/lib/server/saas/manual-activation";

export const identitySetupPages = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/onboarding"];
export function sessionCookie(headers: Headers) {
  const values = (headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("__Host-vetthevat-session="));
  const cookie = values.length === 1 ? values[0].slice("__Host-vetthevat-session=".length) : "";
  if (!cookie || cookie.length > 16384 || !/^[A-Za-z0-9._-]+$/.test(cookie)) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
  return cookie;
}

// Proxy and each private handler verify independently. Browser roles never grant access.
export async function privateRouteDecision(request: Request, marketingOnly: boolean, verify: (cookie: string) => Promise<unknown>) {
  const path = new URL(request.url).pathname;
  if (identitySetupPages.includes(path)) return { kind: "setup" as const };
  if (marketingOnly) return { kind: "deny" as const, status: 404 };
  if (["/api/auth/change-password","/api/auth/session","/api/auth/logout","/api/auth/register","/api/auth/forgot-password","/api/auth/verification","/api/auth/verify-email","/api/auth/reset-password","/api/auth/sessions","/api/auth/revoke-session","/api/account/profile","/api/account/support","/api/account/support-attachments","/api/account/companies","/api/account/team","/api/account/billing","/api/account/platform","/api/account/company-context","/api/account/company-selection"].includes(path)) return { kind: "auth" as const };
  const page = path === "/app" || path.startsWith("/app/") || path === '/super-admin';
  // Only this API already repeats administration checks. VAT APIs remain unwired.
  if (!page && !['/api/admin/leads','/api/admin/overview','/api/admin/platform'].includes(path) && !(manualInvoicesEnabled(process.env)&&manualInvoicePath(path)) && !(orsEnabled(process.env)&&orsPath(path))) return { kind: "deny" as const, status: path.startsWith("/api/auth/") ? 503 : 401 };
  try { await verify(sessionCookie(request.headers)); return { kind: "authorized" as const }; }
  catch (error) {
    if (page && (!(error instanceof ApiError) || error.status !== 403)) return { kind: "login" as const };
    return { kind: "deny" as const, status: error instanceof ApiError && [401, 403, 503].includes(error.status) ? error.status : 503 };
  }
}
