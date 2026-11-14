import "server-only";
import { administratorAuthServices } from "@/lib/server/admin-auth";
import {authorizeCookie,administrator,binding} from "@/lib/server/web-auth/core";
import {protectRequest} from "@/lib/server/web-auth/crypto";
import { ApiError } from "@/lib/server/api-v1";
import { LeadError } from "@/lib/server/leads/core";
import { adminLeadHandler } from "@/lib/server/leads/admin-core";
import { leadServices } from "@/lib/server/leads/runtime";
import { processOneLeadNotification } from "@/lib/server/leads/providers";
import {platformEnabled,platformTransaction} from "@/lib/server/platform-admin";
export const handleAdminLeads = adminLeadHandler(async (request, mutation) => {
  try {
    const deps = administratorAuthServices();
    const values = (request.headers.get("cookie") ?? "").split(";").map(row => row.trim()).filter(row => row.startsWith("__Host-vetthevat-session="));
    if (values.length !== 1) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
    const session = administrator(await authorizeCookie(values[0].slice("__Host-vetthevat-session=".length), deps));
    if(!platformEnabled())throw new ApiError(503,'UNAVAILABLE','Lead administration requires the approved platform MFA service.');
    await platformTransaction(deps!,async sql=>{await sql.query("SELECT platform_admin.read($1,'leads')",[session.tokenHash]);});
    if (mutation) protectRequest(request, deps!.config.origin, binding(deps!,session), deps!.config.csrfSecret);
    return { actor: session.userId };
  } catch (error) {
    if (error instanceof ApiError) throw new LeadError(error.status, error.code, error.message);
    throw new LeadError(503, "UNAVAILABLE", "Administrator authorization unavailable.");
  }
}, () => {
  const services = leadServices();
  return services ? { store: services.store, notify: () => processOneLeadNotification(services.store, services.mailer) } : undefined;
});
