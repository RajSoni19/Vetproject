import {createHash,randomUUID} from "node:crypto";
import {ApiError,pagination,uuid} from "@/lib/server/api-v1";
import {uploadMetadata,originalKey,checkOriginal,type PrivateOriginalStore,type StoredOriginal} from "@/lib/server/saas/object-storage";
import type {CompanyDatabase,CompanyScope,CompanyTransaction} from "@/lib/server/saas/transactions";
import type {boundedUpload} from "@/lib/server/stage1/documents";

type Upload=Awaited<ReturnType<typeof boundedUpload>>;
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
function documentListInput(search:URLSearchParams){
  if([...search.keys()].some(key=>!['limit','cursor'].includes(key)||search.getAll(key).length!==1))throw new ApiError(400,'INVALID_REQUEST','Invalid document pagination.');
  const {limit,cursor}=pagination(search);if(!cursor)return {limit,at:null as string|null,id:null as string|null};
  try{const value=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(!value||typeof value.at!=='string'||!Number.isFinite(Date.parse(value.at))||typeof value.id!=='string')throw Error();return {limit,at:value.at,id:uuid(value.id).toLowerCase()};}catch{throw new ApiError(400,'INVALID_REQUEST','Invalid document cursor.');}
}
async function audit(tx:CompanyTransaction,action:string,id:string){await tx.query("INSERT INTO saas.audit_events(company_id,actor_id,action,entity_id,request_id) VALUES($1,$2,$3,$4,$5)",[tx.companyId,tx.actorId,action,id,randomUUID()]);}
export function documentWorkflow(database:CompanyDatabase,storage:PrivateOriginalStore|undefined){
  return {
    async list(scope:Omit<CompanyScope,"permission">,search:URLSearchParams,includePurpose=false){
      const filter=documentListInput(search);
      return database.scoped({...scope,permission:"documents:read"},async tx=>{
        const purpose=includePurpose?"(SELECT p.purpose FROM invoice_routing.purposes p WHERE p.company_id=d.company_id AND p.document_id=d.id)":"NULL::text";
        const rows=(await tx.query(`SELECT d.id::text,d.original_name,d.mime_type,d.byte_size::text,d.state,d.created_at::text AS created_at,${purpose} AS purpose,(SELECT i.verdict FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 ORDER BY i.created_at DESC LIMIT 1) AS inspection,(SELECT j.state FROM business.extraction_jobs j WHERE j.company_id=d.company_id AND j.document_id=d.id ORDER BY j.created_at DESC LIMIT 1) AS extraction FROM saas.documents d WHERE d.company_id=$1 AND ($2::timestamptz IS NULL OR (d.created_at,d.id)<($2::timestamptz,$3::uuid)) ORDER BY d.created_at DESC,d.id DESC LIMIT $4`,[tx.companyId,filter.at,filter.id,filter.limit+1])).rows;
        const items=rows.slice(0,filter.limit),last=items[items.length-1];return {items,nextCursor:rows.length>filter.limit?Buffer.from(JSON.stringify({at:String(last.created_at),id:last.id})).toString('base64url'):null};
      });
    },
    async status(scope:Omit<CompanyScope,"permission">,documentId:string){
      return database.scoped({...scope,permission:"documents:read"},async tx=>{
        const row=(await tx.query("SELECT d.id::text,d.original_name,d.mime_type,d.byte_size::text,d.state,d.created_at,(SELECT json_build_object('state',j.state,'attempts',j.attempts,'lease_until',j.lease_until,'available_at',j.available_at) FROM saas.document_jobs j WHERE j.company_id=d.company_id AND j.document_id=d.id AND j.kind='inspect' ORDER BY j.created_at DESC LIMIT 1) AS inspection_job,(SELECT json_build_object('state',j.state,'attempts',j.attempts,'error_code',j.error_code) FROM business.extraction_jobs j WHERE j.company_id=d.company_id AND j.document_id=d.id AND j.object_version=d.object_version AND j.sha256=d.sha256 ORDER BY j.created_at DESC LIMIT 1) AS extraction_job,(SELECT i.verdict FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 ORDER BY i.created_at DESC LIMIT 1) AS inspection,(SELECT j.state FROM business.extraction_jobs j WHERE j.company_id=d.company_id AND j.document_id=d.id ORDER BY j.created_at DESC LIMIT 1) AS extraction FROM saas.documents d WHERE d.company_id=$1 AND d.id=$2",[tx.companyId,uuid(documentId)])).rows[0];
        if(!row)throw new ApiError(404,"INVALID_REQUEST","Document is unavailable.");
        return row;
      });
    },
    async intake(scope:Omit<CompanyScope,"permission">,input:Upload,idempotencyKey:string){
      if(!storage)throw new ApiError(503,"UNAVAILABLE","Private original storage is not configured.");
      if(!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)||!input.originalName||input.originalName.length>200||/[\\/\x00-\x1f\x7f]/.test(input.originalName))throw new ApiError(400,"INVALID_REQUEST","Invalid upload reference or name.");
      const metadata=uploadMetadata({...input,companyId:scope.companyId,documentId:randomUUID(),mime:input.mimeType});
      if(metadata.sha256!==input.sha256||metadata.byteSize!==input.byteSize)throw new ApiError(400,"INVALID_REQUEST","Upload integrity mismatch.");
      const keyHash=digest(idempotencyKey),payloadHash=digest(JSON.stringify({name:input.originalName,mime:input.mimeType,sha256:metadata.sha256,byteSize:metadata.byteSize}));
      const access={...scope,permission:"documents:write" as const};
      const reserved=await database.scoped(access,async tx=>{
        await tx.query("INSERT INTO saas.idempotency_keys(company_id,user_id,operation,key_hash,payload_hash) VALUES($1,$2,'document.upload',$3,$4) ON CONFLICT DO NOTHING",[tx.companyId,tx.actorId,keyHash,payloadHash]);
        const key=(await tx.query("SELECT payload_hash,response FROM saas.idempotency_keys WHERE company_id=$1 AND user_id=$2 AND operation='document.upload' AND key_hash=$3 FOR UPDATE",[tx.companyId,tx.actorId,keyHash])).rows[0];
        if(!key||key.payload_hash!==payloadHash)throw new ApiError(409,"CONFLICT","Upload reference was already used for different content.");
        if(key.response){const response=key.response as {id:string;state:string};return {id:uuid(response.id),state:response.state,existing:true};}
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,8734))",[`original:${tx.companyId}:${metadata.sha256}`]);
        const old=(await tx.query("SELECT id::text,state FROM saas.documents WHERE company_id=$1 AND sha256=$2",[tx.companyId,metadata.sha256])).rows[0];
        if(old)return {id:uuid(old.id),state:String(old.state),existing:true};
        const id=randomUUID(),objectKey=originalKey(tx.companyId,id,metadata.sha256);
        await tx.query("INSERT INTO saas.documents(id,company_id,original_name,mime_type,byte_size,sha256,object_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,tx.companyId,input.originalName,input.mimeType,input.byteSize,input.sha256,objectKey,tx.actorId]);
        await audit(tx,"document.reserved",id);return {id,state:"awaiting_upload",existing:false};
      });
      if(reserved.state!=="awaiting_upload")return {id:reserved.id,state:reserved.state,duplicate:true};
      // Object I/O is outside the SQL transaction. A timeout or uncertain COMMIT
      // never deletes an original. Retrying uses the reserved ID + immutable key.
      const stored=await storage.put({companyId:scope.companyId,documentId:reserved.id,mime:input.mimeType,bytes:input.bytes});
      checkOriginal(stored);
      if(stored.key!==originalKey(scope.companyId,reserved.id,metadata.sha256)||stored.sha256!==metadata.sha256||stored.byteSize!==metadata.byteSize)throw new ApiError(503,"UNAVAILABLE","Original storage receipt did not match.");
      return database.scoped(access,async tx=>{
        const document=(await tx.query("SELECT state,object_version FROM saas.documents WHERE company_id=$1 AND id=$2 FOR UPDATE",[tx.companyId,reserved.id])).rows[0];
        if(!document)throw new ApiError(503,"UNAVAILABLE","Reserved document is unavailable.");
        if(document.state==="awaiting_upload"){
          await tx.query("UPDATE saas.documents SET object_version=$3,state='quarantined' WHERE company_id=$1 AND id=$2 AND state='awaiting_upload'",[tx.companyId,reserved.id,stored.version]);
          await tx.query("INSERT INTO saas.document_jobs(company_id,document_id,kind) VALUES($1,$2,'inspect') ON CONFLICT(company_id,document_id,kind) DO NOTHING",[tx.companyId,reserved.id]);
          await audit(tx,"document.quarantined",reserved.id);
        }else if(document.object_version!==stored.version)throw new ApiError(409,"CONFLICT","Original version changed; operator reconciliation is required.");
        const response={id:reserved.id,state:document.state==="awaiting_upload"?"quarantined":String(document.state),duplicate:reserved.existing};
        await tx.query("UPDATE saas.idempotency_keys SET response=$4::jsonb WHERE company_id=$1 AND user_id=$2 AND operation='document.upload' AND key_hash=$3",[tx.companyId,tx.actorId,keyHash,JSON.stringify(response)]);
        return response;
      });
    },
    async download(scope:Omit<CompanyScope,"permission">,documentId:string){
      if(!storage)throw new ApiError(503,"UNAVAILABLE","Private original storage is not configured.");
      const original=await database.scoped({...scope,permission:"documents:read"},async tx=>{
        const row=(await tx.query("SELECT d.object_key,d.object_version,d.sha256,d.byte_size::text,d.mime_type,d.original_name FROM saas.documents d WHERE d.company_id=$1 AND d.id=$2 AND d.state='clean' AND EXISTS(SELECT 1 FROM saas.document_inspections s WHERE s.company_id=d.company_id AND s.document_id=d.id AND s.object_version=d.object_version AND s.sha256=d.sha256 AND s.verdict='clean')",[tx.companyId,uuid(documentId)])).rows[0];
        if(!row)throw new ApiError(404,"INVALID_REQUEST","A verified original is unavailable.");
        return {original:{key:String(row.object_key),version:String(row.object_version),sha256:String(row.sha256),byteSize:Number(row.byte_size)} satisfies StoredOriginal,mime:String(row.mime_type),name:String(row.original_name)};
      });
      const bytes=await storage.read(original.original);
      if(bytes.byteLength!==original.original.byteSize||createHash("sha256").update(bytes).digest("hex")!==original.original.sha256)throw new ApiError(503,"UNAVAILABLE","Private original integrity check failed.");
      // Storage may take time: revalidate live authorization and safety state
      // before handing bytes to a response. Log only a successfully read original.
      await database.scoped({...scope,permission:"documents:read"},async tx=>{
        const safe=(await tx.query("SELECT d.id FROM saas.documents d WHERE d.company_id=$1 AND d.id=$2 AND d.state='clean' AND d.object_version=$3 AND d.sha256=$4 AND EXISTS(SELECT 1 FROM saas.document_inspections s WHERE s.company_id=d.company_id AND s.document_id=d.id AND s.object_version=d.object_version AND s.sha256=d.sha256 AND s.verdict='clean')",[tx.companyId,uuid(documentId),original.original.version,original.original.sha256])).rows[0];
        if(!safe)throw new ApiError(404,"INVALID_REQUEST","A verified original is unavailable.");
        await audit(tx,"document.downloaded",documentId);
      });
      return {bytes,mime:original.mime,name:original.name};
    }
  };
}
