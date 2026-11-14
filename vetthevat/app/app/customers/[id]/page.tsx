"use client";
import {useParams} from "next/navigation";
import {CustomerWorkspace} from "@/components/customer-workspace";
export default function CustomerPage(){const {id}=useParams<{id:string}>();return <CustomerWorkspace key={id} id={id}/>;}
