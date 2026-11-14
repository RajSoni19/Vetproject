"use client";
import { useState } from "react";
import Link from "next/link";
import { companyFields } from "@/components/entity-fields";
import { Building2 } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { PageHeader, StatusBadge } from "@/components/workspace-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecordFormDialog, type RecordField } from "@/components/record-form-dialog";
import { useToast } from "@/components/toast-provider";
import type { Company } from "@/lib/domain";
const fields = companyFields;
export default function CompaniesPage() {
  const { companies, selectedCompanyId, setSelectedCompanyId, saveCompany, invoices, storageReady } = useAppState();
  const [editing,setEditing] = useState<Company|null>(null); const [error,setError] = useState(""); const {showToast}=useToast();
  if(!storageReady)return <p role="status">Loading local workspace?</p>;
  return <><PageHeader title="Companies" description="Manage business details in this browser workspace. No server permissions or shared company accounts are created." action={<Button onClick={()=>setEditing({id:crypto.randomUUID(),name:"",registrationNumber:"",vatNumber:"",address:"",country:"United Kingdom",currency:"GBP",industry:"",status:"Active"})}>Add Company</Button>}/>{error?<p role="alert" className="mb-4 text-sm text-red-700">{error}</p>:null}
  <div className="grid gap-5 md:grid-cols-2">{companies.map((company)=><Card key={company.id} className="p-6"><div className="flex items-start justify-between gap-4"><div className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><Building2 className="h-5 w-5"/></span><div><h2 className="text-xl font-bold"><Link href={`/app/companies/${company.id}`} className="text-brand-700">{company.name}</Link></h2><p className="mt-2 text-sm leading-6 text-muted">Registration: {company.registrationNumber||"Not supplied"}<br/>VAT: {company.vatNumber||"Not supplied"}<br/>{company.address||"Address not supplied"}<br/>{company.country} ? {company.currency}<br/>{company.industry||"Industry not supplied"}<br/>{invoices.filter((invoice)=>invoice.companyId===company.id).length} invoice records</p></div></div><StatusBadge status={company.status}/></div><div className="mt-5 flex flex-wrap gap-3"><Button variant={selectedCompanyId===company.id?"secondary":"outline"} onClick={()=>{try{setSelectedCompanyId(company.id);setError("");}catch(reason){setError(reason instanceof Error?reason.message:"Company could not be selected.");}}}>{selectedCompanyId===company.id?"Current Business":"Switch Business"}</Button><Button variant="outline" aria-label={"Edit company "+company.name} onClick={()=>setEditing(company)}>Edit details</Button><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700" href={`/app/companies/${company.id}`}>Open workspace</Link></div></Card>)}</div>
  {editing?<RecordFormDialog key={editing.id} title={companies.some((company)=>company.id===editing.id)?"Edit Company":"Add Company"} fields={editing.status==="Archived"?fields.map(field=>field.name==="status"?{...field,options:["Active","Review","Archived"]}:field):fields} values={Object.fromEntries(fields.map((field)=>[field.name,String(editing[field.name as keyof Company] ?? "")]))} onClose={()=>setEditing(null)} onSave={(values)=>{saveCompany({...editing,...values,currency:values.currency as Company["currency"],status:values.status as Company["status"]});showToast({title:"Company saved locally",tone:"success"});}} note="Company defaults affect new records. Existing invoice amounts and currencies are preserved."/>:null}</>;
}


