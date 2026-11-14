"use client";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {useLocale} from "@/components/locale-provider";
import type {MessageKey} from "@/lib/i18n/catalog";

type LogoStatus={logo:{id:string;mime:string;byteSize:number;url:string}|null;pending:boolean;scanState:string;maxBytes:number};
export function SupplierLogoField({companyId,supplierId,disabled=false}:{companyId:string;supplierId:string;disabled?:boolean}){
 const {t}=useLocale(),[image,setImage]=useState(""),[pending,setPending]=useState(false),[rejected,setRejected]=useState(false),[ready,setReady]=useState(false),[unavailable,setUnavailable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[limit,setLimit]=useState(2*1024*1024);
 const input=useRef<HTMLInputElement>(null),objectUrl=useRef<string|null>(null),localPreview=useRef(false);
 function setPreview(url:string,local:boolean){
  if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
  objectUrl.current=url||null;localPreview.current=local;setImage(url);
 }
 async function status(signal?:AbortSignal):Promise<LogoStatus>{
  const response=await fetch(`/api/business/contacts/${supplierId}/logo`,{headers:{"x-company-id":companyId},cache:"no-store",signal});
  if(response.status===503){setUnavailable(true);throw Error('OPTIONAL_LOGO_UNAVAILABLE');}
  if(!response.ok)throw Error(t("manualRecordOperationFailed"));
  const result=await response.json();return result.data as LogoStatus;
 }
 async function showApproved(signal?:AbortSignal){
  const current=await status(signal);setReady(true);setLimit(current.maxBytes);setPending(current.pending);setRejected(!current.pending&&current.scanState==="rejected");
  if(current.logo&&(!current.pending||!localPreview.current)){
   const response=await fetch(current.logo.url,{headers:{"x-company-id":companyId},cache:"no-store",signal});
   if(!response.ok)throw Error(t("manualRecordOperationFailed"));
   const url=URL.createObjectURL(await response.blob());setPreview(url,false);
  }else if(!localPreview.current)setPreview("",false);
  return current;
 }
 useEffect(()=>{
  const controller=new AbortController();let alive=true;
  setPreview("",false);setPending(false);setRejected(false);setReady(false);setUnavailable(false);setError("");
  void showApproved(controller.signal).catch(error=>{if(alive&&!controller.signal.aborted&&error.message!=='OPTIONAL_LOGO_UNAVAILABLE')setError(error instanceof Error?error.message:t("manualRecordOperationFailed"));});
  return()=>{alive=false;controller.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;};
 },[companyId,supplierId]);
 useEffect(()=>{
  if(!pending)return;
  const timer=setInterval(()=>void showApproved().catch(error=>setError(error instanceof Error?error.message:t("manualRecordOperationFailed"))),2500);
  return()=>clearInterval(timer);
 },[companyId,supplierId,pending]);
 async function upload(file:File){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError(t("supplierLogoFileHint").replace("{size}",String(Math.ceil(limit/1024/1024))));return;}
  if(file.size<1||file.size>limit){setError(t("supplierLogoFileHint").replace("{size}",String(Math.ceil(limit/1024/1024))));return;}
  setError("");setRejected(false);setBusy(true);setPreview(URL.createObjectURL(file),true);
  try{
   const session=await fetch("/api/auth/session",{cache:"no-store"});if(!session.ok)throw Error(t("manualSignInAgain"));
   const csrf=(await session.json()).csrfToken;
   const response=await fetch(`/api/business/contacts/${supplierId}/logo`,{method:"POST",headers:{"x-company-id":companyId,"x-csrf-token":csrf,"content-type":file.type},body:file,cache:"no-store",signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error(t("manualRecordOperationFailed"));
   setPending(true);
  }catch(error){setError(error instanceof Error?error.message:t("manualRecordOperationFailed"));setPreview("",false);try{await showApproved();}catch(refreshError){setError(refreshError instanceof Error?refreshError.message:t("manualRecordOperationFailed"));}}
  finally{setBusy(false);}
 }
 async function remove(){
  setError("");setBusy(true);
  try{
   const session=await fetch("/api/auth/session",{cache:"no-store"});if(!session.ok)throw Error(t("manualSignInAgain"));
   const csrf=(await session.json()).csrfToken;
   const response=await fetch(`/api/business/contacts/${supplierId}/logo`,{method:"DELETE",headers:{"x-company-id":companyId,"x-csrf-token":csrf},cache:"no-store",signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(t("manualRecordOperationFailed"));
   setPreview("",false);setPending(false);setRejected(false);
  }catch(error){setError(error instanceof Error?error.message:t("manualRecordOperationFailed"));}
  finally{setBusy(false);}
 }
 const mb=(limit/1024/1024).toFixed(limit%1024===0?0:1);
 const label=(key:MessageKey)=>t(key).replace("{size}",mb);
 if(unavailable)return null;
 return <fieldset className="grid gap-3 rounded-lg border border-line p-4">
  <legend className="px-2 text-sm font-semibold">{t("supplierLogoLabel")}</legend>
  <p className="text-sm text-muted">{label("supplierLogoFileHint")}</p>
  {image?<img src={image} alt={t("supplierLogoLabel")} className="max-h-40 max-w-full rounded border border-line object-contain" data-testid="supplier-logo-preview"/>:null}
  <div className="flex flex-wrap gap-2">
   <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t(image?"supplierLogoReplace":"supplierLogoUpload")} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.currentTarget.value="";}}/>
   <Button type="button" variant="outline" disabled={disabled||busy||!ready} onClick={()=>input.current?.click()}>{t(image?"supplierLogoReplace":"supplierLogoUpload")}</Button>
   {image||pending?<Button type="button" variant="outline" disabled={disabled||busy||!ready} onClick={()=>void remove()}>{t("supplierLogoRemove")}</Button>:null}
  </div>
  {pending?<p role="status" className="text-sm text-muted">{t("supplierLogoPending")}</p>:null}
  {rejected?<p role="status" className="text-sm text-danger">{t("supplierLogoRejected")}</p>:null}
  {error?<p role="alert" className="text-sm text-danger">{error}</p>:null}
 </fieldset>;
}
