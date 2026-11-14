import {requireAdministrator} from "@/lib/server/admin-auth";
import {redirect} from "next/navigation";
export default async function AdministrationLayout({children}:{children:React.ReactNode}){try{await requireAdministrator();}catch{redirect("/app/dashboard?access=denied");}return children;}
