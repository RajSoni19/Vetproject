export function marketingOrigin(value:unknown){
 if(value===undefined||value===""){
  return undefined;
 }
 if(typeof value!=="string"||!/^([a-z0-9][a-z0-9-]*\.)+[a-z0-9-]+\.vercel\.app$/i.test(value)&&!/^[a-z0-9][a-z0-9-]*\.vercel\.app$/i.test(value))throw new Error("Only a temporary vercel.app origin is approved.");
 return `https://${value.toLowerCase()}`;
}
// Vercel provides the stable production hostname separately from the unique
// deployment hostname. Prefer it so canonical URLs do not change on redeploy.
export function publicSiteOrigin(){return marketingOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL??process.env.VERCEL_URL);}
