"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Card} from "@/components/ui/card";
import {WebAuthForm} from "@/components/web-auth-form";
import {useLocale} from "@/components/locale-provider";
import {Button} from "@/components/ui/button";

export function TeamInvitationLanding({token,enabled}:{token:string|null;enabled:boolean}){
 const {t}=useLocale(),[loading,setLoading]=useState(true),[showLogin,setShowLogin]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false),started=useRef(false);
 const accept=useCallback(async()=>{
  if(!token)throw Error(t("teamInvitationInvalid"));
  const session=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)});
  if(!session.ok)throw Error(session.status===401||session.status===403?t("teamSignInAgain"):t("teamLoadFailed"));
  const auth=await session.json();
  const response=await fetch("/api/account/team",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":auth.csrfToken,"idempotency-key":crypto.randomUUID()},body:JSON.stringify({action:"accept",token}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(response.status===503?t("teamSchemaUnavailable"):response.status===401?t("teamSignInAgain"):t("teamInvitationInvalid"));
  const result=await response.json();if(result.accepted!==true||typeof result.companyId!=="string")throw Error(t("teamInvitationInvalid"));
  const selected=await fetch("/api/account/company-selection",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":auth.csrfToken},body:JSON.stringify({companyId:result.companyId}),signal:AbortSignal.timeout(12000)});
  if(!selected.ok||(await selected.json()).companyId!==result.companyId)throw Error(t("teamInvitationSelectionFailed"));
  window.location.replace("/app/team");
 },[t,token]);
 useEffect(()=>{
  window.history.replaceState(null,"","/team-invitation");
  if(started.current)return;started.current=true;
  if(!token){setError(t("teamInvitationInvalid"));setLoading(false);return;}
  void fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)}).then(async response=>{
   if(response.status===401||response.status===403){setShowLogin(true);return;}
   if(!response.ok)throw Error(t("teamLoadFailed"));
   await accept();
  }).catch(reason=>setError(reason instanceof Error?reason.message:t("teamOperationFailed"))).finally(()=>setLoading(false));
 },[accept,t,token]);
 async function signedIn(){setBusy(true);setError("");try{await accept();}catch(reason){setError(reason instanceof Error?reason.message:t("teamOperationFailed"));setShowLogin(false);}finally{setBusy(false);}}
 if(loading)return <main className="grid min-h-screen place-items-center bg-wash p-4"><Card className="w-full max-w-lg p-6"><p role="status">{t("teamInvitationAccepting")}</p></Card></main>;
 return <>{error&&showLogin?<div role="alert" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}<Button className="ml-3" variant="outline" onClick={()=>{setError("");setLoading(true);void accept().catch(reason=>setError(reason instanceof Error?reason.message:t("teamOperationFailed"))).finally(()=>setLoading(false));}}>{t("retryAnalytics")}</Button></div>:null}{showLogin?<WebAuthForm mode="login" enabled={enabled} notice={t("teamInvitationLoginHelp")} onSignedIn={signedIn}/>:<main className="grid min-h-screen place-items-center bg-wash p-4"><Card className="w-full max-w-lg p-6"><h1 className="text-2xl font-bold">{t("teamAcceptInvitation")}</h1>{error?<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>:<p className="mt-3 text-sm text-muted">{t("teamInvitationInvalid")}</p>}<Button className="mt-5" variant="outline" disabled={busy} onClick={()=>window.location.assign("/login")}>{t("signIn")}</Button></Card></main>}</>;
}
