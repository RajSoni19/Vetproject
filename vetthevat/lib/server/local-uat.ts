// Explicit isolated test profile. Never accepts the live development database,
// production origins, remote hosts, hosted runtimes or owner credentials.
export function localUat(env:Readonly<Record<string,string|undefined>>){
 const database=env.VTV_LOCAL_UAT_DATABASE??'';
 if(env.VTV_LOCAL_UAT_ENABLED!=='1'||env.WEB_AUTH_ENV!=='test'||env.VERCEL!==undefined||env.VTV_DEPLOYMENT_PROFILE||!/^vtv_uat_\d{14}_[a-f0-9]{8}$/.test(database)||env.SAAS_DATABASE_APPROVED!==database||env.WEB_AUTH_LOCAL_DATABASE_APPROVED!==database||env.WEB_AUTH_ORIGIN!=='https://localhost:3445'||!/^[a-f0-9-]{36}$/.test(env.VTV_LOCAL_UAT_RUN_ID??''))return undefined;
 return {database,origin:'https://localhost:3445' as const,host:'127.0.0.1' as const,port:55440};
}
