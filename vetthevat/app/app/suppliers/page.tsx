"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {CollectionPagination,collectionPage} from "@/components/ui/collection-pagination";
import { supplierReview } from "@/lib/vat-workspace";
import { supplierFields } from "@/components/entity-fields";
import { Plus } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { PageHeader, StatusBadge } from "@/components/workspace-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecordFormDialog, type RecordField } from "@/components/record-form-dialog";
import { useToast } from "@/components/toast-provider";
import type { Supplier } from "@/lib/domain";
const fields = supplierFields;
export default function SuppliersPage(){
 const {suppliers,saveSupplier,selectedCompany,invoices,storageReady}=useAppState();const {showToast}=useToast();const [query,setQuery]=useState("");const [status,setStatus]=useState("All");const [sort,setSort]=useState("name");const [editing,setEditing]=useState<Supplier|null>(null);
 const [page,setPage]=useState(0);useEffect(()=>setPage(0),[query,status,sort,selectedCompany.id]);
 const filtered=suppliers.filter((supplier)=>(status==="All"||supplier.status===status)&&(supplier.name+" "+supplier.email+" "+supplier.vatNumber+" "+supplier.phone+" "+supplier.address).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>sort==="status"?a.status.localeCompare(b.status)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
 if(!storageReady)return <p role="status">Loading local workspace?</p>;
 const review=supplierReview(invoices,suppliers,selectedCompany.id);
 return <><PageHeader title="Suppliers" description={selectedCompany.name+" ? supplier details stored locally; VAT registration is not verified."} action={<Button onClick={()=>setEditing({id:crypto.randomUUID(),companyId:selectedCompany.id,name:"",email:"",phone:"",vatNumber:"",address:"",status:"Active"})}><Plus className="h-4 w-4"/>Add Supplier</Button>}/><Card className="mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_180px]"><input aria-label="Search suppliers" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search name, contact or VAT identifier" className="h-10 rounded-md border border-line px-3"/><select aria-label="Supplier status filter" value={status} onChange={(event)=>setStatus(event.target.value)} className="h-10 rounded-md border border-line px-3">{["All","Active","Review","Archived"].map((value)=><option key={value}>{value}</option>)}</select><select aria-label="Supplier sort" className="field-control" value={sort} onChange={(event)=>setSort(event.target.value)}><option value="name">Name A–Z</option><option value="status">Status, then name</option></select></Card>
 <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{collectionPage(filtered,page).rows.map((supplier)=><Card key={supplier.id} className="p-5"><div className="flex justify-between gap-3"><h2 className="font-bold"><Link href={`/app/suppliers/${supplier.id}`} className="text-brand-700">{supplier.name}</Link></h2><StatusBadge status={supplier.status}/></div><p className="mt-3 text-sm leading-6 text-muted">{supplier.email||"Email not supplied"}<br/>{supplier.phone||"Phone not supplied"}<br/>VAT: {supplier.vatNumber||"Not supplied"}<br/>{supplier.address||"Address not supplied"}<br/>{invoices.filter((invoice)=>invoice.companyId===selectedCompany.id&&invoice.supplierId===supplier.id).length} linked invoices</p><Button variant="outline" aria-label={"Edit supplier "+supplier.name} className="mt-5" onClick={()=>setEditing(supplier)}>View / Edit</Button><Link href={`/app/suppliers/${supplier.id}`} className="ml-3 text-sm font-semibold text-brand-700">Open profile</Link></Card>)}</div>{!filtered.length?<Card className="p-6 text-sm text-muted">No suppliers match in this company. Add a supplier to use it in invoice entry.</Card>:null}
 <CollectionPagination count={filtered.length} page={page} onPage={setPage} label="suppliers"/>
 <Card className="mt-5 p-5"><h2 className="font-semibold">Supplier identity review</h2><p className="mt-2 text-sm text-muted">Missing supplier links or uncertain invoice fields need review. Do not merge suppliers automatically; compare the source, create or choose a company supplier and save the corrected invoice.</p><div className="mt-3 grid gap-2">{review.map(row=><Link key={row.id} href={`/app/invoices/${row.id}`} className="rounded-lg border border-line p-3 text-sm">{row.invoiceNumber||"Untitled draft"} · {row.supplierName||"Missing supplier"} · Review supplier link</Link>)}{!review.length?<p className="text-sm text-muted">No supplier identity review candidates.</p>:null}</div></Card>
 {editing?<RecordFormDialog key={editing.id+selectedCompany.id} title={suppliers.some((supplier)=>supplier.id===editing.id)?"Edit Supplier":"Add Supplier"} fields={fields} values={Object.fromEntries(fields.map((field)=>[field.name,String(editing[field.name as keyof Supplier]??"")]))} note="Names and VAT identifiers are checked for local duplicates within this company. Editing a supplier updates future selection details; historical invoice snapshots are preserved." onClose={()=>setEditing(null)} onSave={(values)=>{saveSupplier({...editing,...values,companyId:editing.companyId,status:values.status as Supplier["status"]});showToast({title:"Supplier saved locally",tone:"success"});}}/>:null}</>;
}


