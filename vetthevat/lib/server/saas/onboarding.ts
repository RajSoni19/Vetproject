import {createHash} from "node:crypto";
import {ApiError,objectBody,uuid} from "@/lib/server/api-v1";
import {nameInput} from "@/lib/server/web-auth/core";
import {readSaasConfiguration} from "@/lib/server/saas/config";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
import type {Principal} from "@/lib/server/web-auth/store";
export const onboardingSchemaSha256="42881024af6488b131a6573fa825a19fffd6723604f38b50cb41dc2cdefd11db";
export const automaticTrialSchemaSha256="9c45378a2251cb8cd5971a4138ac70f06274b78581091d1eb86e5ba6e42e1288";
export function onboardingEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_ONBOARDING_ENABLED==='1'&&env.SAAS_ONBOARDING_SCHEMA_SHA256===onboardingSchemaSha256&&env.SAAS_AUTO_TRIAL_ENABLED==='1'&&env.SAAS_AUTO_TRIAL_SCHEMA_SHA256===automaticTrialSchemaSha256&&Boolean(readSaasConfiguration(env));}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function onboardCompany(s:WebAuthServices,p:Principal,body:unknown,key:string|null){
 const value=objectBody(body,['name','currency','accountId']),name=nameInput(value.name,200),currency=value.currency,accountId=value.accountId===null||value.accountId===undefined?null:uuid(value.accountId);
 if(!['GBP','EUR','USD'].includes(String(currency))||!key||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new ApiError(400,'INVALID_REQUEST','Select a supported currency and a valid request reference.');
 return s.store.transaction(async sql=>{try{return (await sql.query('SELECT saas.provision_company($1,$2,$3,$4,$5,$6) AS company',[p.tokenHash,name,currency,accountId,digest(key),digest(JSON.stringify({name,currency,accountId}))])).rows[0].company;}
  catch(error){const code=(error as {code?:string}).code;if(code==='23505')throw new ApiError(409,'CONFLICT','The account already exists, the company allowance is full, or this request reference was reused. Refresh the account list before retrying.');if(code==='42501')throw new ApiError(403,'FORBIDDEN','A verified session and an owned account with an active company allowance are required.');throw error;}});
}
export async function ownedBillingAccounts(s:WebAuthServices,p:Principal){return s.store.transaction(async sql=>(await sql.query('SELECT * FROM saas.owned_billing_accounts($1)',[p.tokenHash])).rows);}
