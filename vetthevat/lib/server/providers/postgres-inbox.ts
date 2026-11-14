import {ApiError} from "@/lib/server/api-v1";
import type {DurableProviderInbox} from "@/lib/server/providers/webhook-intake";
export interface ProviderInboxConnection {query(sql:string,values:readonly unknown[]):Promise<{rows:readonly {recorded?:unknown}[]}>;}
// This adapter is only constructed by an isolated provider-runtime process after
// migration 005 and explicit provider configuration. It has no table grants.
export function postgresProviderInbox(connection:ProviderInboxConnection):DurableProviderInbox{return {async save(input){
 if(input.provider!=='stripe'||!/^[A-Za-z0-9._:-]{1,200}$/.test(input.eventId)||!/^[a-f0-9]{64}$/.test(input.digest))throw new ApiError(400,'INVALID_REQUEST','Invalid provider event.');
 try{const result=await connection.query('SELECT saas.record_provider_event($1,$2,$3,$4::jsonb) AS recorded',[input.provider,input.eventId,input.digest,JSON.stringify(input.payload)]);if(typeof result.rows[0]?.recorded!=="boolean")throw Error();}
 catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'UNAVAILABLE','Provider event was not durably recorded.');}
 }};}
