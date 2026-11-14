import {createHash} from "node:crypto";
import {ApiError} from "@/lib/server/api-v1";
import {validateDocumentSignature} from "@/lib/document-validation";
import {checkOriginal,originalKey,type PrivateOriginalStore,type StoredOriginal} from "@/lib/server/saas/object-storage";
import type {InvoiceMime} from "@/lib/server/stage1/documents";

export type LocalDocumentObject={companyId:string;documentId:string;mime:InvoiceMime;original:StoredOriginal};
export type R2MigrationTarget=PrivateOriginalStore&{listKeys():Promise<string[]>};
export type LocalMigrationTarget=PrivateOriginalStore&{has(original:StoredOriginal):Promise<boolean>};
const sha256=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");

export async function migrateLocalDocumentObjects(
  input:readonly LocalDocumentObject[],
  source:PrivateOriginalStore,
  target:R2MigrationTarget,
  options:{dryRun:boolean;expectedPlanHash?:string;destination:string}
){
  if(input.length>100000||!options.destination||options.destination.length>200)throw new ApiError(400,"INVALID_REQUEST","Invalid storage migration inventory.");
  const documents=[...input].sort((a,b)=>a.companyId.localeCompare(b.companyId)||a.documentId.localeCompare(b.documentId));
  const expectedKeys=new Set<string>();
  for(const item of documents){
    checkOriginal(item.original);
    if(item.original.version!==item.original.sha256||item.original.key!==originalKey(item.companyId,item.documentId,item.original.sha256)||expectedKeys.has(item.original.key))throw new ApiError(503,"UNAVAILABLE","Storage migration inventory identity mismatch.");
    expectedKeys.add(item.original.key);
  }
  const existingKeys=await target.listKeys();
  if(existingKeys.length>100000||new Set(existingKeys).size!==existingKeys.length||existingKeys.some(key=>!expectedKeys.has(key)))throw new ApiError(409,"CONFLICT","R2 contains objects outside the local migration inventory.");
  const existingSet=new Set(existingKeys);
  const planHash=createHash("sha256").update(JSON.stringify({
    destination:options.destination,
    objects:documents.map(item=>({key:item.original.key,version:item.original.version,sha256:item.original.sha256,byteSize:item.original.byteSize,mime:item.mime})),
    existingKeys:[...existingKeys].sort()
  })).digest("hex");
  if(!options.dryRun&&options.expectedPlanHash!==planHash)throw new ApiError(409,"CONFLICT","R2 migration plan changed; run a new dry-run before applying.");
  let totalBytes=0,sourceVerified=0,targetVerified=0,copied=0,alreadyPresent=0;
  for(const item of documents){
    const bytes=await source.read(item.original);
    if(bytes.byteLength!==item.original.byteSize||sha256(bytes)!==item.original.sha256)throw new ApiError(503,"UNAVAILABLE","Local source integrity verification failed.");
    validateDocumentSignature(item.mime,bytes.byteLength,bytes);sourceVerified++;totalBytes+=bytes.byteLength;
    if(existingSet.has(item.original.key)){
      const current=await target.read(item.original);
      if(current.byteLength!==bytes.byteLength||sha256(current)!==item.original.sha256)throw new ApiError(503,"UNAVAILABLE","Existing R2 object integrity verification failed.");
      targetVerified++;alreadyPresent++;
    }else if(!options.dryRun){
      const stored=await target.put({companyId:item.companyId,documentId:item.documentId,mime:item.mime,bytes});
      checkOriginal(stored);
      if(stored.key!==item.original.key||stored.sha256!==item.original.sha256||stored.byteSize!==item.original.byteSize||stored.version!==item.original.version)throw new ApiError(503,"UNAVAILABLE","R2 migration receipt changed document identity.");
      const copiedBytes=await target.read(stored);
      if(copiedBytes.byteLength!==bytes.byteLength||sha256(copiedBytes)!==item.original.sha256)throw new ApiError(503,"UNAVAILABLE","R2 copy checksum verification failed.");
      copied++;targetVerified++;
    }
  }
  let verifiedObjectCount=existingKeys.length;
  if(!options.dryRun){
    const finalKeys=await target.listKeys();
    if(finalKeys.length!==documents.length||new Set(finalKeys).size!==documents.length||finalKeys.some(key=>!expectedKeys.has(key)))throw new ApiError(503,"UNAVAILABLE","R2 object count does not match the local document inventory.");
    verifiedObjectCount=finalKeys.length;
  }
  return {dryRun:options.dryRun,planHash,objectCount:documents.length,totalBytes,sourceVerified,targetVerified,copied,alreadyPresent,missing:documents.length-existingKeys.length,verifiedObjectCount,localOriginalsDeleted:false};
}

export async function restoreR2DocumentObjects(
  input:readonly LocalDocumentObject[],
  source:R2MigrationTarget,
  target:LocalMigrationTarget,
  options:{dryRun:boolean;expectedPlanHash?:string;destination:string}
){
  if(input.length>100000||!options.destination||options.destination.length>200)throw new ApiError(400,"INVALID_REQUEST","Invalid storage restore inventory.");
  const documents=[...input].sort((a,b)=>a.companyId.localeCompare(b.companyId)||a.documentId.localeCompare(b.documentId));
  const expectedKeys=new Set<string>();
  for(const item of documents){
    checkOriginal(item.original);
    if(item.original.version!==item.original.sha256||item.original.key!==originalKey(item.companyId,item.documentId,item.original.sha256)||expectedKeys.has(item.original.key))throw new ApiError(503,"UNAVAILABLE","Storage restore inventory identity mismatch.");
    expectedKeys.add(item.original.key);
  }
  const sourceKeys=await source.listKeys();
  if(sourceKeys.length!==documents.length||new Set(sourceKeys).size!==sourceKeys.length||sourceKeys.some(key=>!expectedKeys.has(key)))throw new ApiError(409,"CONFLICT","R2 object count does not match the database inventory.");
  const localPresence:string[]=[];
  for(const item of documents)if(await target.has(item.original))localPresence.push(item.original.key);
  const localPresenceSet=new Set(localPresence);
  const planHash=createHash("sha256").update(JSON.stringify({
    destination:options.destination,
    objects:documents.map(item=>({key:item.original.key,version:item.original.version,sha256:item.original.sha256,byteSize:item.original.byteSize,mime:item.mime})),
    localPresence:localPresence.sort()
  })).digest("hex");
  if(!options.dryRun&&options.expectedPlanHash!==planHash)throw new ApiError(409,"CONFLICT","Local restore plan changed; run a new dry-run before applying.");
  let totalBytes=0,sourceVerified=0,targetVerified=0,copied=0,alreadyPresent=0;
  for(const item of documents){
    const bytes=await source.read(item.original);
    if(bytes.byteLength!==item.original.byteSize||sha256(bytes)!==item.original.sha256)throw new ApiError(503,"UNAVAILABLE","R2 source integrity verification failed.");
    validateDocumentSignature(item.mime,bytes.byteLength,bytes);sourceVerified++;totalBytes+=bytes.byteLength;
    if(localPresenceSet.has(item.original.key)){
      const current=await target.read(item.original);
      if(current.byteLength!==bytes.byteLength||sha256(current)!==item.original.sha256)throw new ApiError(503,"UNAVAILABLE","Existing local rollback object failed integrity verification.");
      targetVerified++;alreadyPresent++;
    }else if(!options.dryRun){
      const stored=await target.put({companyId:item.companyId,documentId:item.documentId,mime:item.mime,bytes});
      checkOriginal(stored);
      if(stored.key!==item.original.key||stored.sha256!==item.original.sha256||stored.byteSize!==item.original.byteSize||stored.version!==item.original.version)throw new ApiError(503,"UNAVAILABLE","Local rollback receipt changed document identity.");
      const copiedBytes=await target.read(stored);
      if(copiedBytes.byteLength!==bytes.byteLength||sha256(copiedBytes)!==item.original.sha256)throw new ApiError(503,"UNAVAILABLE","Local rollback checksum verification failed.");
      copied++;targetVerified++;
    }
  }
  return {dryRun:options.dryRun,planHash,objectCount:documents.length,totalBytes,sourceVerified,targetVerified,copied,alreadyPresent,missing:documents.length-localPresence.length,verifiedObjectCount:options.dryRun?localPresence.length:documents.length,localOriginalsDeleted:false};
}
