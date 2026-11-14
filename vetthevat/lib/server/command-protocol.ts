import {ApiError,uuid} from "@/lib/server/api-v1";
import type {Transaction} from "@/lib/server/database-core";
import type {Capability} from "@/lib/server/auth-preparation";
export interface ContextBroker {
  // Separate trusted credential/service, unavailable to the runtime role.
  // Verifies the session+live membership/capability itself; issues a random,
  // short-lived DB ticket bound to this connection and transaction, never a GUC
  // containing an arbitrary client user/company ID. No implementation supplied.
  issue(input:{sessionCookie:string;companyId:string;capability:Capability;backendPid:number;transactionId:string}):Promise<{ticket:string}>;
}
export async function bindTransactionContext(transaction:Transaction,input:{sessionCookie:string;companyId:string;capability:Capability},broker:ContextBroker|undefined){
  if(!broker||!input.sessionCookie)throw new ApiError(503,"UNAVAILABLE","Trusted authorization context is not configured.");
  const companyId=uuid(input.companyId);
  const row=(await transaction.query("SELECT pg_backend_pid() AS pid, pg_current_xact_id()::text AS transaction_id")).rows[0];
  if(!row||!Number.isSafeInteger(row.pid)||Number(row.pid)<=0||typeof row.transaction_id!=="string"||!/^\d+$/.test(row.transaction_id))throw new ApiError(503,"UNAVAILABLE","Transaction context unavailable.");
  let ticket:string;
  try{ticket=(await broker.issue({...input,companyId,backendPid:Number(row.pid),transactionId:row.transaction_id})).ticket;}catch{throw new ApiError(403,"FORBIDDEN","Company permission required.");}
  if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw new ApiError(503,"UNAVAILABLE","Transaction context unavailable.");
  await transaction.query("SELECT set_config('app.context_ticket',$1,true)",[ticket]);
}
export interface AuditCommandPort {
  append(transaction:Transaction,event:{companyId:string;actorUserId:string;requestId:string;eventType:string;entityId:string;beforeVersion:string|null;afterVersion:string}):Promise<void>;
}
