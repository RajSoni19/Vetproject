"use client";
import {useLocale} from "@/components/locale-provider";
import {formatCurrencyString} from "@/lib/i18n/catalog";
// Number conversion is for pixel proportions only. Displayed financial values
// and all metric calculations remain the server's exact decimal strings.
export function AnalyticsBars({title,rows,currency}:{title:string;rows:{label:string;value:string|null}[];currency?:string}){
 const {locale,t}=useLocale();
 const maximum=Math.max(0,...rows.map(r=>Math.abs(Number(r.value??0))));
 return <figure className="min-w-0 space-y-3" aria-label={title}><figcaption className="font-semibold">{title}</figcaption>{rows.length?rows.map((row,i)=><div key={row.label+i} className="space-y-1"><div className="flex flex-wrap justify-between gap-x-3 text-xs"><span className="break-words">{row.label}</span><span className="font-mono">{row.value===null?t('analyticsUnavailableValue'):currency?formatCurrencyString(row.value,currency,locale):row.value}</span></div><div className="h-3 overflow-hidden rounded bg-slate-100"><div className={Number(row.value)<0?'h-full rounded bg-rose-600':'h-full rounded bg-emerald-600'} style={{width:maximum?Math.min(100,Math.abs(Number(row.value??0))/maximum*100)+'%':'0%'}}/></div></div>):<p className="text-sm text-muted">{t('analyticsNoMatchingObservations')}</p>}</figure>;
}
