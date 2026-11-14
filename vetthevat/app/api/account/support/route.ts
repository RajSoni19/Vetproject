import {apiV1,ApiError} from '@/lib/server/api-v1';
import {sessionCookie} from '@/lib/server/private-routing';
import {authorizeCookie,binding} from '@/lib/server/web-auth/core';
import {protectRequest,secretKey} from '@/lib/server/web-auth/crypto';
import {enforceRequestLimits} from '@/lib/server/request-limits';
import {businessServices} from '@/lib/server/saas/services';
import {supportEnabled,supportRequest} from '@/lib/server/saas/support';
export const runtime='nodejs';
async function handle(request:Request){return apiV1(async()=>{
 if(!supportEnabled(process.env))throw new ApiError(503,'UNAVAILABLE','Support ticket storage is awaiting database approval.');
 const services=businessServices();if(!services)throw new ApiError(503,'UNAVAILABLE','Support is unavailable.');
 const p=await authorizeCookie(sessionCookie(request.headers),services.auth);
 if(request.method!=='GET')protectRequest(request,services.auth.config.origin,binding(services.auth,p),services.auth.config.csrfSecret);
 await enforceRequestLimits(services.auth.store,[{key:secretKey(services.auth.config.csrfSecret,'support:'+p.userId),limit:60,windowMs:60000}]);
 return supportRequest(request,services.auth,p);
});}
export const GET=handle;export const POST=handle;
