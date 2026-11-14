"use client";
import {useEffect,useRef,useState} from "react";
import {businessData} from "@/lib/browser-business";
import {useLocale} from "@/components/locale-provider";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Dialog} from "@/components/ui/dialog";

export function InvoiceRouting({companyId,documentId,onClose,onSaved}:{companyId:string;documentId:string;onClose:()=>void;onSaved:(purpose:string)=>void}){
 const {t}=useLocale(),[current,setCurrent]=useState<{purpose:string;version:number}|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(t("docPurposeLoading")),pending=useRef(false),retry=useRef(new Map<string,string>());
 const path="documents/"+documentId+"/purpose";
 useEffect(()=>{const controller=new AbortController();setReady(false);setMessage(t("docPurposeLoading"));void businessData(companyId,path,{signal:controller.signal}).then(row=>{setCurrent(row);setReady(true);setMessage(row?t("docPurposeSaved"):t("docPurposeChoose"));}).catch(()=>{if(!controller.signal.aborted)setMessage(t("docPurposeLoadFailed"));});return()=>controller.abort();},[companyId,path,t]);
 async function save(purpose:string){if(pending.current)return;pending.current=true;setBusy(true);const version=Number(current?.version??1),identity=purpose+":"+version;let key=retry.current.get(identity);if(!key){key=crypto.randomUUID();retry.current.set(identity,key);}try{const row=await businessData(companyId,path,{method:"PUT",body:{purpose},version,key});setCurrent(row);retry.current.delete(identity);setMessage(t("docPurposeSavedPrivate"));onSaved(purpose);}catch{setMessage(t("docPurposeSaveFailed"));}finally{pending.current=false;setBusy(false);}}
 return <Dialog title={t("docPurposeTitle")} onClose={onClose}><Card className="grid gap-3 border-0 p-5 shadow-none"><p className="text-sm leading-6 text-muted">{t("docPurposeDescription")}</p><div className="grid gap-2 sm:grid-cols-3">{[["ors","docPurposeOrs"],["vat","docPurposeVat"],["both","docPurposeBoth"]].map(([value,key])=><Button key={value} variant={current?.purpose===value?"primary":"outline"} disabled={!ready||busy} aria-pressed={current?.purpose===value} onClick={()=>void save(value)}>{t(key as "docPurposeOrs"|"docPurposeVat"|"docPurposeBoth")}</Button>)}</div><p role="status" className="text-sm">{message}</p>{current?<Button type="button" variant="ghost" onClick={onClose}>{t("docPurposeDone")}</Button>:null}</Card></Dialog>;
}
