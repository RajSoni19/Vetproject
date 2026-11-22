"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {subscriptionPlans,trialTerms,vatPlanFeatures,planMonthlyPrice,type PlanCode} from "@/lib/plan-catalog";
export function ProposedPlanInformation(){
 const [selected,setSelected]=useState<PlanCode|null>(null),[basicOrs,setBasicOrs]=useState(false);
 return <>
 <div className="mb-6"><p className="text-sm font-semibold text-brand-700">Plans and pricing</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Choose the right plan for your business</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Simple monthly plans. Your allowance is shared across all the companies in your account.</p></div>
 <div className="grid items-stretch gap-5 xl:grid-cols-3">{Object.values(subscriptionPlans).map(plan=><Card key={plan.code} className={`relative flex min-w-0 flex-col p-6 ${plan.recommended?"border-2 border-brand-700 bg-green-50/30":""}`}>
 <div className="mb-4 min-h-6">{plan.recommended?<span className="rounded-full bg-brand-700 px-3 py-1 text-xs font-semibold text-white">Recommended</span>:null}</div>
 <h3 className="text-xl font-bold">{plan.code}</h3><p className="mt-4"><span className="text-4xl font-bold tracking-tight">£{Number(plan.monthlyPrice)}</span><span className="text-sm text-muted"> / month</span></p>
 <dl className="my-6 divide-y divide-line text-sm">{[["Invoices / month",plan.invoices],["Companies",plan.companies],["Team",`Owner + ${plan.membersIncludingOwner-1} team member${plan.membersIncludingOwner>2?"s":""}`],["History access",plan.historyDays===null?"Unlimited":`${plan.historyDays} days`],["ORS",plan.orsIncluded?"Included":`Optional · £${Number(plan.orsOptionalMonthlyPrice)}/month`]].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
 <ul className="mb-5 space-y-3 text-sm">{vatPlanFeatures.map(feature=><li key={feature} className="flex gap-2"><span aria-hidden="true" className="font-bold text-brand-700">✓</span>{feature}</li>)}{plan.prioritySupport?<li className="font-semibold">Priority support</li>:null}</ul>
 {plan.code==="Basic"?<div className="mb-5 rounded-lg border border-line bg-white p-3 text-sm"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={basicOrs} onChange={event=>setBasicOrs(event.target.checked)}/>Add ORS ordering (+£{Number(plan.orsOptionalMonthlyPrice)}/month)</label><p className="mt-2 font-semibold">Basic + ORS: £{Number(planMonthlyPrice("Basic",true))}/month</p>{basicOrs?<p role="status" className="mt-2">Basic with ORS: £{Number(planMonthlyPrice("Basic",true))}/month.</p>:null}</div>:null}
 <Button variant={plan.recommended?"primary":"outline"} className="mt-auto w-full" onClick={()=>setSelected(plan.code)}>View {plan.code} details</Button>
 </Card>)}</div>
 <Card className="mt-6 p-5"><h3 className="font-semibold">Free {trialTerms.days}-day trial, no card needed</h3><p className="mt-2 text-sm leading-6 text-muted">Your first company gets a {trialTerms.days}-day free trial with up to {trialTerms.invoices} invoices a month and ORS ordering included. You are never charged automatically. When the trial ends you can still view and download all your records.</p></Card>
 {selected?<Card className="mt-5 p-6" role="region" aria-label={`${selected} plan details`}><h3 className="text-xl font-bold">{selected} plan</h3><p className="mt-3 text-sm text-muted">£{Number(subscriptionPlans[selected].monthlyPrice)}/month · up to {subscriptionPlans[selected].invoices} invoices a month, shared across your companies. Scanned and manually created invoices both count; editing an invoice does not. Your records are never deleted when you change plan.</p><Button variant="ghost" className="mt-4" onClick={()=>setSelected(null)}>Close</Button></Card>:null}
 </>;
}
