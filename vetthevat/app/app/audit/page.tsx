"use client";
import { useState } from "react";
import { useAppState } from "@/components/app-state";
import { PageHeader } from "@/components/workspace-kit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { TextField, SelectField } from "@/components/ui/field";
import { FinancialTable } from "@/components/ui/financial-table";
import { filterActivity, type ActivityFilters } from "@/lib/activity-filters";

export default function AuditPage() {
  const { auditLog, selectedCompany, storageReady } = useAppState();
  const [filters,setFilters] = useState<ActivityFilters>({});
  const change = (key:keyof ActivityFilters,value:string) => setFilters({...filters,[key]:value});
  let error="", rows: typeof auditLog=[];
  try { rows=filterActivity(auditLog,selectedCompany.id,filters); } catch(reason) { error=reason instanceof Error ? reason.message : "Activity filters could not be applied."; }
  if(!storageReady)return <Feedback kind="loading" title="Loading local activity"/>;
  return <>
    <PageHeader title="Audit Log" description={`${selectedCompany.name} ? Your saved local activity. Browser records are editable and are not a secure server audit trail.`}/>
    <Card className="mb-5 p-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <TextField label="Search activity" placeholder="Action, record, user or details" value={filters.query??""} onChange={event=>change("query",event.target.value)}/>
      <SelectField label="Activity action" value={filters.action??""} onChange={event=>change("action",event.target.value)}><option value="">All actions</option>{[...new Set(auditLog.map(event=>event.action))].sort().map(action=><option key={action}>{action}</option>)}</SelectField>
      <TextField label="Activity start date" type="date" value={filters.dateFrom??""} onChange={event=>change("dateFrom",event.target.value)} error={error||undefined}/>
      <TextField label="Activity end date" type="date" value={filters.dateTo??""} onChange={event=>change("dateTo",event.target.value)}/>
    </div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-muted">Dates use recorded calendar dates, without timezone conversion. Undated legacy events appear only without date filters.</p><Button variant="ghost" onClick={()=>setFilters({})}>Clear activity filters</Button></div></Card>
    {error ? <Feedback kind="error" title="Check activity filters">{error}</Feedback> : <Card className="overflow-hidden"><FinancialTable key={JSON.stringify([selectedCompany.id,filters])} rows={rows} caption="Local company activity" recordLabel="events" rowKey={event=>event.id} columns={[
      {key:"date",label:"Recorded timestamp",value:event=>event.createdAt,render:event=><span className="whitespace-nowrap text-xs text-muted">{event.createdAt||"Not recorded"}</span>},
      {key:"user",label:"User",value:event=>event.user,render:event=>event.user},
      {key:"action",label:"Action",value:event=>event.action,render:event=><strong>{event.action}</strong>},
      {key:"entity",label:"Record",value:event=>event.entity,render:event=><span className="break-words">{event.entity}</span>},
      {key:"details",label:"Details",render:event=><span className="block max-w-lg whitespace-pre-wrap break-words text-muted">{event.details}</span>}
    ]} empty={<Feedback title="No matching activity">Change your search or clear the filters. No local records have been removed.</Feedback>} mobile={event=><article className="min-w-0"><h2 className="break-words font-semibold">{event.action}</h2><p className="mt-2 break-words text-xs text-muted">{event.createdAt||"Date not recorded"} ? {event.user}</p><p className="mt-2 break-words text-sm font-medium">{event.entity}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{event.details}</p></article>}/></Card>}
  </>;
}
