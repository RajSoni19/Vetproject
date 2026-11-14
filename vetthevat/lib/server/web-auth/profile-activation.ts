export const accountProfileSchemaSha256="1da3f1710d313b804910582f80117c5feee49d851868dda36895b9ff108c04c2";
export function accountProfileUpdateEnabled(env:Readonly<Record<string,string|undefined>>){return env.WEB_AUTH_PROFILE_UPDATE_ENABLED==="1"&&env.WEB_AUTH_PROFILE_UPDATE_SCHEMA_SHA256===accountProfileSchemaSha256;}
