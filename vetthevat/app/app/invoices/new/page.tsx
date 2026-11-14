"use client";
import {Suspense,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {useAppState} from "@/components/app-state";
import {InvoiceEditor} from "@/components/invoice-editor";
import {PageHeader} from "@/components/workspace-kit";
import {Feedback} from "@/components/ui/feedback";
import {createInvoiceDraft} from "@/lib/invoice-rules";
export default function NewInvoicePage(){return <Suspense fallback={<Feedback kind="loading" title="Loading invoice entry"/>}><NewInvoiceContent/></Suspense>;}
function NewInvoiceContent(){
 const {selectedCompany,customers,storageReady}=useAppState();const params=useSearchParams(),router=useRouter();
 const customerId=params.get("customer")??"",customer=customers.find(row=>row.id===customerId&&row.status!=="Archived");
 if(customerId&&!customer)return <Feedback kind="error" title="Customer unavailable">Choose an active customer in the selected company.</Feedback>;
 return <><PageHeader title={customer?"Add Sales Invoice":"Add Invoice"} description="Enter an invoice manually or save a draft. No upload is required."/>{storageReady?<NewDraft key={selectedCompany.id+customerId} customerId={customerId} cancel={()=>router.push("/app/invoices")}/>:<Feedback kind="loading" title="Loading local workspace"/>}</>;
}
function NewDraft({cancel,customerId}:{cancel:()=>void;customerId:string}){
 const {selectedCompany,customers}=useAppState();
 const [draft]=useState(()=>{const invoice=createInvoiceDraft(selectedCompany),customer=customers.find(row=>row.id===customerId);return customer?{...invoice,transactionType:"Sale" as const,supplierName:selectedCompany.name,supplierVatNumber:selectedCompany.vatNumber,customerId:customer.id,customerName:customer.name,customerVatNumber:customer.vatNumber}:invoice;});
 return <InvoiceEditor initialInvoice={draft} onCancel={cancel}/>;
}
