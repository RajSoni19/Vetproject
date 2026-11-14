"use client";
import {useState} from "react";
import type {Company} from "@/lib/domain";
import {Button} from "@/components/ui/button";
import {RecordFormDialog} from "@/components/record-form-dialog";
import {companyFields} from "@/components/entity-fields";

export function EmptyWorkspace({ready,error,onCreate,onReset}:{ready:boolean;error:string;onCreate:(company:Company)=>void;onReset?:()=>void}){
  const [open,setOpen]=useState(false);
  return <main className="min-h-screen bg-wash px-5 py-16"><section className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-10"><p className="font-bold text-brand-700">VET THE VAT</p><h1 className="mt-5 text-3xl font-bold">{ready?"Create your company workspace":"Loading your workspace"}</h1><p className="mt-4 leading-7 text-muted">Start with your own company, then add invoices, suppliers and documents. No sample financial records are included.</p><p className="mt-4 text-sm text-muted">Records are saved separately for this development account in this browser. Shared database storage and automatic backups are not connected.</p>{error?<div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p>{error}</p>{onReset?<button type="button" onClick={onReset} className="mt-2 text-xs font-semibold text-red-900 underline">Reset browser storage &amp; start fresh</button>:null}</div>:null}<Button className="mt-6" disabled={!ready||Boolean(error)} onClick={()=>setOpen(true)}>Add your company</Button></section>{open?<RecordFormDialog title="Add your company" fields={companyFields} values={{name:"",registrationNumber:"",vatNumber:"",address:"",country:"United Kingdom",currency:"GBP",industry:"",status:"Active"}} onSave={values=>onCreate({...values,id:crypto.randomUUID()} as Company)} onClose={()=>setOpen(false)} note="Enter your actual business details. This creates a browser-local workspace."/>:null}</main>;
}
