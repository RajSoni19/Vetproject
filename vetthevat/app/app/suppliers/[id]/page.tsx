"use client";
import {useParams} from "next/navigation";
import {useState} from "react";
import {useAppState} from "@/components/app-state";
import {PageHeader,StatusBadge} from "@/components/workspace-kit";
import {Button,ButtonLink} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Feedback} from "@/components/ui/feedback";
import {RecordFormDialog} from "@/components/record-form-dialog";
import {supplierFields} from "@/components/entity-fields";
import {InvoiceHistory,DocumentFolder} from "@/components/entity-history";
import {companyDocuments,documentSupplier} from "@/lib/vat-workspace";
import type {Supplier} from "@/lib/domain";
export default function SupplierProfile(){
 const {id}=useParams<{id:string}>();const state=useAppState();const [editing,setEditing]=useState(false);
 const supplier=state.suppliers.find(row=>row.id===id);if(!state.storageReady)return <Feedback kind="loading" title="Loading supplier"/>;
 if(!supplier)return <Feedback title="Supplier not found in this company" action={<ButtonLink href="/app/suppliers">Back to suppliers</ButtonLink>}/>;
 const invoices=state.invoices.filter(row=>row.companyId===state.selectedCompany.id&&row.supplierId===id);
 const documents=companyDocuments(state.documents,state.invoices,state.selectedCompany.id).filter(row=>documentSupplier(row,state.invoices,state.selectedCompany.id)===id);
 return <><PageHeader title={supplier.name} description={`${state.selectedCompany.name} · Local supplier profile. VAT registration is not verified.`} action={<Button onClick={()=>setEditing(true)}>Edit supplier</Button>}/><div className="mb-5"><StatusBadge status={supplier.status}/></div>{supplier.status==="Review"?<Feedback title="Supplier needs review">Confirm its identity and VAT identifier against the source. No automatic supplier merge is performed.</Feedback>:null}<div className="my-5 grid gap-5 lg:grid-cols-2"><Card className="p-5"><h2 className="font-semibold">Contact and business details</h2><dl className="mt-4 grid gap-3">{[["Email",supplier.email],["Phone",supplier.phone],["VAT identifier",supplier.vatNumber],["Address",supplier.address]].map(([label,value])=><div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="break-words text-sm">{value||"Not supplied"}</dd></div>)}</dl><p className="mt-4 text-xs text-muted">Editing the profile preserves historical invoice supplier snapshots. Archiving retains all invoices and documents.</p></Card><DocumentFolder documents={documents}/></div><InvoiceHistory invoices={invoices}/>{editing?<RecordFormDialog title="Edit Supplier" fields={supplierFields} values={Object.fromEntries(supplierFields.map(field=>[field.name,String(supplier[field.name as keyof Supplier]??"")]))} onClose={()=>setEditing(false)} onSave={values=>state.saveSupplier({...supplier,...values,status:values.status as Supplier["status"]})} note="Duplicate identities are blocked within this company. No historical invoices are rewritten."/>:null}</>;
}
