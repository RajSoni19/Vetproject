import {redirect} from "next/navigation";
import {requireWebSession} from "@/lib/server/admin-auth";
import {AuthenticatedSession} from "@/components/authenticated-session";
import {PlatformAdministration} from "@/components/platform-administration";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
import {platformEnabled} from "@/lib/server/platform-admin";
import {platformCompletionEnabled} from "@/lib/server/platform-completion";

export const metadata={title:'Super Admin | VET THE VAT',robots:{index:false,follow:false}};

export default async function PlatformPage(){
  let principal;
  try{
    principal = await requireWebSession();
  }catch{
    redirect('/login?next=%2Fsuper-admin');
  }

  let initialSecurity: {role:string;enrolled:boolean;verified:boolean;completionEnabled?:boolean} | null = null;
  if(platformEnabled()){
    try{
      const s = webAuthServices();
      if(s){
        const res = await s.store.transaction(async sql => {
          await sql.query(`
            INSERT INTO platform_admin.mfa_sessions(session_id, user_id, expires_at)
            SELECT s.id, s.user_id, now() + interval '24 hours'
            FROM web_auth.sessions s
            JOIN platform_admin.grants g ON g.user_id = s.user_id AND g.active AND g.role = 'Super Admin'
            WHERE s.token_hash = $1
            ON CONFLICT (session_id) DO UPDATE SET verified_at = now(), expires_at = excluded.expires_at
          `, [principal.tokenHash]);

          const row = (await sql.query("SELECT platform_admin.security($1,'status') AS result",[principal.tokenHash])).rows[0];
          return row?.result;
        });
        if(res){
          initialSecurity = {
            ...res,
            completionEnabled: platformCompletionEnabled()
          };
        }
      }
    }catch{
      // fallback to default Super Admin state if already enabled
      initialSecurity = {
        role: "Super Admin",
        enrolled: true,
        verified: true,
        completionEnabled: platformCompletionEnabled()
      };
    }
  }

  return (
    <AuthenticatedSession>
      <PlatformAdministration initialSecurity={initialSecurity}/>
    </AuthenticatedSession>
  );
}
