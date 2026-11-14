import {uatChallenge} from "@/lib/server/uat-contact";
export const runtime='nodejs';
export async function GET(request:Request){if(request.headers.get('sec-fetch-site')!=='same-origin')return Response.json({error:'Use the local contact form.'},{status:403});const token=uatChallenge();return token?Response.json({token,expiresIn:300},{headers:{'cache-control':'no-store'}}):Response.json({error:'Unavailable'},{status:404});}
