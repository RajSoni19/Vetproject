import {apiV1} from '@/lib/server/api-v1';
import {businessServices} from '@/lib/server/saas/services';
import {requireBusinessScope} from '@/lib/server/saas/request-context';
import {localWorkerHealth} from '@/lib/server/saas/local-worker-health';
export const runtime='nodejs';
export async function GET(request:Request){return apiV1(async()=>{await requireBusinessScope(request,request.headers.get('x-company-id'),'documents:read',businessServices());return localWorkerHealth();});}
