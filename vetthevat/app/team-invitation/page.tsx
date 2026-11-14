import type {Metadata} from "next";
import {TeamInvitationLanding} from "@/components/team-invitation-landing";
import {webLoginConfiguration} from "@/lib/server/admin-services";

export const dynamic="force-dynamic";
export const metadata:Metadata={robots:{index:false,follow:false},referrer:"no-referrer"};

export default async function TeamInvitationPage({searchParams}:{searchParams:Promise<{invitation?:string}>}){
 const query=await searchParams,token=typeof query.invitation==="string"&&/^[A-Za-z0-9_-]{43}$/.test(query.invitation)?query.invitation:null;
 return <TeamInvitationLanding token={token} enabled={webLoginConfiguration().enabled}/>;
}
