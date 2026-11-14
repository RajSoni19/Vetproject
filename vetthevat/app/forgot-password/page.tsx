import {WebAuthForm} from "@/components/web-auth-form";
import {webLoginConfiguration} from "@/lib/server/admin-services";
export const dynamic="force-dynamic";
export default async function AccountPage({searchParams}:{searchParams:Promise<{token?:string;expired?:string;signedOut?:string}>}){const query=await searchParams,config=webLoginConfiguration();const token=typeof query.token==="string"&&/^[A-Za-z0-9_-]{43}$/.test(query.token)?query.token:undefined;return <WebAuthForm mode={"forgot"} enabled={config.enabled} token={token} notice={query.expired==="1"?"Your session has expired or access was removed. Please sign in again.":query.signedOut==="1"?"You have signed out securely.":undefined}/>;}
