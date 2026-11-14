export const platformCompletionSha256='8585d6227d5c998c3fb24c9db50c28653f49f8176cfc00e194b0fe17d2b9339a';
export function platformCompletionEnabled(env:Readonly<Record<string,string|undefined>>=process.env){return env.PLATFORM_COMPLETION_ENABLED==='1'&&env.PLATFORM_COMPLETION_SCHEMA_SHA256===platformCompletionSha256;}
