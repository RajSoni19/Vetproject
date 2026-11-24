"use client";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {useLocale} from "@/components/locale-provider";
import {clearWorkspaceCache} from "@/lib/workspace-cache";
export function AuthenticatedSession({children}:{children:React.ReactNode}){
 const [error,setError]=useState(""),[pending,setPending]=useState(false);const checking=useRef(false),localeSyncStarted=useRef(false);const {syncAccountLocale,t}=useLocale();
 useEffect(()=>{
  let mounted=true;
  const check=async()=>{if(checking.current||document.visibilityState==="hidden")return;checking.current=true;try{
   // A slow or dropped check (cold start, mobile network) must not lock the user out: wait longer and retry once.
   const ask=()=>fetch("/api/auth/session",{cache:"no-store",signal:AbortSignal.timeout(20000)});
   let response:Response;try{response=await ask();if(response.status>=500)throw Error();}catch{await new Promise(r=>setTimeout(r,1500));response=await ask();}if(mounted){if(response.status===401||response.status===403){localeSyncStarted.current=false;clearWorkspaceCache();window.location.replace("/login?expired=1");}else{setError(response.ok?"":t('authenticatedSessionVerifyError'));if(response.ok&&!localeSyncStarted.current){localeSyncStarted.current=true;void syncAccountLocale().then(synced=>{if(!synced)localeSyncStarted.current=false;});}}}}catch{if(mounted)setError(t('authenticatedSessionConnectionError'));}finally{checking.current=false;}};
  void check();const timer=setInterval(check,30000);window.addEventListener("focus",check);window.addEventListener("pageshow",check);document.addEventListener("visibilitychange",check);
  return()=>{mounted=false;clearInterval(timer);window.removeEventListener("focus",check);window.removeEventListener("pageshow",check);document.removeEventListener("visibilitychange",check);};
 },[syncAccountLocale,t]);
 async function logout(){if(pending)return;setPending(true);setError("");try{
   const status=await fetch("/api/auth/session",{cache:"no-store",signal:AbortSignal.timeout(10000)});
   if(status.status===401||status.status===403){clearWorkspaceCache();window.location.replace("/login?expired=1");return;}
   const body=await status.json();if(!status.ok||typeof body.csrfToken!=="string")throw Error();
   const response=await fetch("/api/auth/logout",{method:"POST",headers:{"x-csrf-token":body.csrfToken},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error();clearWorkspaceCache();window.location.replace("/login?signedOut=1");
  }catch{setError(t('authenticatedSignOutError'));setPending(false);}}
 return <><div className="flex items-center justify-end gap-4 border-b border-line bg-white px-4 py-2"><span className="text-xs text-muted">{t('authenticatedSecureWorkspace')}</span><Button data-testid="authenticated-sign-out" variant="outline" disabled={pending} onClick={logout}>{pending?t('authenticatedSigningOut'):t('authenticatedSignOut')}</Button></div>{error?<div role="alert" className="bg-amber-50 p-3 text-sm text-amber-900">{error}</div>:null}{children}</>;
}
