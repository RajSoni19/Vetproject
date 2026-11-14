import {ApiError} from "@/lib/server/api-v1";
import type {CompanyDatabase,CompanyScope} from "@/lib/server/saas/transactions";
import {invoiceSoftDeleteEnabled} from "@/lib/server/saas/invoice-soft-delete";

export function workspaceService(database:CompanyDatabase){return {
  dashboard(scope:CompanyScope){return database.scoped({...scope,permission:"reports:read"},async tx=>{
    // Aggregate separately: joining documents/lines would multiply totals. Keep
    // currencies separate and never count drafts as confirmed financial activity.
    const liveFilter=invoiceSoftDeleteEnabled(process.env)?" AND deleted_at IS NULL":"";
    const invoices=(await tx.query(`SELECT currency,state,count(*)::text AS count,sum(net)::text AS net,sum(vat)::text AS vat,sum(gross)::text AS gross FROM business.invoices WHERE company_id=$1${liveFilter} GROUP BY currency,state ORDER BY currency,state`,[tx.companyId])).rows;
    const contacts=(await tx.query("SELECT kind,count(*)::text AS count FROM business.counterparties WHERE company_id=$1 AND status='active' GROUP BY kind ORDER BY kind",[tx.companyId])).rows;
    return {invoices,contacts,asOf:new Date().toISOString()};
  });},
  audit(scope:CompanyScope,search:URLSearchParams){
    if([...search.keys()].some(k=>k!=="before")||search.getAll("before").length>1)throw new ApiError(400,"INVALID_REQUEST","Invalid audit cursor.");
    const before=search.get("before");let cursor:{at:string;id:string}|null=null;
    if(before){try{cursor=JSON.parse(Buffer.from(before,"base64url").toString());}catch{throw new ApiError(400,"INVALID_REQUEST","Invalid audit cursor.");}
      if(!cursor||typeof cursor.at!=="string"||!Number.isFinite(Date.parse(cursor.at))||!/^\d{4}-/.test(cursor.at)||typeof cursor.id!=="string"||!/^[a-f0-9-]{36}$/.test(cursor.id))throw new ApiError(400,"INVALID_REQUEST","Invalid audit cursor.");}
    return database.scoped({...scope,permission:"audit:read"},async tx=>{
      const rows=(await tx.query("SELECT id::text,actor_id::text,action,entity_id::text,created_at::text FROM saas.audit_events WHERE company_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT 51",[tx.companyId,cursor?.at??null,cursor?.id??null])).rows;
      // Preserve PostgreSQL microseconds in the cursor; JS Date truncation can
      // skip events sharing a millisecond at a page boundary.
      const items=rows.slice(0,50),last=items[items.length-1];return {items,before:rows.length>50?Buffer.from(JSON.stringify({at:String(last.created_at),id:last.id})).toString("base64url"):null};
    });
  }
};}
