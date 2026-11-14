import {healthAuthorized,managedReadiness} from "@/lib/server/deployment-health";
export const runtime='nodejs';
export async function GET(request:Request){const headers={'cache-control':'no-store'};if(!healthAuthorized(request.headers.get('authorization'),process.env.VTV_HEALTH_SECRET))return Response.json({ready:false},{status:401,headers});try{const state=await managedReadiness();return Response.json(state,{status:state.ready?200:503,headers});}catch{return Response.json({ready:false},{status:503,headers});}}
