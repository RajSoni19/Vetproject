"use client";

import {ukDate} from "@/lib/uk-date";
import {useCallback,useEffect,useState} from "react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

type Area="vat"|"ors";
type ReviewState="pending"|"in_review"|"reviewed"|"rejected";
type RoutedDocument={id:string;original_name:string;mime_type:string;document_state:string;created_at:string;purpose:string;review_state:ReviewState;version:string;reviewed_at:string;can_write:boolean};
const labels:Record<ReviewState,string>={pending:"Pending review",in_review:"In review",reviewed:"Reviewed",rejected:"Rejected"};
const transitions:Record<ReviewState,ReviewState[]>={pending:["in_review","rejected"],in_review:["pending","reviewed","rejected"],reviewed:[],rejected:["pending"]};

export function RoutedInvoiceReviewQueue({companyId,area}:{companyId:string;area:Area}){
 const [items,setItems]=useState<RoutedDocument[]>([]),[error,setError]=useState(""),[unavailable,setUnavailable]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState<string>("");
 const load=useCallback(async()=>{setLoading(true);setError("");setUnavailable("");try{const response=await fetch(`/api/business/document-reviews?module=${area}`,{headers:{"x-company-id":companyId},cache:"no-store",signal:AbortSignal.timeout(20000)}),body=await response.json();if(response.status===503&&body.error?.code==="UNAVAILABLE"){setUnavailable(body.error.message);setItems([]);return;}if(!response.ok)throw Error(body.error?.message??"Routed invoice reviews could not be loaded.");setItems((body.data?.items??[]) as RoutedDocument[]);}catch(reason){setError(reason instanceof Error?reason.message:"Routed invoice reviews could not be loaded.");}finally{setLoading(false);}},[area,companyId]);
 useEffect(()=>{void load();},[load]);
 async function transition(item:RoutedDocument,state:ReviewState){const key=`${item.id}:${state}`;setSaving(key);setError("");try{const session=await fetch("/api/auth/session",{cache:"no-store"});if(!session.ok)throw Error("Sign in again before updating this review.");const auth=await session.json();const response=await fetch(`/api/business/documents/${item.id}/review/${area}`,{method:"PATCH",headers:{"content-type":"application/json","x-company-id":companyId,"x-csrf-token":auth.csrfToken,"if-match":`\"${item.version}\"`},body:JSON.stringify({state})});const body=await response.json();if(!response.ok)throw Error(body.error?.message??"Review state could not be updated.");await load();}catch(reason){setError(reason instanceof Error?reason.message:"Review state could not be updated.");}finally{setSaving("");}}
 const vat=area==="vat",title=vat?"VAT invoice review queue":"ORS invoice review queue";
 if(unavailable)return <Card className="grid gap-3 p-5" data-review-queue={area}><h2 className="text-xl font-bold">{title}</h2><p role="status" className="text-sm text-muted">{unavailable}</p></Card>;
 return <Card className="grid gap-3 p-5" data-review-queue={area}>
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-muted">VAT and ORS keep separate review states for this canonical document. Review does not create invoices, purchase records or inventory movements.</p></div><Button variant="outline" disabled={loading||Boolean(saving)} onClick={()=>void load()}>Refresh queue</Button></div>
  {error?<p role="alert" className="text-sm text-red-800">{error}</p>:null}
  {loading?<p role="status" className="text-sm text-muted">Loading routed documents…</p>:items.length?items.map(item=><article key={item.id} data-document-id={item.id} data-purpose={item.purpose} data-review-state={item.review_state} className="grid gap-2 border-t border-line pt-3 text-sm sm:grid-cols-[1fr_auto]"><div className="min-w-0"><h3 className="break-words font-semibold">{item.original_name}</h3><p className="text-muted">{item.document_state==="quarantined"?"Quarantined · waiting for trusted inspection":item.document_state==="clean"?"Trusted inspection complete":item.document_state}</p><p className="font-medium">{labels[item.review_state]}</p><p className="break-all text-xs text-muted">Canonical document: {item.id} · Purpose: {item.purpose==="both"?"Both (VAT and ORS)":vat?"VAT Only":"ORS Only"}</p>{item.reviewed_at?<time className="text-xs text-muted" dateTime={item.reviewed_at}>Updated {ukDate(item.reviewed_at)}</time>:null}</div><div className="flex flex-wrap items-center gap-2">{item.can_write?transitions[item.review_state].map(state=><Button key={state} variant={state==="reviewed"?"primary":"outline"} disabled={Boolean(saving)} onClick={()=>void transition(item,state)}>{saving===`${item.id}:${state}`?"Saving…":state==="in_review"?"Start review":state==="reviewed"?"Mark reviewed":state==="rejected"?"Reject":"Return to pending"}</Button>):<span className="text-xs text-muted">Read only</span>}</div></article>):<p className="text-sm text-muted">No documents routed to this review queue.</p>}
  <p className="text-xs text-muted">Original preview and financial processing stay blocked until trusted inspection succeeds. Routing alone does not confirm VAT or create purchasing or stock records.</p>
 </Card>;
}
