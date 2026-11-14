// Runs only in an isolated worker host. No process is started on import.
import {ApiError,uuid} from "@/lib/server/api-v1";
import {createHash} from "node:crypto";
import {checkOriginal,type PrivateOriginalStore,type StoredOriginal} from "@/lib/server/saas/object-storage";
import {parseExtraction} from "@/lib/server/stage1/extraction";
import {validateDocumentSignature} from "@/lib/document-validation";
import type {InvoiceMime} from "@/lib/server/stage1/documents";

export type DocumentLease={jobId:string;leaseId:string;companyId:string;documentId:string;original:StoredOriginal;mime:InvoiceMime};
export type Inspection={verdict:"clean"|"infected"|"error";engine:string;policy:string};
export interface WorkerStore {
  claim(kind:"inspect"|"extract"):Promise<DocumentLease|null>;
  finishInspection(lease:DocumentLease,receipt:Inspection):Promise<boolean>;
  finishExtraction(lease:DocumentLease,pages:Record<string,unknown>[]|null,engine:string,failure:"TIMEOUT"|"UNAVAILABLE"|"INVALID_DOCUMENT"|"REVIEW_REQUIRED"|null):Promise<boolean>;
}
// A clean receipt requires BOTH malware inspection and bounded format decoding.
// Deployments must supply a trusted scanner+decoder host; file headers alone
// never satisfy this interface. Tesseract worker threads are not a sandbox.
export interface TrustedInspectionPort {inspect(bytes:Uint8Array,mime:InvoiceMime,signal:AbortSignal):Promise<Inspection>;}
export interface IsolatedOcrPort {readonly engine:string;pages(bytes:Uint8Array,mime:InvoiceMime,signal:AbortSignal):Promise<{text:string;confidence:number|null;layout?:{words:{text:string;left:number;top:number;width:number;height:number}[]}}[]>;}
export function validateLease(lease:DocumentLease){
  uuid(lease.jobId);uuid(lease.leaseId);uuid(lease.companyId);uuid(lease.documentId);checkOriginal(lease.original);
  if(lease.original.key.split('/')[1]!==lease.companyId.toLowerCase()||lease.original.key.split('/')[3]!==lease.documentId.toLowerCase())throw new ApiError(503,"UNAVAILABLE","Worker original identity mismatch.");
}
export async function boundedWorkerOperation<T>(operation:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();let abort:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new Error("Worker deadline exceeded"));signal.addEventListener("abort",abort,{once:true});});
  try{return await Promise.race([operation(),cancelled]);}finally{signal.removeEventListener("abort",abort);}
}
export async function processDocumentJob(kind:"inspect"|"extract",store:WorkerStore,originals:PrivateOriginalStore,ports:{inspection?:TrustedInspectionPort;ocr?:IsolatedOcrPort},signal:AbortSignal){
  // Missing providers must not acquire or mutate a queued job.
  if(kind==="inspect"&&!ports.inspection||kind==="extract"&&!ports.ocr)throw new ApiError(503,"UNAVAILABLE","Trusted document worker is not configured.");
  signal.throwIfAborted();const lease=await store.claim(kind);if(!lease)return {state:"idle" as const};validateLease(lease);
  const timeout=AbortSignal.timeout(90000),bounded=AbortSignal.any([signal,timeout]);
  let result:Inspection={verdict:"error",engine:"unavailable",policy:"unavailable"};
  let pages:Record<string,unknown>[]|null=null,failure:"TIMEOUT"|"UNAVAILABLE"|"INVALID_DOCUMENT"|"REVIEW_REQUIRED"|null="UNAVAILABLE",invalidDocument=false;
  try{
    bounded.throwIfAborted();const bytes=await boundedWorkerOperation(()=>originals.read(lease.original),bounded);bounded.throwIfAborted();
    if(bytes.byteLength!==lease.original.byteSize||createHash("sha256").update(bytes).digest("hex")!==lease.original.sha256)throw new Error("Original integrity mismatch");
    try{validateDocumentSignature(lease.mime,bytes.byteLength,bytes);}catch{invalidDocument=true;throw new Error("Invalid document signature");}
    if(kind==="inspect"){
      const receipt=await boundedWorkerOperation(()=>ports.inspection!.inspect(bytes,lease.mime,bounded),bounded);bounded.throwIfAborted();
      if(!["clean","infected","error"].includes(receipt.verdict)||!receipt.engine||receipt.engine.length>200||!receipt.policy||receipt.policy.length>100)throw new Error("Invalid inspection receipt");
      result=receipt;
    }else{
      const observations=await boundedWorkerOperation(()=>ports.ocr!.pages(bytes,lease.mime,bounded),bounded);bounded.throwIfAborted();
      if(observations.length<1||observations.length>20)throw new Error("Page limit");
      pages=observations.map((p,index)=>{
        if(typeof p.text!=="string"||p.text.length>100000||p.confidence!==null&&(!Number.isFinite(p.confidence)||p.confidence<0||p.confidence>100))throw new Error("Invalid OCR page");
        return {page:index+1,text:p.text,confidence:p.confidence,source:{documentId:lease.documentId,version:lease.original.version,sha256:lease.original.sha256},...(p.layout?{layout:p.layout}:{}),extraction:parseExtraction(p.text,[],p.layout),reviewRequired:true};
      });
      if(Buffer.byteLength(JSON.stringify(pages))>1000000)throw new Error("Output limit");failure=null;
    }
  }catch{if(bounded.aborted)failure="TIMEOUT";else failure=invalidDocument&&kind==="extract"?"INVALID_DOCUMENT":"UNAVAILABLE";pages=null;}
  // A transport failure/unknown commit here is NOT automatically retried. A
  // future claim reuses only expired leases; original bytes are never deleted.
  const accepted=kind==="inspect"?await store.finishInspection(lease,result):await store.finishExtraction(lease,pages,ports.ocr!.engine,failure);
  if(!accepted)throw new ApiError(409,"CONFLICT","Document lease expired or was replaced.");
  return {state:kind==="inspect"?result.verdict:failure===null?"review-required":"retry-or-failed"};
}
