import {companyAccountHandler} from "@/lib/server/saas/account-http";
import {businessServices} from "@/lib/server/saas/services";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return companyAccountHandler(request,businessServices());}
