"use client";
import {DocumentProcessingStatus} from "@/components/document-processing-status";
import {InvoiceRouting} from '@/components/invoice-routing';
import {InvoiceCaptureUpload} from '@/components/invoice-capture-upload';
import {useLocale} from '@/components/locale-provider';
import {formatDate, type MessageKey} from '@/lib/i18n/catalog';
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

type DocumentRow={id:string;original_name:string;mime_type:string;byte_size:string;state:string;created_at:string;inspection:string|null;extraction:string|null;purpose:string|null};
type Extraction={job?:{state:string;attempts:number;error_code:string|null};pages:{page:number;observations:Record<string,unknown>;engine:string}[];reviewRequired:boolean};
const stateMessages:Record<string,MessageKey>={
 awaiting_upload:'docStateAwaitingUpload',rejected:'docStateRejected',missing:'docStateMissing',
};
const purposeMessages:Record<string,MessageKey>={ors:'docPurposeOrs',vat:'docPurposeVat',both:'docPurposeBoth'};

function documentState(row:DocumentRow,t:(key:MessageKey)=>string){
 if(row.state==='quarantined')return t(row.inspection==='error'?'docStateQuarantineRetry':'docStateQuarantined');
 if(row.state==='clean'&&row.extraction==='completed')return t('docStateExtractReady');
 if(row.state==='clean'&&row.extraction==='failed')return t('docStateExtractFailed');
 if(row.state==='clean')return t('docStateExtractPending');
 const key=stateMessages[row.state];return key?t(key):row.state;
}

export function ServerDocumentWorkspace({companyId,mode="workspace"}:{companyId:string;mode?:"workspace"|"list"|"upload"}){
 const {t,locale}=useLocale();
 const [rows,setRows]=useState<DocumentRow[]>([]),[after,setAfter]=useState<string|null>(null),[selected,setSelected]=useState<string>(""),[routingId,setRoutingId]=useState<string>(""),[extraction,setExtraction]=useState<Extraction|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [preview,setPreview]=useState<{id:string;url:string;type:string}|null>(null);
 const retries=useRef(new Map<string,string>()),running=useRef(false);
 const request=useCallback(async(path:string,method="GET",headers:Record<string,string>={},body?:BodyInit)=>{
  const response=await fetch(path,{method,headers:{"x-company-id":companyId,...headers},body,cache:"no-store",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(t('docOperationFailed'));
  return response;
 },[companyId,t]);
 const load=useCallback(async(cursor?:string)=>{
  const filters=new URLSearchParams({limit:'100'});if(cursor)filters.set('cursor',cursor);const response=await request("/api/business/documents?"+filters),body=await response.json();setRows(previous=>cursor?[...previous,...body.data.items]:body.data.items);setAfter(body.data.nextCursor??null);
 },[request]);
 useEffect(()=>{void load().catch(()=>setError(t('docOperationFailed')));},[load,t]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 async function upload(file:File,_capturedAt:string):Promise<boolean>{
  if(running.current)return false;running.current=true;setBusy(true);setError("");setNotice("");
  try{
   const sessionResponse=await fetch("/api/auth/session",{cache:"no-store"});if(!sessionResponse.ok)throw Error(t('docOperationFailed'));const session=await sessionResponse.json();
   const identity=[file.name,file.size,file.type,file.lastModified].join("\u001f");let key=retries.current.get(identity);if(!key){key=crypto.randomUUID();retries.current.set(identity,key);}
   const response=await request("/api/business/documents","POST",{"content-type":file.type,"x-file-name":encodeURIComponent(file.name),"x-file-name-encoding":"percent-utf8","x-csrf-token":session.csrfToken,"idempotency-key":key},file);
   const result=(await response.json()).data;retries.current.delete(identity);setNotice(result.duplicate?t('docDuplicateNotice'):t('docQuarantinedNotice'));setSelected(result.id);setRoutingId(result.id);setExtraction(null);try{await load();}catch{setError(t('docUploadRefreshFailure'));}return true;
  }catch{setError(t('docOperationFailed'));return false;}
  finally{running.current=false;setBusy(false);}
 }
 async function refresh(documentId=selected){setBusy(true);setError("");try{if(documentId){const response=await request(`/api/business/documents/${documentId}/status`),body=await response.json();const status=body.data as DocumentRow;setRows(old=>old.map(row=>row.id===documentId?{...row,...status}:row));if(status.extraction){const result=await request(`/api/business/documents/${documentId}/extraction`),parsed=await result.json();setExtraction(parsed.data as Extraction);}else setExtraction(null);if(status.state!=="clean")setPreview(current=>{if(current?.id===documentId){URL.revokeObjectURL(current.url);return null;}return current;});}}catch{setError(t('docOperationFailed'));}finally{setBusy(false);}}
 async function showPreview(row:DocumentRow){if(row.state!=="clean")return;setBusy(true);setError("");try{const response=await request(`/api/business/documents/${row.id}`),blob=await response.blob(),url=URL.createObjectURL(blob);setPreview(current=>{if(current)URL.revokeObjectURL(current.url);return{id:row.id,url,type:row.mime_type};});}catch{setError(t('docOperationFailed'));}finally{setBusy(false);}}
 async function download(id:string,name:string){setBusy(true);setError("");try{const response=await request(`/api/business/documents/${id}`),blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError(t('docOperationFailed'));}finally{setBusy(false);}}
 return <section className="grid gap-5">
  {routingId?<InvoiceRouting key={companyId+routingId} companyId={companyId} documentId={routingId} onClose={()=>setRoutingId("")} onSaved={purpose=>setRows(old=>old.map(row=>row.id===routingId?{...row,purpose}:row))}/>:null}
  {mode!=="list"?<InvoiceCaptureUpload busy={busy} onUpload={upload}/>:null}
  {selected?<DocumentProcessingStatus companyId={companyId} documentId={selected}/>:null}{selected&&mode==="upload"?<Link className="workflow-primary justify-self-start" href={"/app/documents/"+selected}>Open document review</Link>:null}
  <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-semibold">Add a supplier invoice</h2><p className="text-sm text-muted">Scan or upload a PDF or photo: supplier, date, net, VAT and gross are read for you to check and save.</p></div><div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center rounded-md bg-brand-700 px-4 text-sm font-semibold text-white" href="/app/invoices/upload">Scan or upload invoice</Link><Link className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold text-brand-700" href="/app/invoices/new">{t('docManualEntryLink')}</Link></div></Card>
  {error?<p role="alert" className="text-sm text-red-800">{error}</p>:null}{notice?<p role="status" className="text-sm text-brand-700">{notice}</p>:null}
  {mode!=="upload"?<Card className="grid gap-3 p-5"><h2 className="text-lg font-bold">{t('docCompanyDocuments')}</h2>{rows.length?rows.map(row=>{const inName=row.original_name.match(/capture-(\d{4}-\d{2}-\d{2})/i)?.[1];const purposeKey=row.purpose?purposeMessages[row.purpose]:undefined;return <article key={row.id} className="grid gap-2 border-t border-line py-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><p className="break-words font-semibold">{row.original_name}</p><p className="mt-1 text-muted">{documentState(row,t)} · {inName?`${t('docCaptured')} ${formatDate(inName,locale)}`:`${t('docUploaded')} ${formatDate(row.created_at,locale,{dateStyle:'medium',timeStyle:'short'})}`}</p><p className="text-muted">{t('docPurposeLabel')}: {purposeKey?t(purposeKey):row.purpose??t('docPurposeNotSelected')}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>setRoutingId(row.id)}>{t('docPurposeLabel')}</Button><Button variant="outline" disabled={busy} onClick={()=>{setSelected(row.id);setExtraction(null);void refresh(row.id);}}>{t('docReviewExtraction')}</Button>{row.state==="clean"?<><Button variant="outline" disabled={busy} onClick={()=>void showPreview(row)}>{t('docPreviewVerifiedOriginal')}</Button><Button variant="outline" disabled={busy} onClick={()=>void download(row.id,row.original_name)}>{t('docDownloadOriginal')}</Button></>:null}</div></article>;}):<p className="text-sm text-muted">{t('docNoDocuments')}</p>}{after?<Button variant="outline" disabled={busy} onClick={()=>void load(after).catch(()=>setError(t('docOperationFailed')))}>{t('manualNextPage')}</Button>:null}{preview?<section className="grid gap-2 border-t border-line pt-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{t('docAuthorizedPreview')}</h3><Button variant="outline" onClick={()=>setPreview(current=>{if(current)URL.revokeObjectURL(current.url);return null;})}>{t('docClosePreview')}</Button></div>{preview.type==="application/pdf"?<iframe title={t('docAuthorizedPreview')} src={preview.url} className="h-[70vh] w-full rounded border border-line"/>:preview.type.startsWith("image/")?<img src={preview.url} alt={t('docAuthorizedPreview')} className="max-h-[70vh] max-w-full justify-self-center object-contain"/>:<p className="text-sm text-muted">{t('docUnsupportedPreview')}</p>}</section>:null}</Card>:null}
  {extraction&&mode!=="upload"?<Card className="grid gap-3 p-5"><h2 className="text-lg font-bold">{t('docExtractionTitle')}</h2>{extraction.pages.length?extraction.pages.map(page=><section className="grid gap-2 border-t border-line pt-3" key={page.page}><h3 className="font-semibold">{t('docPage')} {page.page} · {page.engine}</h3><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(page.observations).map(([field,value])=><div key={field} className="min-w-0 rounded-md bg-wash p-3"><dt className="text-xs font-semibold text-muted">{field.replaceAll("_"," ")}</dt><dd className="mt-1 break-words text-sm">{typeof value==="string"?value:JSON.stringify(value)}</dd></div>)}</dl></section>):<p className="text-sm text-muted">{t('docNoExtraction')}</p>}<p className="text-xs text-muted">{t('docExtractionReviewNote')}</p></Card>:null}
 </section>;
}
