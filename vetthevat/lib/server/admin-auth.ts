import "server-only";
import {cookies} from "next/headers";
import {authorizeCookie,administrator,binding} from "@/lib/server/web-auth/core";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
export {administratorAuthServices} from "@/lib/server/admin-services";
export async function requireWebSession(){const values=(await cookies()).getAll("__Host-vetthevat-session");const services=webAuthServices();const principal=await authorizeCookie(values.length===1?values[0].value:"",services);return {...principal,csrfBinding:binding(services!,principal)};}
export async function requireAdministrator(){return administrator(await requireWebSession());}
