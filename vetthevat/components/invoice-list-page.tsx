"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {WorkspaceTable} from '@/components/workspace-table';
import {InvoiceExcelDownload} from '@/components/invoice-excel-download';
// Invoice and contact lists, kept in memory only for this open page (never written to disk), so
// returning to a list is instant while a fresh copy loads. Gone on reload or sign-out.
type Row=Record<string,any>;
const listCache=new Map<string,Row[]>(),inflight=new Map<string,Promise<Row[]>>();
const listKey=(companyId:string,kind?:'supplier'|'customer')=>companyId+':'+(kind??'invoices');
async function fetchCompanyList(companyId:string,kind?:'supplier'|'customer'){let after:string|null=null;const all:Row[]=[];do{const query=new URLSearchParams({limit:'100'});if(kind)query.set('kind',kind);if(after)query.set('after',after);const response=await fetch('/api/business/'+(kind?'contacts':'invoices')+'?'+query,{headers:{'x-company-id':companyId},cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(body.error?.message??'Could not load company records.');all.push(...body.data.items);after=body.data.after;}while(after);return all;}
export function loadCompanyList(companyId:string,kind?:'supplier'|'customer'):Promise<Row[]>{const key=listKey(companyId,kind);let pending=inflight.get(key);if(!pending){pending=fetchCompanyList(companyId,kind).then(all=>{listCache.set(key,all);return all;}).finally(()=>inflight.delete(key));inflight.set(key,pending);}return pending;}
// Loads the invoice and supplier lists in the background (and wakes the server) before they are opened.
export function prefetchCompanyLists(companyId:string){if(!companyId)return;for(const kind of [undefined,'supplier'] as const){if(!listCache.has(listKey(companyId,kind)))void loadCompanyList(companyId,kind).catch(()=>undefined);}}
export function InvoiceListPage({companyId,kind}:{companyId:string;kind?:'supplier'|'customer'}){
 const [rows,setRows]=useState<Record<string,any>[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[deleteError,setDeleteError]=useState('');
 // Shows the last loaded list at once (when returning to this page) and refreshes it quietly.
 useEffect(()=>{let active=true;const key=listKey(companyId,kind),cached=listCache.get(key);setRows(cached??[]);setLoading(!cached);setError('');loadCompanyList(companyId,kind).then(all=>{if(active)setRows(all);}).catch(e=>{if(active&&!cached)setError(e instanceof Error?e.message:'Could not load company records.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[companyId,kind]);
 // Arriving from "Confirm" on an invoice: /app/invoices?confirmed=<number>.
 const [confirmedNotice,setConfirmedNotice]=useState(''),[supplierFilter,setSupplierFilter]=useState('');
 const supplierNames=[...new Set(rows.map(r=>String(r.contact_name??'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 useEffect(()=>{if(kind)return;const url=new URL(window.location.href),number=url.searchParams.get('confirmed');if(number===null)return;setConfirmedNotice(`Invoice ${number} has been confirmed. It is now included in VAT reports and Excel downloads.`);url.searchParams.delete('confirmed');window.history.replaceState(null,'',url.pathname+url.search);},[kind]);
 async function removeInvoice(row:Record<string,any>){
  const confirmed=row.state==="confirmed";
  if(!window.confirm(confirmed?`Permanently delete confirmed invoice ${row.number}? It will be removed from VAT, ORS and all reports. This cannot be undone.`:`Permanently delete draft invoice ${row.number}?`))return;
  setDeleteError("");
  try{const session=await fetch("/api/auth/session",{cache:"no-store"});if(!session.ok)throw Error("Please sign in again.");const csrf=(await session.json()).csrfToken;
   const response=await fetch("/api/business/invoices/"+row.id,{method:"DELETE",headers:{"x-company-id":companyId,"x-csrf-token":csrf,"if-match":`"${row.version}"`,"idempotency-key":crypto.randomUUID(),"content-type":"application/json"},body:JSON.stringify({confirmed})});
   const body=await response.json().catch(()=>null);if(!response.ok)throw Error(body?.error?.message??"Invoice could not be deleted.");
   setRows(old=>{const next=old.filter(r=>r.id!==row.id);listCache.set(listKey(companyId,kind),next);return next;});}
  catch(e){setDeleteError(e instanceof Error?e.message:"Invoice could not be deleted.");}}
 if(loading)return <p role="status" className="rounded-xl border border-line bg-white p-8">Loading company records…</p>;
 if(error)return <p role="alert" className="rounded-xl bg-red-50 p-5 text-red-800">{error}</p>;
 const base=kind?'/app/'+(kind==='supplier'?'suppliers':'customers'):'/app/invoices';
 return <div className="space-y-5">{!kind?<InvoiceExcelDownload companyId={companyId} rows={rows}/>:null}
 {confirmedNotice?<p role="status" className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm font-semibold text-brand-800">{confirmedNotice}</p>:null}
 {!kind&&supplierNames.length>1?<label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Supplier<select aria-label="Filter invoices by supplier" className="field-control w-auto min-w-[16rem]" value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)}><option value="">All suppliers</option>{supplierNames.map(name=><option key={name} value={name}>{name}</option>)}</select></label>:null}
 <WorkspaceTable key={supplierFilter} title={kind?(kind==='supplier'?'Suppliers':'Customers'):'All invoices'} rows={supplierFilter?rows.filter(r=>r.contact_name===supplierFilter):rows} detailHref={r=>base+'/'+r.id} {...(kind?{}:{initialSort:'created_at',initialDescending:true,searchLabel:'Search by supplier or invoice number',searchPlaceholder:'e.g. Temple Wines or 1889',sortChoices:[{label:'Latest scanned first',key:'created_at',descending:true},{label:'Invoice date: newest first',key:'issued_on',descending:true},{label:'Invoice date: oldest first',key:'issued_on',descending:false},{label:'Supplier A–Z',key:'contact_name',descending:false},{label:'Highest total',key:'gross',descending:true}]})} columns={kind?[{key:'name',label:'Business name'},{key:'email',label:'Email'},{key:'vat_number',label:'VAT number'},{key:'status',label:'Status'}]:[{key:'number',label:'Invoice number',render:r=><Link className="font-semibold text-brand-700" href={base+'/'+r.id}>{r.number}</Link>},{key:'contact_name',label:'Supplier',render:r=>r.contact_name||'—'},{key:'issued_on',label:'Invoice date'},{key:'direction',label:'Type'},{key:'state',label:'Status'},{key:'currency',label:'Currency'},{key:'net',label:'Net'},{key:'vat',label:'VAT'},{key:'gross',label:'Total'},{key:'delete',label:'',render:r=>['draft','confirmed'].includes(r.state)?<button type="button" onClick={()=>void removeInvoice(r)} className="text-sm font-semibold text-red-700 underline">Delete</button>:null}]}/>{deleteError?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{deleteError}</p>:null}</div>;
}
