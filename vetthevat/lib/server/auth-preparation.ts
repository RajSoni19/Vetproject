import {createHmac,timingSafeEqual} from "node:crypto";
import {ApiError,requireSameOrigin,uuid} from "@/lib/server/api-v1";
export const roleCapabilities={
  Owner:["company:read","company:manage","contacts:read","contacts:write","invoices:read","invoices:write","documents:read","documents:write","reports:read","reports:export","team:manage","audit:read","billing:manage"],
  Admin:["company:read","company:manage","contacts:read","contacts:write","invoices:read","invoices:write","documents:read","documents:write","reports:read","reports:export","team:manage","audit:read"],
  Finance:["company:read","contacts:read","contacts:write","invoices:read","invoices:write","documents:read","documents:write","reports:read","reports:export"],
  Accountant:["company:read","contacts:read","invoices:read","documents:read","reports:read","reports:export"],
  Staff:["company:read","contacts:read","invoices:read","invoices:write","documents:read","documents:write"],
  Viewer:["company:read","contacts:read","invoices:read","reports:read"]
} as const;
export type Capability=typeof roleCapabilities[keyof typeof roleCapabilities][number];
export function requireCsrf(request:Request,origin:string,sessionBinding:string,serverSecret:string){
  requireSameOrigin(request,origin);
  if(request.headers.get("sec-fetch-site")!=="same-origin"||!sessionBinding||serverSecret.length<32)throw new ApiError(403,"FORBIDDEN","Request protection failed.");
  const expected=createHmac("sha256",serverSecret).update(sessionBinding).digest("hex");
  const supplied=request.headers.get("x-csrf-token")??"";
  if(!/^[0-9a-f]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new ApiError(403,"FORBIDDEN","Request protection failed.");
}
export interface ScopedPrincipalResolver {
  // Bootstrap by verified user ID, NEVER email/client claims/local Team.
  resolve(identity:{userId:string},companyId:string):Promise<{userId:string;billingAccountId:string;companyId:string;active:boolean;capabilities:readonly Capability[]}|null>;
}
export async function resolvePrincipal(identity:{userId:string},companyId:string,capability:Capability,resolver:ScopedPrincipalResolver|undefined){
  const selected=uuid(companyId);if(!resolver)throw new ApiError(503,"UNAVAILABLE","Authorization is not configured.");
  const principal=await resolver.resolve({userId:uuid(identity.userId)},selected);
  if(!principal?.active||principal.companyId!==selected||!principal.capabilities.includes(capability))throw new ApiError(403,"FORBIDDEN","Company permission required.");
  return {...principal,userId:uuid(principal.userId),billingAccountId:uuid(principal.billingAccountId)};
}
