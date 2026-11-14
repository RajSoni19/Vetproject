import {LeadError} from "@/lib/server/leads/core";
import type {ContactStore} from "@/lib/server/contact";
import type {LeadDatabase} from "@/lib/server/leads/postgres";
// Caller must verify exact 55440 database/installation and vtv_contact_runtime.
// The transaction port must acknowledge COMMIT before returning the callback.
export function postgresContactStore(database:LeadDatabase):ContactStore{return {
 async consume(key,limit,seconds){if(!/^[a-z0-9:-]{1,100}$/.test(key)||!Number.isInteger(limit)||limit<1||limit>300||!Number.isInteger(seconds)||seconds<60||seconds>86400)throw new LeadError(503,"UNAVAILABLE","Request protection unavailable.");return database.transaction(async tx=>{const row=(await tx.query("SELECT * FROM contact_intake.consume_rate($1,$2,$3)",[key,limit,seconds])).rows[0];if(!row||typeof row.allowed!=="boolean")throw Error("Rate receipt missing");return {allowed:row.allowed,retryAfter:Number(row.retry_after)};});},
 async save(input){return database.transaction(async tx=>{const row=(await tx.query("SELECT id::text,created_at::text FROM contact_intake.save_enquiry($1::jsonb,$2,$3,$4)",[JSON.stringify(input.payload),input.keyHash,input.digest,input.duplicateHash])).rows[0];if(!row)throw Error("Durable contact receipt missing");return {id:String(row.id),createdAt:String(row.created_at)};});}
};}
