import {uuid} from "@/lib/server/api-v1";
import type {CompanyDatabase,CompanyScope} from "@/lib/server/saas/transactions";

// A client company ID is only a selector; the scoped transaction verifies live
// membership, locks authorization rows and binds tenant RLS before this runs.
export function companyService(database:CompanyDatabase){
  return {
    selection(scope:Omit<CompanyScope,"permission">){return database.scoped({...scope,permission:"company:read"},async tx=>{
      const row=(await tx.query("SELECT company_id::text FROM saas.company_selections WHERE session_id=$1",[tx.sessionId])).rows[0];
      return {companyId:row?String(row.company_id):null};
    });},
    context(scope:Omit<CompanyScope,"permission">){return database.scoped({...scope,permission:"company:read"},async tx=>{
      const row=(await tx.query("SELECT * FROM saas.company_context($1)",[tx.companyId])).rows[0];
      return row??null;
    });},
    select(scope:Omit<CompanyScope,"permission">){return database.scoped({...scope,companyId:uuid(scope.companyId),permission:"company:read"},async tx=>{
      await tx.query("INSERT INTO saas.company_selections(session_id,company_id) VALUES($1,$2) ON CONFLICT(session_id) DO UPDATE SET company_id=excluded.company_id,updated_at=now()",[tx.sessionId,tx.companyId]);
      await tx.query("INSERT INTO saas.audit_events(company_id,actor_id,action,entity_id,request_id) VALUES($1,$2,'company.selected',$1,gen_random_uuid())",[tx.companyId,tx.actorId]);
      return {companyId:tx.companyId};
    });}
  };
}
