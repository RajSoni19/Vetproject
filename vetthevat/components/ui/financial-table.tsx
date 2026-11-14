"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { SelectField } from "@/components/ui/field";
import { useLocale } from "@/components/locale-provider";

export type FinancialColumn<T> = { key: string; label: string; render: (row: T) => React.ReactNode; value?: (row: T) => string | number; numeric?: boolean; optional?: boolean };
export function FinancialTable<T>({ rows, columns, rowKey, caption, empty, mobile, pageSize = 20, recordLabel = "invoices" }: { rows: T[]; columns: FinancialColumn<T>[]; rowKey: (row: T) => string; caption: string; empty?: React.ReactNode; mobile?: (row: T) => React.ReactNode; pageSize?: number; recordLabel?: string }) {
  const {t}=useLocale();
  const [sort, setSort] = useState<{key: string; ascending: boolean} | null>(null), [page, setPage] = useState(0);
  const column = columns.find((item) => item.key === sort?.key);
  const sorted = column?.value && sort ? [...rows].sort((a, b) => { const left = column.value!(a), right = column.value!(b); const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right)); return sort.ascending ? result : -result; }) : rows;
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1)), shown = sorted.slice(current * pageSize, (current + 1) * pageSize);
  if (!rows.length) return empty ?? <Feedback title={t("reportNoMatchingRecords")}>{t("reportChangeFiltersOrAddRecord")}</Feedback>;
  return <>
    {mobile && columns.some(item => item.value) ? <div className="grid grid-cols-[1fr_auto] items-end gap-3 border-b border-line p-4 md:hidden">
      <SelectField label={t("reportSortRecords")} aria-label={`${t("reportSortRecords")} ${caption}`} value={sort?.key ?? ""} onChange={event => { setSort(event.target.value ? {key:event.target.value,ascending:true} : null);setPage(0); }}>
        <option value="">{t("reportOriginalOrder")}</option>{columns.filter(item => item.value).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
      </SelectField>
      <Button variant="outline" type="button" disabled={!sort} aria-label={`${t("reportSortReverse")} ${caption}`} onClick={() => {if(sort)setSort({...sort,ascending:!sort.ascending});setPage(0);}}>{sort?.ascending === false ? t("reportDescending") : t("reportAscending")}</Button>
    </div> : null}
    <div className={mobile ? "hidden overflow-x-auto md:block" : "overflow-x-auto"} tabIndex={0} role="region" aria-label={caption}><table className="financial-table"><caption className="sr-only">{caption}</caption><thead><tr>{columns.map((item) => <th key={item.key} scope="col" className={cn(item.numeric && "money", item.optional && "hidden xl:table-cell")} aria-sort={item.value ? sort?.key === item.key ? sort.ascending ? "ascending" : "descending" : "none" : undefined}>{item.value ? <button type="button" className={cn("inline-flex min-h-8 items-center gap-1.5", item.numeric && "justify-end")} onClick={() => { setSort({key:item.key,ascending:sort?.key === item.key ? !sort.ascending : true}); setPage(0); }}>{item.label}{sort?.key === item.key ? sort.ascending ? <ArrowUp aria-hidden="true" className="h-3 w-3" /> : <ArrowDown aria-hidden="true" className="h-3 w-3" /> : null}</button> : item.label}</th>)}</tr></thead><tbody>{shown.map((row) => <tr key={rowKey(row)}>{columns.map((item) => <td key={item.key} className={cn(item.numeric && "money", item.optional && "hidden xl:table-cell")}>{item.render(row)}</td>)}</tr>)}</tbody></table></div>
    {mobile ? <div className="grid divide-y divide-line md:hidden">{shown.map((row) => <div key={rowKey(row)} className="p-4">{mobile(row)}</div>)}</div> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted"><span role="status" aria-live="polite" aria-atomic="true">{rows.length} {t("reportMatching")} {recordLabel} · {t("reportPage")} {current + 1} {t("reportOf")} {Math.max(1, Math.ceil(rows.length / pageSize))}{sort ? ` · ${column?.label}, ${sort.ascending ? t("reportAscending") : t("reportDescending")}` : ""}</span><div className="flex items-center gap-2"><Button type="button" variant="outline" className="min-h-11 px-3 text-xs" disabled={current === 0} onClick={() => setPage(current - 1)}>{t("reportPrevious")}</Button><Button type="button" variant="outline" className="min-h-11 px-3 text-xs" disabled={(current + 1) * pageSize >= rows.length} onClick={() => setPage(current + 1)}>{t("reportNext")}</Button></div></div>
  </>;
}

