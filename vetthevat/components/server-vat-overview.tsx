"use client";
import {useRef,useState} from "react";
import {businessData,downloadBusiness} from "@/lib/browser-business";
import {useLocale} from "@/components/locale-provider";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {formatCurrency,type MessageKey} from "@/lib/i18n/catalog";

type Group={direction:string;treatment:string;rate:string|null;net:string;vat:string;gross:string};
type VatReport={period:{startsOn:string;endsOn:string;currency:string};groups:Group[];inputVat:string;outputVat:string;netVat:string;kind:string;hmrcSubmission:boolean};
const treatmentKeys:Record<string,MessageKey>={standard:"vatTreatmentStandard",reduced:"vatTreatmentReduced",zero:"vatTreatmentZero",exempt:"vatTreatmentExempt",outside:"vatTreatmentOutside"};

export function ServerVatOverview({companyId}:{companyId:string}){
 const {t,locale}=useLocale(),[report,setReport]=useState<VatReport|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),pending=useRef(false),selection=useRef("");
 async function load(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(pending.current)return;const data=new FormData(event.currentTarget),params=new URLSearchParams({startsOn:String(data.get("startsOn")),endsOn:String(data.get("endsOn")),currency:String(data.get("currency"))});pending.current=true;setBusy(true);setError("");try{const result=await businessData(companyId,"vat-report?"+params) as VatReport;setReport(result);selection.current=params.toString();}catch{setReport(null);setError(t("reportPreparationError"));}finally{pending.current=false;setBusy(false);}}
 async function download(format:"pdf"|"xlsx"){if(pending.current||!report)return;pending.current=true;setBusy(true);setError("");try{await downloadBusiness(companyId,"vat-report?"+selection.current+"&format="+format,"vetthevat-vat-summary."+format);}catch{setError(t("reportPreparationError"));}finally{pending.current=false;setBusy(false);}}
 const money=(value:string)=>formatCurrency(Number(value),report?.period.currency??"GBP",locale);
 const direction=(value:string)=>value==="purchase"?t("analyticsPurchaseDirection"):value==="sale"?t("analyticsSaleDirection"):value;
 return <section className="space-y-5" aria-labelledby="vat-overview-title">
  <Card className="p-5"><h2 id="vat-overview-title" className="text-xl font-bold">{t("vatOverviewTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted">{t("vatOverviewDescription")}</p><form onSubmit={load} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
   <label className="grid gap-2 text-sm font-semibold">{t("reportStartDate")}<input name="startsOn" type="date" required disabled={busy} className="field-control"/></label>
   <label className="grid gap-2 text-sm font-semibold">{t("reportEndDate")}<input name="endsOn" type="date" required disabled={busy} className="field-control"/></label>
   <label className="grid gap-2 text-sm font-semibold">{t("reportCurrency")}<select name="currency" disabled={busy} className="field-control">{["GBP","EUR","USD"].map(currency=><option key={currency}>{currency}</option>)}</select></label>
   <Button type="submit" disabled={busy}>{t("vatReportLoadButton")}</Button>
  </form></Card>
  <p className="rounded-lg bg-wash p-4 text-sm leading-6 text-muted">{t("vatSummaryNotHmrc")}</p>
  <p className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900">Input VAT is included only after the amount on the original invoice and claim eligibility are human-reviewed. Cash-basis amounts use reviewed payment evidence. This management summary is not an HMRC submission.</p>
  {error?<p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>:null}
  {report?<>
   <Card className="p-5"><p className="text-sm text-muted">{report.period.startsOn} – {report.period.endsOn} · {report.period.currency}</p><dl className="mt-4 grid gap-4 sm:grid-cols-3">{[[t("vatSummaryInput"),report.inputVat],[t("vatSummaryOutput"),report.outputVat],[t("vatSummaryNet"),report.netVat]].map(([label,value])=><div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{money(String(value))}</dd></div>)}</dl></Card>
   <Card className="overflow-hidden"><h3 className="border-b border-line p-5 font-semibold">{t("vatSummaryGroup")}</h3>{report.groups.length?<div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr>{[t("vatSummaryDirection"),t("vatSummaryClassification"),t("vatSummaryRate"),t("reportNet"),t("reportVat"),t("reportGross")].map(label=><th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{report.groups.map((row,index)=><tr className="border-t border-line" key={`${row.direction}:${row.treatment}:${row.rate}:${index}`}><td className="p-3">{direction(row.direction)}</td><td className="p-3">{treatmentKeys[row.treatment]?t(treatmentKeys[row.treatment]):row.treatment}</td><td className="p-3 tabular-nums">{row.rate===null?"—":`${row.rate}%`}</td><td className="p-3 tabular-nums">{money(row.net)}</td><td className="p-3 tabular-nums">{money(row.vat)}</td><td className="p-3 tabular-nums">{money(row.gross)}</td></tr>)}</tbody></table></div>:<p className="p-5 text-sm text-muted">{t("vatNotRecorded")}</p>}</Card>
   <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={()=>void download("pdf")}>{t("vatSummaryExportPdf")}</Button><Button variant="outline" disabled={busy} onClick={()=>void download("xlsx")}>{t("vatSummaryExportExcel")}</Button></div>
  </>:null}
 </section>;
}
