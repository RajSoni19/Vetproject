// Stage B commands, intentionally unmounted until real PostgreSQL tests pass.
import {randomUUID} from "node:crypto";
import {ApiError,uuid} from "@/lib/server/api-v1";
import {contactInput,invoiceInput,listInput,digest,mutationKey,versionNumber} from "@/lib/server/saas/invoice-contracts";
import {vatPeriod,money} from "@/lib/server/saas/vat";
import type {CompanyDatabase,CompanyScope,CompanyTransaction} from "@/lib/server/saas/transactions";
import type {CompanyPermission} from "@/lib/server/saas/permissions";
import {invoiceSoftDeleteEnabled} from "@/lib/server/saas/invoice-soft-delete";
import {parseExtraction} from "@/lib/server/stage1/extraction";

function minorAmount(value:string){if(!/^-?\d+\.\d{2}$/.test(value))throw new ApiError(503,"UNAVAILABLE","Invoice payment amount is unavailable.");return BigInt(value.replace(".",""));}
export function invoiceConflict(message="This record changed or conflicts with an existing record."):never{throw new ApiError(409,"CONFLICT",message);}
export function assertCapability(tx:CompanyTransaction,allowed:readonly CompanyPermission[]){if(!allowed.includes(tx.permission))throw new ApiError(403,"FORBIDDEN","Company permission required.");}
export async function businessAudit(tx:CompanyTransaction,action:string,entity:string){
  await tx.query("INSERT INTO saas.audit_events(company_id,actor_id,action,entity_id,request_id) VALUES($1,$2,$3,$4,$5)",[tx.companyId,tx.actorId,action,entity,randomUUID()]);
}
export async function businessCommand<T>(tx:CompanyTransaction,operation:string,key:string,payload:unknown,work:()=>Promise<T>):Promise<T>{
  const hash=digest(mutationKey(key)),payloadHash=digest(payload);
  await tx.query("INSERT INTO business.command_keys(company_id,actor_id,permission,operation,key_hash,payload_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",[tx.companyId,tx.actorId,tx.permission,operation,hash,payloadHash]);
  const row=(await tx.query("SELECT payload_hash,response FROM business.command_keys WHERE company_id=$1 AND actor_id=$2 AND operation=$3 AND key_hash=$4 FOR UPDATE",[tx.companyId,tx.actorId,operation,hash])).rows[0];
  if(!row||row.payload_hash!==payloadHash)invoiceConflict("Idempotency key was used for different content.");
  if(row.response!==null)return row.response as T;
  const response=await work();
  await tx.query("UPDATE business.command_keys SET response=$5::jsonb WHERE company_id=$1 AND actor_id=$2 AND operation=$3 AND key_hash=$4",[tx.companyId,tx.actorId,operation,hash,JSON.stringify(response)]);
  return response;
}
export function invoiceService(database:CompanyDatabase){
  const softDelete=invoiceSoftDeleteEnabled(process.env),liveFilter=softDelete?" AND deleted_at IS NULL":"";
  const scoped=<T>(scope:CompanyScope,permissions:readonly CompanyPermission[],work:(tx:CompanyTransaction)=>Promise<T>)=>{
    // Prevent permission substitution before connecting as well as inside SQL.
    if(!permissions.includes(scope.permission))throw new ApiError(403,"FORBIDDEN","Company permission required.");
    return database.scoped(scope,async tx=>{assertCapability(tx,permissions);return work(tx);});
  };
  async function storeLines(tx:CompanyTransaction,id:string,input:ReturnType<typeof invoiceInput>){
    let position=0;
    for(const line of input.calculation.lines){
      await tx.query("INSERT INTO business.invoice_lines(company_id,invoice_id,position,description,quantity,unit_price,discount,rate,treatment,pricing,net,vat,gross) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[tx.companyId,id,++position,line.description,line.quantity,line.unitPrice,line.discount,line.rate,line.treatment,line.pricing,line.net,line.vat,line.gross]);
    }
  }
  async function lockDraft(tx:CompanyTransaction,id:string,version:number){
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,832))",[id]);
    const row=(await tx.query(`SELECT * FROM business.invoices WHERE company_id=$1 AND id=$2${softDelete?" AND deleted_at IS NULL":""} FOR UPDATE`,[tx.companyId,id])).rows[0];
    if(!row||row.state!=="draft"||row.version!==version)invoiceConflict("A current draft version is required.");return row;
  }
  return {
    saveContact(scope:CompanyScope,value:unknown,key:string,existing?:{id:string;version:number}){
      const input=contactInput(value),id=existing?uuid(existing.id).toLowerCase():randomUUID(),version=existing?versionNumber(existing.version):null;
      return scoped(scope,["contacts:write"],tx=>businessCommand(tx,"contact.save",key,{id:existing?.id??null,version,input},async()=>{
        const row=existing?(await tx.query("UPDATE business.counterparties SET name=$4,email=$5,phone=$6,vat_number=$7,address=$8,status=$9,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 AND version=$3 AND kind=$10 RETURNING id::text,version",[tx.companyId,id,version,input.name,input.email,input.phone,input.vatNumber,input.address,input.status,input.kind])).rows[0]:
          (await tx.query("INSERT INTO business.counterparties(id,company_id,kind,name,email,phone,vat_number,address,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text,version",[id,tx.companyId,input.kind,input.name,input.email,input.phone,input.vatNumber,input.address,input.status])).rows[0];
        if(!row)invoiceConflict();await businessAudit(tx,"contact.saved",id);return row;
      }));
    },
    contacts(scope:CompanyScope,search:URLSearchParams){const f=listInput(search,"contacts");return scoped(scope,["contacts:read"],async tx=>{
      const rows=(await tx.query("SELECT id::text,kind,name,email,phone,vat_number,address,status,version FROM business.counterparties WHERE company_id=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3::text IS NULL OR kind=$3) AND ($4::text IS NULL OR strpos(lower(name),lower($4))>0) ORDER BY id LIMIT $5",[tx.companyId,f.after,f.kind,f.query,f.limit+1])).rows;
      return {items:rows.slice(0,f.limit),after:rows.length>f.limit?String(rows[f.limit-1].id):null};
    });},
    contactDetail(scope:CompanyScope,idValue:string){const id=uuid(idValue).toLowerCase();return scoped(scope,['contacts:read'],async tx=>{
      const contact=(await tx.query('SELECT id::text,kind,name,email,phone,vat_number,address,status,version FROM business.counterparties WHERE company_id=$1 AND id=$2',[tx.companyId,id])).rows[0];
      if(!contact)throw new ApiError(404,'INVALID_REQUEST','Contact is unavailable.');return contact;
    });},
    create(scope:CompanyScope,value:unknown,key:string){
      const input=invoiceInput(value);
      return scoped(scope,[input.kind==="credit-note"?"invoices:correct":"invoices:write"],tx=>businessCommand(tx,"invoice.create",key,input,async()=>{
        const id=randomUUID(),c=input.calculation;
        const row=(await tx.query("INSERT INTO business.invoices(id,company_id,contact_id,direction,kind,number,number_key,issued_on,due_on,currency,rounding,credit_for_id,notes,calculation,net,vat,gross,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18) RETURNING id::text,version,state",[id,tx.companyId,input.contactId,input.direction,input.kind,input.number,input.numberKey,input.issuedOn,input.dueOn,c.policy.currency,c.policy.rounding,input.creditForId,input.notes,JSON.stringify(c),c.net,c.vat,c.gross,tx.actorId])).rows[0];
        if(!row)throw new ApiError(503,"UNAVAILABLE","Invoice was not saved.");
        await storeLines(tx,id,input);await businessAudit(tx,"invoice.created",id);return row;
      }));
    },
    replace(scope:CompanyScope,idValue:string,value:unknown,key:string,expectedVersion:number){
      const id=uuid(idValue).toLowerCase(),input=invoiceInput(value),version=versionNumber(expectedVersion);
      return scoped(scope,[input.kind==="credit-note"?"invoices:correct":"invoices:write"],tx=>businessCommand(tx,"invoice.replace",key,{id,version,input},async()=>{
        const old=await lockDraft(tx,id,version);if(old.kind!==input.kind||old.credit_for_id!==input.creditForId)invoiceConflict("Use a new draft for a different invoice kind or credit origin.");
        const c=input.calculation;
        const row=(await tx.query("UPDATE business.invoices SET contact_id=$3,direction=$4,number=$5,number_key=$6,issued_on=$7,due_on=$8,currency=$9,rounding=$10,notes=$11,calculation=$12::jsonb,net=$13,vat=$14,gross=$15,version=version+1 WHERE company_id=$1 AND id=$2 RETURNING id::text,version,state",[tx.companyId,id,input.contactId,input.direction,input.number,input.numberKey,input.issuedOn,input.dueOn,c.policy.currency,c.policy.rounding,input.notes,JSON.stringify(c),c.net,c.vat,c.gross])).rows[0];
        if(!row)invoiceConflict();await tx.query("DELETE FROM business.invoice_lines WHERE company_id=$1 AND invoice_id=$2",[tx.companyId,id]);await storeLines(tx,id,input);await businessAudit(tx,"invoice.revised",id);return row;
      }));
    },
    confirm(scope:CompanyScope,idValue:string,key:string,expectedVersion:number){const id=uuid(idValue).toLowerCase(),version=versionNumber(expectedVersion);
      return scoped(scope,["invoices:confirm"],tx=>businessCommand(tx,"invoice.confirm",key,{id,version},async()=>{
        await lockDraft(tx,id,version);
        const unsafe=(await tx.query("SELECT a.document_id FROM business.invoice_attachments a JOIN saas.documents d ON d.company_id=a.company_id AND d.id=a.document_id WHERE a.company_id=$1 AND a.invoice_id=$2 AND (d.state<>'clean' OR NOT EXISTS(SELECT 1 FROM saas.document_inspections s WHERE s.company_id=d.company_id AND s.document_id=d.id AND s.object_version=d.object_version AND s.sha256=d.sha256 AND s.verdict='clean')) LIMIT 1",[tx.companyId,id])).rows[0];
        if(unsafe)invoiceConflict("Every attached original must pass trusted malware inspection before this invoice can be confirmed.");
        const row=(await tx.query("UPDATE business.invoices SET state='confirmed',confirmed_by=$3,confirmed_at=now(),version=version+1 WHERE company_id=$1 AND id=$2 RETURNING id::text,version,state",[tx.companyId,id,tx.actorId])).rows[0];
        if(!row)invoiceConflict();await businessAudit(tx,"invoice.confirmed",id);return row;
      }));
    },
    // Permanent erase (migration 049): the invoice, its lines and history are
    // removed. Drafts need invoices:write; confirmed invoices need invoices:confirm.
    eraseInvoice(scope:CompanyScope,idValue:string,key:string,expectedVersion:number,confirmed:boolean){const id=uuid(idValue).toLowerCase(),version=versionNumber(expectedVersion);
      return scoped(scope,[confirmed?"invoices:confirm":"invoices:write"],tx=>businessCommand(tx,"invoice.delete",key,{id,version,erase:true},async()=>{
        const current=(await tx.query("SELECT state,version FROM business.invoices WHERE company_id=$1 AND id=$2 FOR UPDATE",[tx.companyId,id])).rows[0];
        if(!current)throw new ApiError(404,"INVALID_REQUEST","Invoice not found.");
        if(current.state==="confirmed"&&!confirmed)throw new ApiError(403,"FORBIDDEN","Confirm that you want to delete a confirmed invoice.");
        if(Number(current.version)!==version)invoiceConflict();
        await businessAudit(tx,"invoice.deleted",id);
        try{await tx.query("SELECT business.erase_invoice($1::uuid,$2::uuid)",[tx.companyId,id]);}
        catch{throw new ApiError(409,"CONFLICT","This invoice could not be deleted. If it has credit notes, delete those first.");}
        return {id,deleted:true};
      }));
    },
    deleteDraft(scope:CompanyScope,idValue:string,key:string,expectedVersion:number){const id=uuid(idValue).toLowerCase(),version=versionNumber(expectedVersion);
      if(!softDelete)throw new ApiError(503,"UNAVAILABLE","Audited draft deletion is not enabled for this database schema.");
      return scoped(scope,["invoices:write"],tx=>businessCommand(tx,"invoice.delete",key,{id,version},async()=>{
        const draft=await lockDraft(tx,id,version);
        if(draft.deleted_at)invoiceConflict("This draft is already deleted.");
        const row=(await tx.query("UPDATE business.invoices SET deleted_at=now(),deleted_by=$3,version=version+1 WHERE company_id=$1 AND id=$2 AND state='draft' AND deleted_at IS NULL RETURNING id::text,version,state,deleted_at::text",[tx.companyId,id,tx.actorId])).rows[0];
        if(!row)invoiceConflict();await businessAudit(tx,"invoice.deleted",id);return row;
      }));
    },
    attach(scope:CompanyScope,idValue:string,documentValue:string,key:string,expectedVersion:number){const id=uuid(idValue).toLowerCase(),documentId=uuid(documentValue).toLowerCase(),version=versionNumber(expectedVersion);
      return scoped(scope,["invoices:write"],tx=>businessCommand(tx,"invoice.attach",key,{id,documentId,version},async()=>{
        await lockDraft(tx,id,version);
        const doc=(await tx.query("SELECT id::text,state,object_version,sha256 FROM saas.documents WHERE company_id=$1 AND id=$2",[tx.companyId,documentId])).rows[0];if(!doc)throw new ApiError(403,"FORBIDDEN","Owned original required.");
        await tx.query("INSERT INTO business.invoice_attachments(company_id,invoice_id,document_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[tx.companyId,id,documentId]);
        if(doc.state==="clean"){
          await tx.query("INSERT INTO business.extraction_jobs(company_id,invoice_id,document_id,object_version,sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[tx.companyId,id,documentId,doc.object_version,doc.sha256]);
          const schemaReady=(await tx.query(`SELECT to_regclass('business.invoice_tax_reviews') IS NOT NULL AND EXISTS(
            SELECT 1 FROM pg_constraint WHERE conrelid='business.invoice_lines'::regclass AND conname='invoice_lines_treatment_check' AND pg_get_constraintdef(oid) LIKE '%not-evidenced%'
          ) AS ready`)).rows[0]?.ready===true;
          if(schemaReady){
            const evidence=(await tx.query(`SELECT DISTINCT r.observations->'extraction'->>'vat' AS vat FROM business.extraction_jobs j
              JOIN business.extraction_results r ON r.company_id=j.company_id AND r.job_id=j.id
              WHERE j.company_id=$1 AND j.invoice_id=$2 AND j.document_id=$3 AND j.state='completed'`,[tx.companyId,id,documentId])).rows
              .map(row=>typeof row.vat==="string"&&/^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(row.vat)?row.vat:null).filter((value):value is string=>value!==null);
            const detected=[...new Set(evidence)],vat=detected.length===1?detected[0]:null;
            await tx.query(`INSERT INTO business.invoice_tax_reviews(company_id,invoice_id,detected_vat,detection_status,claim_status,tax_treatment,accounting_scheme,version)
              VALUES($1,$2,$3,$4,'review-required','unknown','invoice',1) ON CONFLICT(company_id,invoice_id) DO NOTHING`,
              [tx.companyId,id,vat,vat?"detected":"not-evidenced"]);
          }
        }
        await businessAudit(tx,"invoice.original-attached",id);return {id,documentId,state:doc.state};
      }));
    },
    list(scope:CompanyScope,search:URLSearchParams){const f=listInput(search);return scoped(scope,["invoices:read"],async tx=>{
      const rows=(await tx.query(`SELECT id::text,contact_id::text,coalesce(contact_snapshot->>'name','') AS contact_name,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS') AS created_at,direction,kind,number,issued_on::text,due_on::text,currency,state,net::text,vat::text,gross::text,version FROM business.invoices WHERE company_id=$1${liveFilter} AND ($2::uuid IS NULL OR id>$2) AND ($3::text IS NULL OR direction=$3) AND ($4::text IS NULL OR state=$4) AND ($5::uuid IS NULL OR contact_id=$5) AND ($6::text IS NULL OR strpos(lower(number),lower($6))>0) ORDER BY id LIMIT $7`,[tx.companyId,f.after,f.direction,f.status,f.contactId,f.query,f.limit+1])).rows;
      return {items:rows.slice(0,f.limit),after:rows.length>f.limit?String(rows[f.limit-1].id):null};
    });},
    detail(scope:CompanyScope,idValue:string){const id=uuid(idValue).toLowerCase();return scoped(scope,["invoices:read"],async tx=>{
      const invoice=(await tx.query(`SELECT i.*,i.issued_on::text AS issued_on,i.due_on::text AS due_on FROM business.invoices i WHERE company_id=$1 AND id=$2${liveFilter.replaceAll("deleted_at","i.deleted_at")}`,[tx.companyId,id])).rows[0];if(!invoice)throw new ApiError(403,"FORBIDDEN","Invoice access denied.");
      const lines=(await tx.query("SELECT * FROM business.invoice_lines WHERE company_id=$1 AND invoice_id=$2 ORDER BY position",[tx.companyId,id])).rows;
      const history=(await tx.query("SELECT version,snapshot,actor_id::text,created_at FROM business.invoice_revisions WHERE company_id=$1 AND invoice_id=$2 ORDER BY version",[tx.companyId,id])).rows;
      const attachments=(await tx.query("SELECT a.document_id::text,d.original_name,d.state FROM business.invoice_attachments a JOIN saas.documents d ON d.company_id=a.company_id AND d.id=a.document_id WHERE a.company_id=$1 AND a.invoice_id=$2",[tx.companyId,id])).rows;
      return {invoice,lines,history,attachments};
    });},
    extraction(scope:CompanyScope,documentValue:string){const documentId=uuid(documentValue).toLowerCase();return scoped(scope,["documents:read"],async tx=>{
      const document=(await tx.query("SELECT d.state,d.object_version,d.sha256,EXISTS(SELECT 1 FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 AND i.verdict='clean') AS clean_inspection FROM saas.documents d WHERE d.company_id=$1 AND d.id=$2",[tx.companyId,documentId])).rows[0];
      if(!document)throw new ApiError(404,"INVALID_REQUEST","Document is unavailable.");
      if(document.state!=="clean"||document.clean_inspection!==true)return {state:"pending-inspection",pages:[],reviewRequired:true};
      const job=(await tx.query("SELECT j.id::text,j.state,j.attempts,j.error_code FROM business.extraction_jobs j WHERE j.company_id=$1 AND j.document_id=$2 AND j.object_version=$3 AND j.sha256=$4 ORDER BY j.created_at DESC LIMIT 1",[tx.companyId,documentId,document.object_version,document.sha256])).rows[0];
      if(!job)return {state:"pending-inspection",pages:[],reviewRequired:true};
      const pages=job.state==="completed"?(await tx.query("SELECT page,observations,engine,created_at FROM business.extraction_results WHERE company_id=$1 AND job_id=$2 ORDER BY page",[tx.companyId,job.id])).rows:[];
      const hasRawText=(observations:unknown):observations is Record<string,unknown>&{text:string}=>typeof observations==="object"&&observations!==null&&"text" in observations&&typeof observations.text==="string";
      if(!pages.some(page=>hasRawText(page.observations)))return {job,pages,reviewRequired:true};
      const suppliers=(await tx.query("SELECT id::text,name,coalesce(vat_number,'') AS \"vatNumber\" FROM business.counterparties WHERE company_id=$1 AND kind='supplier' ORDER BY id LIMIT 1000",[tx.companyId])).rows.map(row=>({id:String(row.id),name:String(row.name),vatNumber:String(row.vatNumber??"")}));
      const interpreted=pages.map(page=>hasRawText(page.observations)
        ?{...page,observations:{...page.observations,extraction:parseExtraction(page.observations.text,suppliers,page.observations.layout)}}
        :page);
      return {job,pages:interpreted,reviewRequired:true};
    });},
    exportInvoice(scope:CompanyScope,idValue:string){const id=uuid(idValue).toLowerCase();return scoped(scope,["reports:export"],async tx=>{
      const invoice=(await tx.query(`SELECT i.id::text,i.contact_id::text,i.number,i.direction,i.kind,i.issued_on::text,i.due_on::text,i.currency,i.state,i.net::text,i.vat::text,i.gross::text,i.contact_snapshot,i.version,
        coalesce(i.contact_snapshot->>'name',c.name,'') AS supplier_name,coalesce(i.contact_snapshot->>'email',c.email,'') AS supplier_email,
        coalesce(i.contact_snapshot->>'phone',c.phone,'') AS supplier_phone,coalesce(i.contact_snapshot->>'address',c.address,'') AS supplier_address,
        coalesce(i.contact_snapshot->>'vatNumber',c.vat_number,'') AS supplier_vat_number
        FROM business.invoices i LEFT JOIN business.counterparties c ON c.company_id=i.company_id AND c.id=i.contact_id
        WHERE i.company_id=$1 AND i.id=$2${liveFilter.replaceAll("deleted_at","i.deleted_at")}`,[tx.companyId,id])).rows[0];if(!invoice)throw new ApiError(403,"FORBIDDEN","Invoice access denied.");
      const lines=(await tx.query("SELECT position,description,quantity::text,unit_price::text,discount::text,treatment,rate::text,pricing,net::text,vat::text,gross::text FROM business.invoice_lines WHERE company_id=$1 AND invoice_id=$2 ORDER BY position",[tx.companyId,id])).rows;
      const referenceRow=(await tx.query(`SELECT d.id::text||' · '||d.original_name AS value FROM business.invoice_attachments a
        JOIN saas.documents d ON d.company_id=a.company_id AND d.id=a.document_id
        WHERE a.company_id=$1 AND a.invoice_id=$2 ORDER BY d.created_at DESC,d.id LIMIT 1`,[tx.companyId,id])).rows[0] as {value?:string}|undefined;
      const reference=typeof referenceRow?.value==="string"?referenceRow.value:null;
      const financialReady=(await tx.query("SELECT to_regclass('business.invoice_payments') IS NOT NULL AND to_regclass('business.invoice_tax_reviews') IS NOT NULL AS ready")).rows[0]?.ready===true;
      let taxReview={evidencedVat:null as string|null,evidenceStatus:"schema approval pending",claimStatus:"schema approval pending",taxTreatment:"unknown"};
      let payment={status:"schema approval pending",method:null as string|null,amountPaid:null as string|null,balanceDue:null as string|null};
      if(financialReady){
        const tax=(await tx.query(`SELECT detected_vat::text,detection_status,evidenced_vat::text,evidence_verified,claim_status,tax_treatment
          FROM business.invoice_tax_reviews WHERE company_id=$1 AND invoice_id=$2`,[tx.companyId,id])).rows[0] as
          {detection_status:string;evidenced_vat:string|null;evidence_verified:boolean;claim_status:string;tax_treatment:string}|undefined;
        const detectedTax=tax?.detection_status==="not-evidenced"||!tax?"not-evidenced / pending review":tax.evidence_verified?"evidence verified": "detected — pending review";
        taxReview={evidencedVat:tax?.evidence_verified?tax.evidenced_vat:null,evidenceStatus:detectedTax,claimStatus:tax?.claim_status??"review-required",taxTreatment:tax?.tax_treatment??"unknown"};
        const payments=(await tx.query(`SELECT coalesce(sum(amount),0)::numeric(14,2)::text AS paid,string_agg(DISTINCT method,', ' ORDER BY method) AS methods
          FROM business.invoice_payments WHERE company_id=$1 AND invoice_id=$2`,[tx.companyId,id])).rows[0] as {paid:string;methods:string|null}|undefined;
        if(!payments)throw new ApiError(503,"UNAVAILABLE","Invoice payment summary is unavailable.");
        const applicable=invoice.state==="confirmed"&&invoice.kind==="invoice"&&minorAmount(String(invoice.gross))>BigInt(0),paid=payments.paid;
        const paidMinor=minorAmount(String(paid)),grossMinor=minorAmount(String(invoice.gross));
        const status=!applicable?"not-applicable":paidMinor===BigInt(0)?"unpaid / due":paidMinor<grossMinor?"partially paid":"fully paid";
        payment={status,method:payments.methods,amountPaid:applicable?paid:null,balanceDue:applicable?money(grossMinor-paidMinor):null};
      }
      return {companyId:tx.companyId,invoice,lines,reference,taxReview,payment};
    });},
    vatReport(scope:CompanyScope,value:unknown){const period=vatPeriod(value);return scoped(scope,["reports:read","reports:export"],async tx=>{
      const schemaReady=(await tx.query("SELECT to_regclass('business.invoice_tax_reviews') IS NOT NULL AND to_regclass('business.invoice_payments') IS NOT NULL AS ready")).rows[0]?.ready===true;
      if(!schemaReady)throw new ApiError(503,"UNAVAILABLE","VAT claim-ready reporting is awaiting the reviewed evidence and payment schema approval.");
      const values=[tx.companyId,period.startsOn,period.endsOn,period.currency];
      const output=(await tx.query(`SELECT 'sale'::text AS direction,l.treatment,l.rate::text,sum(l.net)::text AS net,sum(l.vat)::text AS vat,sum(l.gross)::text AS gross
       FROM business.invoices i JOIN business.invoice_lines l ON l.company_id=i.company_id AND l.invoice_id=i.id
       WHERE i.company_id=$1 AND i.deleted_at IS NULL${liveFilter.replaceAll("deleted_at","i.deleted_at")} AND i.state='confirmed' AND i.direction='sale'
        AND i.issued_on BETWEEN $2::date AND $3::date AND i.currency=$4
       GROUP BY l.treatment,l.rate ORDER BY l.treatment,l.rate`,values)).rows;
      const input=(await tx.query(`SELECT 'purchase'::text AS direction,t.tax_treatment AS treatment,NULL::text AS rate,'0.00'::text AS net,
        sum(CASE WHEN t.accounting_scheme='invoice' THEN CASE WHEN i.kind='credit-note' THEN -t.evidenced_vat ELSE t.evidenced_vat END
          ELSE round(t.evidenced_vat*least(i.gross,coalesce(pay.before_period,0)+coalesce(pay.in_period,0))/i.gross,2)
            -round(t.evidenced_vat*least(i.gross,coalesce(pay.before_period,0))/i.gross,2) END)::numeric(14,2)::text AS vat,
        '0.00'::text AS gross
       FROM business.invoices i JOIN business.invoice_tax_reviews t ON t.company_id=i.company_id AND t.invoice_id=i.id
       LEFT JOIN LATERAL (SELECT sum(p.amount) FILTER(WHERE p.evidence_verified AND p.paid_on<$2::date) AS before_period,
         sum(p.amount) FILTER(WHERE p.evidence_verified AND p.paid_on BETWEEN $2::date AND $3::date) AS in_period
        FROM business.invoice_payments p WHERE p.company_id=i.company_id AND p.invoice_id=i.id) pay ON true
       WHERE i.company_id=$1 AND i.deleted_at IS NULL${liveFilter.replaceAll("deleted_at","i.deleted_at")} AND i.state='confirmed' AND i.direction='purchase' AND i.kind IN('invoice','credit-note') AND i.currency=$4
        AND t.claim_status='eligible' AND t.evidence_verified AND t.evidenced_vat IS NOT NULL AND i.gross<>0
        AND ((t.accounting_scheme='invoice' AND i.issued_on BETWEEN $2::date AND $3::date)
          OR (t.accounting_scheme='cash' AND i.kind='invoice' AND i.gross>0 AND coalesce(pay.in_period,0)>0))
       GROUP BY t.tax_treatment,t.accounting_scheme ORDER BY t.tax_treatment,t.accounting_scheme`,values)).rows;
      const rows=[...output,...input];
      // Sales output follows confirmed invoice lines. Input VAT is included only
      // after evidence verification and eligibility; cash-basis claims follow
      // verified payment evidence within the selected period.
      let claimedInput=BigInt(0),outputVat=BigInt(0);for(const row of rows){
        if(typeof row.vat!=="string"||!/^\-?\d+\.\d{2}$/.test(row.vat)||!["purchase","sale"].includes(String(row.direction)))throw new ApiError(503,"UNAVAILABLE","Report totals are unavailable.");
        const minor=BigInt(row.vat.replace(".",""));if(row.direction==="purchase")claimedInput+=minor;else outputVat+=minor;
      }
      return {period,groups:rows,inputVat:money(claimedInput),outputVat:money(outputVat),netVat:money(outputVat-claimedInput),kind:"management-vat-draft",hmrcSubmission:false};
    });}
  };
}
