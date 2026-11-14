import {lstatSync,realpathSync} from "node:fs";
import {ApiError} from "@/lib/server/api-v1";
import {readManagedDeployment} from "@/lib/server/deployment-profile";
import {filesystemOriginalStore} from "@/lib/server/saas/local-originals";

export function serverversePrivateOriginals(env:Readonly<Record<string,string|undefined>>){
 if(env.VTV_PRIVATE_ORIGINALS_ENABLED!=="1")return undefined;
 const deployment=readManagedDeployment(env);
 const root="/var/lib/vetthevat-production-originals",uid=Number(env.VTV_ORIGINALS_OWNER_UID),gid=Number(env.VTV_ORIGINALS_GROUP_ID);
 if(!deployment||deployment.provider!=="serververse"||process.platform!=="linux"||!process.getuid?.()||env.VTV_PRIVATE_ORIGINALS_APPROVED!==`production:${deployment.installationId}`||env.VTV_PRIVATE_ORIGINALS_DIR!==root||!Number.isSafeInteger(uid)||uid<1||!Number.isSafeInteger(gid)||gid<1)throw new ApiError(503,"UNAVAILABLE","Approved ServerVerse private-storage identity required.");
 // The directory is provisioned separately, never created/chmodded by a request.
 const stat=lstatSync(root);
 if(stat.isSymbolicLink()||!stat.isDirectory()||realpathSync(root)!==root||stat.uid!==uid||stat.gid!==gid||(stat.mode&0o7777)!==0o2750||process.getuid()!==uid&&!process.getgroups?.().includes(gid))throw new ApiError(503,"UNAVAILABLE","Private originals ownership or permissions differ from the approved host inventory.");
 return filesystemOriginalStore(root,{readOnly:process.getuid()!==uid,fileMode:0o640});
}
