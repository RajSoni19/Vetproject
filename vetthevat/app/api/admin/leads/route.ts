import {ApiError,apiV1} from "@/lib/server/api-v1";
export const runtime = "nodejs";
// The old separate lead store cannot atomically lock platform MFA/RBAC grants.
// Real contact enquiries are managed by /api/admin/platform in one transaction.
async function retired(){return apiV1(async()=>{throw new ApiError(503,'UNAVAILABLE','Use Leads CRM in /super-admin. The legacy lead administration endpoint is retired.');});}
export const GET=retired;export const PATCH=retired;export const POST=retired;
