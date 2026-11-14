import {ApiError,apiV1} from '@/lib/server/api-v1';
import {sessionCookie} from '@/lib/server/private-routing';
import {authorizeCookie,administrator} from '@/lib/server/web-auth/core';
import {webAuthServices} from '@/lib/server/web-auth/runtime';
import {administratorOverview} from '@/lib/server/admin-overview';
import {enforceRequestLimits} from '@/lib/server/request-limits';
import {secretKey} from '@/lib/server/web-auth/crypto';
export const runtime='nodejs';
export async function GET(request:Request){return apiV1(async()=>{const services=webAuthServices();if(!services)throw new ApiError(503,'UNAVAILABLE','Administrator services unavailable.');const p=administrator(await authorizeCookie(sessionCookie(request.headers),services));await enforceRequestLimits(services.store,[{key:secretKey(services.config.csrfSecret,'admin-overview:'+p.userId),limit:60,windowMs:60000}]);return administratorOverview(services,p,new URL(request.url).searchParams);});}
