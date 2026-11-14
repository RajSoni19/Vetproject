"use client";
import {useRef,useState} from "react";
import {PasswordInput} from "@/components/password-input";
import {Button} from "@/components/ui/button";
import {useLocale} from "@/components/locale-provider";
export function PasswordChange(){
 const {t}=useLocale(),[error,setError]=useState(""),[busy,setBusy]=useState(false),pending=useRef(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;const form=new FormData(event.currentTarget),currentPassword=String(form.get("currentPassword")??""),newPassword=String(form.get("newPassword")??"");setError("");
  if(newPassword!==form.get("confirmation")){setError(t("securityPasswordMismatch"));return;}if(newPassword===currentPassword){setError(t("securityChooseDifferentPassword"));return;}
  pending.current=true;setBusy(true);
  try{const status=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000)});if(!status.ok)throw Error(status.status===401?t("securitySignInAgain"):t("securityChangeFailed"));const auth=await status.json();const response=await fetch("/api/auth/change-password",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":auth.csrfToken},body:JSON.stringify({currentPassword,newPassword}),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok||result.changed!==true)throw Error(response.status===401?t("securitySignInAgain"):t("securityChangeFailed"));window.location.replace("/login?signedOut=1");}
  catch(reason){setError(reason instanceof Error?reason.message:t("securityChangeFailed"));}finally{pending.current=false;setBusy(false);}
 }
 const fields=[{name:"currentPassword",label:t("authPassword"),auto:"current-password",min:1},{name:"newPassword",label:t("authNewPassword"),auto:"new-password",min:12},{name:"confirmation",label:t("securityConfirmNewPassword"),auto:"new-password",min:12}] as const;
 return <section><h3 className="font-semibold">{t("securityChangePassword")}</h3><p className="mt-2 text-sm leading-6 text-muted">{t("securityPasswordChangeHelp")}</p><form onSubmit={submit} className="mt-4 grid max-w-lg gap-4">{fields.map(f=><label key={f.name} className="grid gap-2 text-sm font-semibold">{f.label}<PasswordInput name={f.name} autoComplete={f.auto} required minLength={f.min} maxLength={128} disabled={busy} className="field-control"/></label>)}{error?<p role="alert" className="text-sm text-red-700">{error}</p>:null}<Button type="submit" disabled={busy}>{busy?t("authWait"):t("securityChangeAndSignOut")}</Button></form></section>;
}
