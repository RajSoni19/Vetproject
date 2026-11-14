"use client";
import {Button} from "@/components/ui/button";
export function collectionPage<T>(rows:T[],page:number,size=12){
  const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(Math.max(0,page),pages-1);
  return {rows:rows.slice(current*size,(current+1)*size),current,pages};
}
export function CollectionPagination({count,page,onPage,label,size=12}:{count:number;page:number;onPage:(page:number)=>void;label:string;size?:number}){
  const pages=Math.max(1,Math.ceil(count/size)),current=Math.min(page,pages-1);
  return <nav aria-label={`${label} pagination`} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-4"><p role="status" aria-live="polite" className="text-sm text-muted">{count} matching {label} · Page {current+1} of {pages}</p><div className="flex gap-2"><Button variant="outline" disabled={current===0} onClick={()=>onPage(current-1)}>Previous</Button><Button variant="outline" disabled={current+1>=pages} onClick={()=>onPage(current+1)}>Next</Button></div></nav>;
}
