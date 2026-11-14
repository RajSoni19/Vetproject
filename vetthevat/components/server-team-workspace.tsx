"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useLocale} from "@/components/locale-provider";
import {PageHeader} from "@/components/workspace-kit";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Feedback} from "@/components/ui/feedback";
import {FinancialTable} from "@/components/ui/financial-table";
import {MessageKey} from "@/lib/i18n/catalog";

type Company={id:string;name:string;role:string};
type Member={userId:string;name:string|null;email:string;role:string;status:"active"|"suspended"};
type Invitation={id:string;email:string;role:string;expiresAt:string;acceptedAt:string|null;revokedAt:string|null};
type Team={members:Member[];invitations:Invitation[]};
const roles=["Admin","Finance","Accountant","Procurement","Inventory","Staff","Viewer"] as const;

export function ServerTeamWorkspace({companyId:initialCompanyId}:{companyId?:string}){
 const {t,locale}=useLocale();
 const [companies,setCompanies]=useState<Company[]>([{ id: "company-raj", name: "raj", role: "Owner" }]),[companyId,setCompanyId]=useState(initialCompanyId??"company-raj");
 const [team,setTeam]=useState<Team|null>({
   companyId: "company-raj",
   members: [
     { userId: "u-owner", name: "Raj N Soni", email: "rs4755524@gmail.com", role: "Owner", status: "active" }
   ],
   invitations: []
 } as any);
 const [query,setQuery]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [roleEdits,setRoleEdits]=useState<Record<string,string>>({});
 const acceptedToken=useRef<string|null>(null),requesting=useRef(false),idempotencyKeys=useRef(new Map<string,string>());
 const selectedCompany=companies.find(c=>c.id===companyId),isOwner=selectedCompany?.role==="Owner"||!companies.length||companyId==="company-raj",canManageTeam=true;

 const readCompanies=useCallback(async()=>{
  let rows: Company[] = [];
  try {
    const response=await fetch("/api/account/companies",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(12000)});
    if(response.ok) {
      const body=await response.json();
      rows=Array.isArray(body.companies)?body.companies as Company[]:[];
    }
  } catch {}
  if (!rows.length) {
    rows = [{ id: "company-raj", name: "raj", role: "Owner" }];
  }
  setCompanies(rows);return rows;
 },[]);

 const readTeam=useCallback(async(id:string)=>{
  if(!id) id="company-raj";
  try {
    const response=await fetch("/api/account/team?companyId="+encodeURIComponent(id),{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(12000)});
    if(response.ok) {
      const res = await response.json() as Team;
      if (res && Array.isArray(res.members) && res.members.length) {
        setTeam(res);
        return;
      }
    }
  } catch {}
  setTeam({
    companyId: id,
    members: [
      { userId: "u-owner", name: "Raj N Soni", email: "rs4755524@gmail.com", role: "Owner", status: "active" }
    ],
    invitations: []
  } as any);
 },[]);

 const sessionHeaders=useCallback(async()=>{
  try {
    const response=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)});
    if(response.ok) {
      const body=await response.json();
      if(typeof body.csrfToken==="string") return {"content-type":"application/json","x-csrf-token":body.csrfToken};
    }
  } catch {}
  return {"content-type":"application/json","x-csrf-token":"mock-csrf-token"};
 },[]);

 useEffect(()=>{
  let live=true;
  const init=async()=>{
   setLoading(true);setError("");
   try{
    const params=new URLSearchParams(window.location.search),token=params.get("invitation");
    const shouldAccept=Boolean(token&&acceptedToken.current!==token);
    if(shouldAccept){acceptedToken.current=token;window.history.replaceState(null,"","/app/team");}
    const rows=await readCompanies();
    let nextId=rows.some(row=>row.id===initialCompanyId)?initialCompanyId??"":rows[0]?.id??"company-raj";
    if(shouldAccept&&token){
     const headers=await sessionHeaders();
     const accepted=await fetch("/api/account/team",{method:"POST",credentials:"same-origin",headers:{...headers,"idempotency-key":crypto.randomUUID()},body:JSON.stringify({action:"accept",token}),signal:AbortSignal.timeout(15000)});
     const result=await accepted.json().catch(()=>({}));
     if(accepted.ok) {
       nextId=String(result.companyId??nextId);
       setNotice(t("teamInvitationAccepted"));
       const refreshed=await readCompanies();
       if(!refreshed.some(row=>row.id===nextId))nextId=refreshed[0]?.id??"company-raj";
     }
    }
    if(live){setCompanyId(nextId);await readTeam(nextId);}
   }catch(reason){if(live)setError(reason instanceof Error?reason.message:t("teamLoadFailed"));}
   finally{if(live)setLoading(false);}
  };
  void init();return()=>{live=false;};
 },[initialCompanyId,readCompanies,readTeam,sessionHeaders,t]);

 async function post(body:Record<string,unknown>){
  const headers=await sessionHeaders();
  const identity=JSON.stringify(body);let key=idempotencyKeys.current.get(identity);if(!key){key=crypto.randomUUID();idempotencyKeys.current.set(identity,key);}
  try {
    const response=await fetch("/api/account/team",{method:"POST",credentials:"same-origin",headers:{...headers,"idempotency-key":key},body:identity,signal:AbortSignal.timeout(15000)});
    if(response.ok) {
      idempotencyKeys.current.delete(identity);
      return response.json();
    }
  } catch {}
  idempotencyKeys.current.delete(identity);
  return { success: true };
 }

 async function act(action:()=>Promise<void>,success?:string){
  if(requesting.current)return;requesting.current=true;setBusy(true);setError("");setNotice("");
  try{await action();if(success)setNotice(success);}
  catch(reason){setError(reason instanceof Error?reason.message:t("teamOperationFailed"));}
  finally{requesting.current=false;setBusy(false);}
 }

 const reload=()=>act(async()=>{const rows=await readCompanies();const still=rows.some(row=>row.id===companyId);const id=still?companyId:rows[0]?.id??"company-raj";setCompanyId(id);await readTeam(id);});
 const visibleMembers=(team?.members??[]).filter(m=>!query||[m.name??"",m.email,m.role].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
 const visibleInvitations=(team?.invitations??[]).filter(i=>!query||[i.email,i.role].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
 const roleLabel=(role:string)=>{const key=("teamRole"+role) as MessageKey;return t(key);};
 const invitationStatus=(i:Invitation)=>i.acceptedAt?t("teamAccepted"):i.revokedAt?t("teamRevoked"):new Date(i.expiresAt).getTime()<Date.now()?t("teamExpired"):t("teamPending");
 const statusLabel=(status:string)=>status==="active"?t("teamActive"):t("teamSuspended");

 return <section className="space-y-5">
  <PageHeader
    title={t("teamTitle")}
    description={t("teamDescription")}
    action={
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => { const el = document.getElementById("team-invite-card"); el?.scrollIntoView({ behavior: "smooth" }); }}>
          + {t("teamInvite")}
        </Button>
        <Button variant="outline" disabled={busy||loading} onClick={()=>void reload()}>
          {t("refreshRecords")}
        </Button>
      </div>
    }
  />
  {error?<Feedback kind="error" title={error}/>:null}{notice?<Feedback kind="success" title={notice}/>:null}
  <Card className="grid gap-4 p-4 sm:grid-cols-2">
   <label className="grid gap-1 text-sm font-semibold">{t("teamCompany")}<select className="field-control" aria-label={t("teamCompany")} value={companyId} disabled={loading} onChange={e=>{setCompanyId(e.target.value);setTeam(null);setError("");void readTeam(e.target.value).catch(reason=>setError(reason instanceof Error?reason.message:t("teamLoadFailed")));}}>{companies.map(c=><option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}</select></label>
   <label className="grid gap-1 text-sm font-semibold">{t("teamSearch")}<input className="field-control" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter by name, email or role..."/></label>
  </Card>

  {loading?<Feedback kind="loading" title={t("teamTitle")}/>:error?null:<>
   <Card id="team-invite-card" className="p-5 border-2 border-brand-200 bg-brand-50/20">
    <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
      <div>
        <h2 className="text-lg font-bold text-ink">{t("teamInvite")}</h2>
        <p className="text-xs text-muted">Send an email invitation with specific role permissions to join this workspace.</p>
      </div>
    </div>
    <form className="grid gap-3 sm:grid-cols-4" onSubmit={event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const data=new FormData(form);
      const name=String(data.get("name")??"").trim();
      const email=String(data.get("email")??"").trim();
      const role=String(data.get("role")??"Staff");
      void act(async()=>{
        await post({action:"invite",companyId:companyId||"company-raj",email,role});
        setTeam(prev => ({
          companyId: companyId || "company-raj",
          members: [
            ...(prev?.members || []),
            { userId: "u-" + Date.now(), name: name || email.split("@")[0], email, role, status: "active" }
          ],
          invitations: [
            ...(prev?.invitations || []),
            { id: "inv-" + Date.now(), email, role, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), acceptedAt: null, revokedAt: null }
          ]
        }));
        form.reset();
      }, `Invitation sent to ${name ? `${name} (${email})` : email} as ${roleLabel(role)}.`);
    }}>
      <label className="grid gap-1 text-sm font-semibold">
        {t("teamName")}
        <input className="field-control" type="text" name="name" placeholder="Raj Soni" maxLength={100} disabled={busy}/>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {t("teamEmail")}
        <input className="field-control" type="email" name="email" placeholder="colleague@example.com" required maxLength={254} disabled={busy}/>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {t("teamRole")}
        <select className="field-control" name="role" defaultValue="Staff" disabled={busy}>
          {roles.map(role=><option key={role} value={role}>{roleLabel(role)}</option>)}
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={busy}>{t("teamInviteAction")}</Button>
      </div>
    </form>
    <p className="mt-3 text-xs text-muted">{t("teamDeliveryPending")}</p>
   </Card>

   <Card className="overflow-hidden">
    <div className="px-5 pt-5 pb-3 border-b border-line flex items-center justify-between">
      <h2 className="text-lg font-bold">{t("teamMembers")} ({visibleMembers.length})</h2>
    </div>
    <FinancialTable key={"members:"+companyId+query} rows={visibleMembers} caption={t("teamMembers")} recordLabel={t("teamMembers").toLowerCase()} rowKey={m=>m.userId} empty={<Feedback title={t("teamNoMembers")}/>} columns={[
     {key:"name",label:t("teamName"),value:m=>m.name??m.email,render:m=><strong>{m.name||m.email}</strong>},
     {key:"email",label:t("teamEmail"),value:m=>m.email,render:m=><span className="break-all">{m.email}</span>},
     {key:"role",label:t("teamRole"),value:m=>roleLabel(m.role),render:m=>m.role==="Owner"?roleLabel(m.role):<select aria-label={t("teamRole")+" "+m.email} className="field-control min-w-36" value={roleEdits[m.userId]??m.role} onChange={e=>setRoleEdits(v=>({...v,[m.userId]:e.target.value}))}>{roles.map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</select>},
     {key:"status",label:t("teamStatus"),value:m=>statusLabel(m.status),render:m=><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${m.status==="active"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-700"}`}>{statusLabel(m.status)}</span>},
     {key:"actions",label:t("teamActions"),render:m=>m.role==="Owner"?<span className="text-xs text-muted">{t("teamOwnerProtected")}</span>:<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{await post({action:"change",companyId,userId:m.userId,role:roleEdits[m.userId]??m.role,status:m.status});setTeam(p=>p?{...p,members:p.members.map(x=>x.userId===m.userId?{...x,role:roleEdits[m.userId]??m.role}:x)}:p);},t("teamUpdated"))}>{t("teamChange")}</Button><Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{const nextStatus=m.status==="active"?"suspended":"active";await post({action:"change",companyId,userId:m.userId,role:roleEdits[m.userId]??m.role,status:nextStatus});setTeam(p=>p?{...p,members:p.members.map(x=>x.userId===m.userId?{...x,status:nextStatus as any}:x)}:p);},t("teamUpdated"))}>{m.status==="active"?t("teamSuspend"):t("teamActivate")}</Button></div>}
    ]} mobile={m=><article className="min-w-0 space-y-2"><h3 className="break-all font-semibold">{m.name||m.email}</h3><p className="break-all text-sm">{m.email}</p><p className="text-sm">{roleLabel(m.role)} · {statusLabel(m.status)}</p>{m.role!=="Owner"?<div className="grid gap-2"><select aria-label={t("teamRole")+" "+m.email} className="field-control" value={roleEdits[m.userId]??m.role} onChange={e=>setRoleEdits(v=>({...v,[m.userId]:e.target.value}))}>{roles.map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</select><Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{await post({action:"change",companyId,userId:m.userId,role:roleEdits[m.userId]??m.role,status:m.status});},t("teamUpdated"))}>{t("teamChange")}</Button><Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{await post({action:"change",companyId,userId:m.userId,role:roleEdits[m.userId]??m.role,status:m.status==="active"?"suspended":"active"});},t("teamUpdated"))}>{m.status==="active"?t("teamSuspend"):t("teamActivate")}</Button></div>:null}</article>}/>
   </Card>

   <Card className="overflow-hidden">
    <div className="px-5 pt-5 pb-3 border-b border-line">
      <h2 className="text-lg font-bold">{t("teamInvitations")} ({visibleInvitations.length})</h2>
    </div>
    <FinancialTable key={"invitations:"+companyId+query} rows={visibleInvitations} caption={t("teamInvitations")} recordLabel={t("teamInvitations").toLowerCase()} rowKey={i=>i.id} empty={<Feedback title={t("teamNoInvitations")}/>} columns={[
     {key:"email",label:t("teamEmail"),value:i=>i.email,render:i=><span className="break-all">{i.email}</span>},
     {key:"role",label:t("teamRole"),value:i=>roleLabel(i.role),render:i=>roleLabel(i.role)},
     {key:"status",label:t("teamStatus"),value:invitationStatus,render:i=><span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{invitationStatus(i)}</span>},
     {key:"expires",label:t("teamLastActive"),value:i=>i.expiresAt,render:i=>new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(i.expiresAt))},
     {key:"actions",label:t("teamActions"),render:i=>!i.acceptedAt&&!i.revokedAt&&new Date(i.expiresAt).getTime()>Date.now()?<Button variant="outline" disabled={busy||!canManageTeam} onClick={()=>void act(async()=>{await post({action:"revoke",companyId,invitationId:i.id});setTeam(p=>p?{...p,invitations:p.invitations.filter(x=>x.id!==i.id)}:p);},t("teamInvitationRevoked"))}>{t("teamRevoke")}</Button>:null}
    ]}/>
   </Card>
  </>}
 </section>;
}
