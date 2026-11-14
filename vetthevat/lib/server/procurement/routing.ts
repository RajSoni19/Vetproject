import {ApiError,objectBody,uuid} from "@/lib/server/api-v1";
import {businessCommand,businessAudit,invoiceConflict} from "@/lib/server/saas/invoices";
import {versionNumber} from "@/lib/server/saas/invoice-contracts";
import type {CompanyDatabase,CompanyScope} from "@/lib/server/saas/transactions";
export const routingSchemaSha256='a896aea6434140df72c679170aa8abc06fa3386de6670bde234f4c1d27ad83e5';
export const routingCommandSha256='3b8bd396a5fac014975cd1561850b9a171ec967e75bc47f7aefa660e6a747792';
export const routingEnabled=(env:Readonly<Record<string,string|undefined>>)=>env.SAAS_INVOICE_ROUTING_ENABLED==='1'&&env.SAAS_INVOICE_ROUTING_SCHEMA_SHA256===routingSchemaSha256&&env.SAAS_INVOICE_ROUTING_COMMAND_SHA256===routingCommandSha256;
export function purposeInput(value:unknown){const input=objectBody(value,['purpose']);if(!['ors','vat','both'].includes(String(input.purpose)))throw new ApiError(400,'INVALID_REQUEST','Choose ORS, VAT or Both.');return input.purpose as 'ors'|'vat'|'both';}
export function invoiceRouting(database:CompanyDatabase){return {
 read(scope:CompanyScope,documentId:string){if(scope.permission!=='documents:read')throw new ApiError(403,'FORBIDDEN','Document permission required.');const id=uuid(documentId);return database.scoped(scope,async tx=>{
  if(!(await tx.query('SELECT id FROM saas.documents WHERE company_id=$1 AND id=$2',[tx.companyId,id])).rows[0])throw new ApiError(404,'INVALID_REQUEST','Document unavailable.');
  return (await tx.query('SELECT purpose,version FROM invoice_routing.purposes WHERE company_id=$1 AND document_id=$2',[tx.companyId,id])).rows[0]??null;
 });},
 save(scope:CompanyScope,documentId:string,value:unknown,key:string,expected:number){if(scope.permission!=='documents:write')throw new ApiError(403,'FORBIDDEN','Document write permission required.');const id=uuid(documentId),purpose=purposeInput(value),version=versionNumber(expected);
  return database.scoped(scope,tx=>businessCommand(tx,'document.purpose',key,{id,purpose,version},async()=>{
   // The selected purpose never grants any module permission or creates stock.
   if(!(await tx.query("SELECT id FROM saas.documents WHERE company_id=$1 AND id=$2 AND saas.authorized_company(company_id,'documents:read') AND ($3='vat' OR saas.authorized_company(company_id,'procurement:write')) AND ($3='ors' OR saas.authorized_company(company_id,'invoices:write'))",[tx.companyId,id,purpose])).rows[0])throw new ApiError(403,'FORBIDDEN','Document and selected module write permissions are required.');
   const created=(await tx.query('INSERT INTO invoice_routing.purposes(company_id,document_id,purpose,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING purpose,version',[tx.companyId,id,purpose,tx.actorId])).rows[0];
   if(created){if(version!==1)invoiceConflict();await businessAudit(tx,'document.purpose-selected',id);return created;}
   const previous=(await tx.query('SELECT purpose,version FROM invoice_routing.purposes WHERE company_id=$1 AND document_id=$2 FOR UPDATE',[tx.companyId,id])).rows[0];if(!previous||Number(previous.version)!==version)invoiceConflict();
   if(previous.purpose===purpose)return previous;
   const row=(await tx.query('UPDATE invoice_routing.purposes SET purpose=$3,version=version+1,updated_by=$4 WHERE company_id=$1 AND document_id=$2 RETURNING purpose,version',[tx.companyId,id,purpose,tx.actorId])).rows[0];await businessAudit(tx,'document.purpose-changed',id);return row;
  }));
 }
};}
