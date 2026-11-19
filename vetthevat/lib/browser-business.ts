// UI transport only. Financial authority and authorization stay on the server.
import {friendlyErrorMessage} from '@/lib/friendly-errors';
export async function businessRequest(companyId:string,path:string,options:{method?:'GET'|'POST'|'PUT'|'DELETE';body?:unknown;version?:number;key?:string;signal?:AbortSignal}={}){
 const method=options.method??'GET',headers:Record<string,string>={'x-company-id':companyId};
 if(method!=='GET'){
  const response=await fetch('/api/auth/session',{cache:'no-store',credentials:'same-origin',signal:options.signal});if(!response.ok)throw Error('Sign in again.');
  headers['x-csrf-token']=(await response.json()).csrfToken;headers['content-type']='application/json';headers['if-match']='"'+(options.version??1)+'"';headers['idempotency-key']=options.key??'';
 }
 const response=await fetch('/api/business/'+path,{method,headers,credentials:'same-origin',cache:'no-store',body:options.body===undefined?undefined:JSON.stringify(options.body),signal:options.signal??AbortSignal.timeout(20000)});
 if(!response.ok){let message='Something went wrong. Please try again.';try{message=(await response.json()).error?.message??message;}catch{}throw Error(friendlyErrorMessage(message));}return response;
}
export async function businessData(companyId:string,path:string,options:Parameters<typeof businessRequest>[2]={}){return (await (await businessRequest(companyId,path,options)).json()).data;}
export async function downloadBusiness(companyId:string,path:string,name:string){const response=await businessRequest(companyId,path),url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// Multipart POST (the browser sets the boundary); same session and CSRF protection.
export async function businessForm(companyId:string,path:string,form:FormData,signal:AbortSignal){
 const session=await fetch('/api/auth/session',{cache:'no-store',credentials:'same-origin',signal});if(!session.ok)throw Error('Sign in again.');
 const response=await fetch('/api/business/'+path,{method:'POST',headers:{'x-company-id':companyId,'x-csrf-token':(await session.json()).csrfToken},credentials:'same-origin',cache:'no-store',body:form,signal});
 if(!response.ok)throw Error('The request could not be completed.');return (await response.json()).data;
}
