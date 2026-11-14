import {ApiError} from "@/lib/server/api-v1";

export const companyPermissions = [
  "company:read", "company:manage", "members:manage", "billing:manage",
  "contacts:read", "contacts:write", "documents:read", "documents:write",
  "invoices:read", "invoices:write", "invoices:confirm", "invoices:correct",
  "reports:read", "reports:export", "audit:read",
  "procurement:read", "procurement:write", "procurement:approve",
  "inventory:read", "inventory:receive", "inventory:adjust", "inventory:transfer",
  "sales:read", "sales:write", "sales:approve", "fulfilment:write"
] as const;
export type CompanyPermission = typeof companyPermissions[number];
export const companyRolePermissions:Record<string,readonly CompanyPermission[]> = {
  Owner:companyPermissions,
  Admin:companyPermissions.filter(p=>p!=="billing:manage"),
  Finance:["company:read","contacts:read","contacts:write","documents:read","documents:write","invoices:read","invoices:write","invoices:confirm","invoices:correct","reports:read","reports:export","audit:read","procurement:read","sales:read"],
  Accountant:["company:read","contacts:read","documents:read","invoices:read","reports:read","reports:export"],
  Procurement:["company:read","contacts:read","documents:read","documents:write","procurement:read","procurement:write","inventory:read"],
  Inventory:["company:read","documents:read","procurement:read","inventory:read","inventory:receive","inventory:transfer","sales:read","fulfilment:write"],
  Staff:["company:read","contacts:read","documents:read","documents:write","invoices:read","invoices:write","procurement:read","procurement:write","sales:read","sales:write"],
  Viewer:["company:read","contacts:read","invoices:read","reports:read","procurement:read","inventory:read","sales:read"]
};
export function companyPermission(value:unknown):CompanyPermission {
  if(typeof value!=="string"||!(companyPermissions as readonly string[]).includes(value))throw new ApiError(403,"FORBIDDEN","Company permission required.");
  return value as CompanyPermission;
}
// These constants describe policy. Only live database membership + session checks
// authorize a request; neither a browser role nor software-admin role is accepted.
