import { ApiError,jsonBody,objectBody,uuid } from "@/lib/server/api-v1";
import { protectRequest,csrfToken } from "@/lib/server/web-auth/crypto";
import { configured,authorizeCookie,administrator,binding,registerAccount,loginAccount,requestAccountToken,consumeAccountToken,nameInput,changeAccountPassword,throttle } from "@/lib/server/web-auth/core";
import { sessionCookie } from "@/lib/server/private-routing";
import type { WebAuthServices } from "@/lib/server/web-auth/runtime";
import {onboardingEnabled,onboardCompany,ownedBillingAccounts} from "@/lib/server/saas/onboarding";
import {teamEnabled,teamRequest} from "@/lib/server/saas/team";
import {billingRequest} from "@/lib/server/saas/billing";
import {accountProfileUpdateEnabled} from "@/lib/server/web-auth/profile-activation";
import {accountLanguagePreferenceEnabled,localeInput} from "@/lib/server/web-auth/language-preference";
const cache={"cache-control":"private, no-store, max-age=0","referrer-policy":"no-referrer"};
function cookie(token:string,maxAge:number){return `__Host-vetthevat-session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
export async function webAuthHandler(request:Request,services:WebAuthServices|undefined){
 const path=new URL(request.url).pathname;
 const methods:Record<string,string[]>={"/api/auth/change-password":["POST"],"/api/auth/session":["GET","POST"],"/api/auth/register":["POST"],"/api/auth/forgot-password":["POST"],"/api/auth/verification":["POST"],"/api/auth/verify-email":["POST"],"/api/auth/reset-password":["POST"],"/api/auth/logout":["POST"],"/api/auth/sessions":["GET"],"/api/auth/revoke-session":["POST"],"/api/account/profile":["GET","PUT"],"/api/account/companies":["GET","POST"],"/api/account/team":["GET","POST"],"/api/account/billing":["GET","POST"]};
 if(!methods[path]?.includes(request.method))return new Response(null,{status:405,headers:{...cache,Allow:(methods[path]??[]).join(", ")}});
 try{
  const s=configured(services),mutation=request.method!=="GET";if(mutation)protectRequest(request,s.config.origin);
  const reply=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{...cache,...headers}});
  if(path==="/api/auth/session"&&mutation){const result=await loginAccount(await jsonBody(request,16000),s);return reply({signedIn:true,redirect:"/app/dashboard"},200,{"set-cookie":cookie(result.token,Math.max(0,Math.floor((result.session.expiresAt-Date.now())/1000)))});}
  if(path==="/api/auth/register")return reply(await registerAccount(await jsonBody(request,16000),s),202);
  if(path==="/api/auth/forgot-password"||path==="/api/auth/verification")return reply(await requestAccountToken(await jsonBody(request,16000),s,path.endsWith("verification")?"verify_email":"reset_password"),202);
  if(path==="/api/auth/verify-email"||path==="/api/auth/reset-password")return reply(await consumeAccountToken(await jsonBody(request,16000),s,path.endsWith("verify-email")?"verify_email":"reset_password"));
  const p=await authorizeCookie(sessionCookie(request.headers),s),csrfBinding=binding(s,p);
  if(mutation)protectRequest(request,s.config.origin,csrfBinding,s.config.csrfSecret);
  if(path==="/api/auth/change-password")return reply(await changeAccountPassword(await jsonBody(request,4000),s,p),200,{"set-cookie":cookie("",0)});
  if(path==="/api/auth/session")return reply({authenticated:true,csrfToken:csrfToken(s.config.csrfSecret,csrfBinding),softwareAdministrator:p.roles.includes("software_administrator")});
  if(path==="/api/account/profile"){const languageEnabled=accountLanguagePreferenceEnabled(process.env);if(!mutation)return reply({profile:await s.store.profile(p.userId,languageEnabled),editable:accountProfileUpdateEnabled(process.env),languagePreferenceEnabled:languageEnabled});const body=objectBody(await jsonBody(request,2000),["fullName","preferredLocale"]);if(Object.hasOwn(body,"preferredLocale")){if(Object.hasOwn(body,"fullName")||!languageEnabled)throw new ApiError(503,"UNAVAILABLE","Account language preference requires the approved profile schema.");await throttle(s,"language-preference",p.userId);return reply({preferredLocale:await s.store.updatePreferredLocale(p.tokenHash,localeInput(body.preferredLocale))});}if(!Object.hasOwn(body,"fullName")||!accountProfileUpdateEnabled(process.env))throw new ApiError(503,"UNAVAILABLE","Account profile editing requires the reviewed isolated database function.");await throttle(s,"profile-update",p.userId);return reply(await s.store.updateProfile(p.tokenHash,nameInput(body.fullName)));}
  if(path==="/api/auth/logout"){await s.store.revoke(p);return reply({signedOut:true},200,{"set-cookie":cookie("",0)});}
  if(path==="/api/auth/sessions")return reply({sessions:await s.store.sessions(p.userId),currentSessionId:p.sessionId});
  if(path==="/api/auth/revoke-session"){const body=objectBody(await jsonBody(request,1000),["id"]);await s.store.revoke(p,uuid(body.id));return reply({revoked:true},200,body.id===p.sessionId?{"set-cookie":cookie("",0)}:{});}
  if(path==="/api/account/billing")return reply(await billingRequest(request,s,p));
  if(path==="/api/account/team"){if(!teamEnabled(process.env))throw new ApiError(503,"UNAVAILABLE","Team services require the reviewed isolated migration.");return reply(await teamRequest(request,s,p));}
  if(path==="/api/account/companies"){
   if(!mutation)return reply({companies:await s.store.companies(p.userId),onboardingEnabled:onboardingEnabled(process.env),accounts:onboardingEnabled(process.env)?await ownedBillingAccounts(s,p):[]});
   if(!onboardingEnabled(process.env))throw new ApiError(503,"UNAVAILABLE","Company onboarding requires verified plan limits and account provisioning.");
   return reply({company:await onboardCompany(s,p,await jsonBody(request,4000),request.headers.get('idempotency-key'))});
  }
  throw new ApiError(404,"INVALID_REQUEST","Not found.");
 }catch(error){const known=error instanceof ApiError?error:new ApiError(503,"UNAVAILABLE","Authentication service unavailable.");return Response.json({error:{code:known.code,message:known.message}},{status:known.status,headers:{...cache,...(known.status===429?{"retry-after":String(known.retryAfterSeconds??60)}:{})}});}
}
