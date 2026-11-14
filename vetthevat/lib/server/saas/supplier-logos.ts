import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {ApiError,uuid} from "@/lib/server/api-v1";
import type {CompanyDatabase,CompanyScope,CompanyTransaction} from "@/lib/server/saas/transactions";
import {checkPrivateAsset,type PrivateAssetStore,type StoredPrivateAsset,type SupplierLogoMime,supplierLogoMimes,supplierLogoUploadLimit} from "@/lib/server/saas/object-storage";

export type SupplierLogoUpload={bytes:Uint8Array;mime:SupplierLogoMime;sha256:string;byteSize:number};
export async function boundedSupplierLogoUpload(request:Request,env:Readonly<Record<string,string|undefined>>=process.env):Promise<SupplierLogoUpload>{
  const mime=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase(),limit=supplierLogoUploadLimit(env);
  if(!supplierLogoMimes.includes(mime as SupplierLogoMime)||!request.body)throw new ApiError(415,"INVALID_REQUEST","Upload a JPG, PNG or WEBP supplier image.");
  const length=request.headers.get("content-length");
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit))throw new ApiError(413,"INVALID_REQUEST","Supplier image exceeds the configured size limit.");
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw new ApiError(413,"INVALID_REQUEST","Supplier image exceeds the configured size limit.");}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  if(length!==null&&Number(length)!==size)throw new ApiError(400,"INVALID_REQUEST","Supplier image length mismatch.");
  const bytes=Buffer.concat(chunks),valid=mime==="image/jpeg"
    ?bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
    :mime==="image/png"
      ?bytes.length>=8&&Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      :bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!valid)throw new ApiError(400,"INVALID_REQUEST","Invalid supplier image contents.");
  return {bytes,mime:mime as SupplierLogoMime,byteSize:size,sha256:createHash("sha256").update(bytes).digest("hex")};
}
function supplierKind(row:Record<string,unknown>|undefined){
  if(!row)throw new ApiError(404,"INVALID_REQUEST","Supplier not found.");
  if(row.kind!=="supplier")throw new ApiError(400,"INVALID_REQUEST","Supplier images can only be saved for suppliers.");
}
async function assertSupplier(tx:CompanyTransaction,supplierId:string){
  const row=(await tx.query("SELECT kind FROM business.counterparties WHERE company_id=$1 AND id=$2",[tx.companyId,supplierId])).rows[0];
  supplierKind(row);
}
function currentLogo(tx:CompanyTransaction,supplierId:string){
  return tx.query("SELECT id::text,state,mime_type,byte_size::text FROM business.supplier_logo_assets WHERE company_id=$1 AND supplier_id=$2 AND is_current AND state='clean'",[tx.companyId,supplierId]);
}
export function supplierLogoService(database:CompanyDatabase,storage:PrivateAssetStore){
  return {
    async status(scope:CompanyScope,supplier:string){
      const supplierId=uuid(supplier).toLowerCase();
      return database.scoped(scope,async tx=>{
        await assertSupplier(tx,supplierId);
        const current=await currentLogo(tx,supplierId),pending=await tx.query("SELECT EXISTS(SELECT 1 FROM business.supplier_logo_assets WHERE company_id=$1 AND supplier_id=$2 AND state='pending') AS pending",[tx.companyId,supplierId]),latest=await tx.query("SELECT state FROM business.supplier_logo_assets WHERE company_id=$1 AND supplier_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",[tx.companyId,supplierId]);
        const row=current.rows[0];
        return {logo:row?{id:String(row.id),mime:String(row.mime_type),byteSize:Number(row.byte_size),url:`/api/business/contacts/${supplierId}/logo/content`}:null,pending:pending.rows[0]?.pending===true,scanState:latest.rows[0]?.state??"none",maxBytes:supplierLogoUploadLimit(process.env)};
      });
    },
    async upload(scope:CompanyScope,supplier:string,input:SupplierLogoUpload){
      const supplierId=uuid(supplier).toLowerCase(),assetId=randomUUID();
      await database.scoped(scope,tx=>assertSupplier(tx,supplierId));
      const stored=await storage.putAsset({companyId:scope.companyId,supplierId,assetId,mime:input.mime,bytes:input.bytes});
      if(stored.sha256!==input.sha256||stored.byteSize!==input.byteSize)throw new ApiError(503,"UNAVAILABLE","Supplier image storage receipt did not match the upload.");
      checkPrivateAsset(stored);
      return database.scoped(scope,async tx=>{
        await assertSupplier(tx,supplierId);
        await tx.query("INSERT INTO business.supplier_logo_assets(id,company_id,supplier_id,object_key,object_version,sha256,mime_type,byte_size,state,is_current,created_by) VALUES($1,$2,$3,$4,$5,decode($6,'hex'),$7,$8,'pending',false,$9)",[assetId,tx.companyId,supplierId,stored.key,stored.version,stored.sha256,stored.mime,stored.byteSize,tx.actorId]);
        await tx.query("INSERT INTO business.supplier_logo_jobs(company_id,asset_id) VALUES($1,$2)",[tx.companyId,assetId]);
        return {id:assetId,state:"pending"};
      });
    },
    async remove(scope:CompanyScope,supplier:string){
      const supplierId=uuid(supplier).toLowerCase();
      return database.scoped(scope,async tx=>{
        await assertSupplier(tx,supplierId);
        await tx.query("UPDATE business.supplier_logo_assets SET state='removed',is_current=false,updated_at=now() WHERE company_id=$1 AND supplier_id=$2 AND state IN('pending','clean','rejected')",[tx.companyId,supplierId]);
        await tx.query("UPDATE business.supplier_logo_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL WHERE company_id=$1 AND asset_id IN(SELECT id FROM business.supplier_logo_assets WHERE company_id=$1 AND supplier_id=$2 AND state='removed') AND state IN('queued','processing')",[tx.companyId,supplierId]);
        return {removed:true};
      });
    },
    async content(scope:CompanyScope,supplier:string){
      const supplierId=uuid(supplier).toLowerCase();
      const asset=await database.scoped(scope,async tx=>{
        await assertSupplier(tx,supplierId);
        const row=(await currentLogo(tx,supplierId)).rows[0];
        if(!row)throw new ApiError(404,"INVALID_REQUEST","No approved supplier image is available.");
        const full=(await tx.query("SELECT object_key,object_version,encode(sha256,'hex') AS sha256,mime_type,byte_size::text FROM business.supplier_logo_assets WHERE company_id=$1 AND supplier_id=$2 AND id=$3 AND is_current AND state='clean'",[tx.companyId,supplierId,row.id])).rows[0];
        if(!full)throw new ApiError(404,"INVALID_REQUEST","No approved supplier image is available.");
        return {key:String(full.object_key),version:String(full.object_version),sha256:String(full.sha256),mime:String(full.mime_type) as SupplierLogoMime,byteSize:Number(full.byte_size)} satisfies StoredPrivateAsset;
      });
      return {asset,bytes:await storage.readAsset(asset)};
    }
  };
}
