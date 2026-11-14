"use client";
import {useEffect,useState} from "react";
import type {StoredDocument} from "@/lib/domain";
export function useDocumentAvailability(documents:StoredDocument[]){const urls=JSON.stringify([...new Set(documents.map(row=>row.localPreviewUrl).filter((url):url is string=>Boolean(url?.startsWith("blob:"))))]);const [valid,setValid]=useState<string[]>([]);useEffect(()=>{const controller=new AbortController();void Promise.all((JSON.parse(urls) as string[]).map(async url=>{try{const response=await fetch(url,{signal:controller.signal});await response.body?.cancel();return response.ok?url:"";}catch{return "";}})).then(values=>{if(!controller.signal.aborted)setValid(values.filter(Boolean));});return()=>controller.abort();},[urls]);return new Set(valid);}
