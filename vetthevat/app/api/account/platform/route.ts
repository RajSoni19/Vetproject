import {ApiError,apiV1} from "@/lib/server/api-v1";
import {sessionCookie} from "@/lib/server/private-routing";
import {authorizeCookie,binding} from "@/lib/server/web-auth/core";
import {protectRequest,secretKey} from "@/lib/server/web-auth/crypto";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
import {enforceRequestLimits} from "@/lib/server/request-limits";
import {platformCustomerRequest} from "@/lib/server/platform-customer";
export const runtime='nodejs';
async function handle(request:Request){return apiV1(async()=>{const s=webAuthServices();if(!s)throw new ApiError(503,'UNAVAILABLE','Account services unavailable.');const p=await authorizeCookie(sessionCookie(request.headers),s);if(request.method!=='GET')protectRequest(request,s.config.origin,binding(s,p),s.config.csrfSecret);await enforceRequestLimits(s.store,[{key:secretKey(s.config.csrfSecret,'platform-account:'+p.userId),limit:60,windowMs:60000}]);return platformCustomerRequest(request,s,p);});}
export const GET=handle;export const POST=handle;
