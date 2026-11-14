import type { Sql } from "@/lib/server/web-auth/store";
import { ApiError,uuid } from "@/lib/server/api-v1";
// Separate business-role transaction connection required. No HTTP financial
// endpoint is wired here. RLS verifies the real session hash, never a user GUC.
export const businessTables={invoices:"invoices",invoiceLineItems:"invoice_line_items",suppliers:"suppliers",customers:"customers",documents:"documents",orsOrders:"ors_orders",orsOrderItems:"ors_order_items",inventory:"inventory"} as const;
export async function scopedBusinessRepository(sql:Sql,sessionHash:string,companyId:string){
 if(!/^[a-f0-9]{64}$/.test(sessionHash))throw new ApiError(401,"UNAUTHENTICATED","Sign in required.");const company=uuid(companyId);
 await sql.query("SELECT set_config('app.session_hash',$1,true)",[sessionHash]);
 const allowed=(await sql.query("SELECT web_auth.can_access_company($1,'invoices:read') AS allowed",[company])).rows[0];if(!allowed?.allowed)throw new ApiError(403,"FORBIDDEN","Company permission required.");
 return {
  list:async(kind:keyof typeof businessTables)=>{if(!Object.hasOwn(businessTables,kind))throw new ApiError(400,"INVALID_REQUEST","Invalid repository.");const table=businessTables[kind];return (await sql.query(`SELECT * FROM web_business.${table} WHERE company_id=$1 ORDER BY id LIMIT 100`,[company])).rows;},
  find:async(kind:keyof typeof businessTables,id:string)=>{if(!Object.hasOwn(businessTables,kind))throw new ApiError(400,"INVALID_REQUEST","Invalid repository.");const table=businessTables[kind];return (await sql.query(`SELECT * FROM web_business.${table} WHERE company_id=$1 AND id=$2`,[company,uuid(id)])).rows[0]??null;}
 };
}
