import {AuthSetupNotice} from "@/components/auth-setup-notice";
// Keep existing page signatures while removing simulated submissions entirely.
export function AuthFormPage({title,description}:{title:string;description:string;fields?:string[];button?:string;next?:string}){return <AuthSetupNotice title={title} description={description}/>;}
