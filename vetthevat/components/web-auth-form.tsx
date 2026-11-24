"use client";
import {useRef,useState} from "react";
import {PasswordInput} from "@/components/password-input";
import Link from "next/link";
import {Logo} from "@/components/logo";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {useLocale} from "@/components/locale-provider";
import type {MessageKey} from "@/lib/i18n/catalog";
import {clearWorkspaceCache} from "@/lib/workspace-cache";

type Mode="login"|"register"|"forgot"|"reset"|"verify"|"verification";
const views:Record<Mode,[MessageKey,MessageKey,string]>={login:["authLoginTitle","authLoginAction","/api/auth/session"],register:["authRegisterTitle","authRegisterAction","/api/auth/register"],forgot:["authForgotTitle","authForgotAction","/api/auth/forgot-password"],reset:["authResetTitle","authResetAction","/api/auth/reset-password"],verify:["authVerifyTitle","authVerifyAction","/api/auth/verify-email"],verification:["authVerificationTitle","authVerificationAction","/api/auth/verification"]};

export function WebAuthForm({mode,enabled,emailDeliveryEnabled=false,token,notice,onSignedIn}:{mode:Mode;enabled:boolean;emailDeliveryEnabled?:boolean;token?:string;notice?:string;onSignedIn?:()=>Promise<void>}){
 const {t}=useLocale(),[message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[completed,setCompleted]=useState(false),pending=useRef(false);
 const [titleKey,labelKey,endpoint]=views[mode],email=["login","register","forgot","verification"].includes(mode),password=["login","register","reset"].includes(mode);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(pending.current||!enabled)return;const form=event.currentTarget,data=new FormData(form),body:Record<string,string>={};setError("");setMessage("");
  if(email)body.email=String(data.get("email")??"").trim();if(password)body.password=String(data.get("password")??"");if(mode==="register")body.fullName=String(data.get("fullName")??"").trim();if(mode==="reset"||mode==="verify")body.token=token??"";
  if(password&&mode!=="login"&&(body.password.length<12||body.password.length>128)){setError(t("authPasswordBounds"));return;}
  pending.current=true;setBusy(true);
  try{let response:Response;
   try{response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
   catch{throw Error("The server could not be reached. Check your connection or the address you opened, then try again.");}
   // Show the server's own reason (wrong details, too many attempts, unverified email...).
   if(!response.ok){const failure=await response.json().catch(()=>null);throw Error(response.status===429?"Too many attempts. Please wait a few minutes and try again.":failure?.error?.message||"");}
   const result=await response.json();
   if(mode==="login"&&result.signedIn===true){clearWorkspaceCache();if(onSignedIn){await onSignedIn();return;}const next=new URL(window.location.href).searchParams.get("next");window.location.replace(next==="/super-admin"||result.redirect==="/super-admin"?"/super-admin":"/app/dashboard");return;}
   setMessage(mode==="verify"?t("authVerifySuccess"):mode==="reset"?t("authResetSuccess"):t("authRequestReceived"));setCompleted(true);form.reset();
  }catch(reason){setError(reason instanceof Error&&reason.message?reason.message:t("authRequestFailed"));}finally{pending.current=false;setBusy(false);}
 }
 return <main className="grid min-h-screen place-items-center bg-wash p-4"><Card className="w-full max-w-lg p-6 sm:p-8"><Logo/><h1 className="mt-7 text-3xl font-bold">{t(titleKey)}</h1><p className="mt-3 text-sm leading-6 text-muted">{mode==="register"?t("authRegisterDescription"):t("authDefaultDescription")}</p>{notice?<p role="status" className="mt-4 text-sm text-brand-700">{notice}</p>:null}{!enabled?<p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("authStorageUnavailable")}</p>:null}{mode==="register"&&enabled&&!emailDeliveryEnabled?<p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("authEmailDeliveryUnavailable")}</p>:null}<form onSubmit={submit} className="mt-6 grid gap-4">
  {mode==="register"?<label htmlFor="auth-name" className="grid gap-2 text-sm font-semibold">{t("authFullName")}<input id="auth-name" name="fullName" autoComplete="name" required maxLength={120} disabled={!enabled} className="field-control"/></label>:null}
  {email?<label htmlFor="auth-email" className="grid gap-2 text-sm font-semibold">{t("authEmail")}<input id="auth-email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={!enabled} className="field-control"/></label>:null}
  {password?<label htmlFor="auth-password" className="grid gap-2 text-sm font-semibold">{mode==="reset"?t("authNewPassword"):t("authPassword")}<PasswordInput id="auth-password" name="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={mode==="login"?1:12} maxLength={128} required disabled={!enabled} className="field-control"/>{mode!=="login"?<span className="text-xs font-normal text-muted">{t("authPasswordLength")}</span>:null}</label>:null}
  {mode==="verify"?<p className="text-sm text-muted">{t("authVerifyLinkNote")}</p>:null}{error?<p role="alert" className="text-sm text-red-700">{error}</p>:null}{message?<p role="status" className="text-sm text-brand-700">{message}</p>:null}<Button type="submit" disabled={!enabled||busy||completed}>{busy?t("authWait"):t(labelKey)}</Button>
 </form><nav aria-label={t("authAccountNavigation")} className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-brand-700"><Link href="/login">{t("signIn")}</Link><Link href="/register">{t("authCreateAccountLink")}</Link><Link href="/forgot-password">{t("authForgotLink")}</Link><Link href="/verify-email">{t("authVerifyLink")}</Link><Link href="/">{t("authBackToWebsite")}</Link></nav></Card></main>;
}
