import {createHash} from "node:crypto";
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand,ListObjectsV2Command} from "@aws-sdk/client-s3";
import {ApiError} from "@/lib/server/api-v1";
import {managedProfileSelected,readManagedDeployment} from "@/lib/server/deployment-profile";
import {checkOriginal,checkPrivateAsset,supplierLogoMetadata,uploadMetadata,type PrivateAssetStore,type PrivateOriginalStore,type StoredOriginal,type StoredPrivateAsset} from "@/lib/server/saas/object-storage";
export type R2Configuration={accountId:string;bucket:string;accessKeyId:string;secretAccessKey:string;auditToken:string};
// Explicit isolated development bucket only. Production activation is separate.
export function readR2Configuration(env:Readonly<Record<string,string|undefined>>):R2Configuration|undefined{
 if(env.R2_ENABLED!=='1'||env.VERCEL!==undefined)return undefined;const accountId=env.R2_ACCOUNT_ID,bucket=env.R2_BUCKET,accessKeyId=env.R2_ACCESS_KEY_ID,secretAccessKey=env.R2_SECRET_ACCESS_KEY,auditToken=env.R2_AUDIT_API_TOKEN;
 const managed=managedProfileSelected(env),profile=managed?readManagedDeployment(env):undefined;
 if(managed&&!profile)return undefined;
 const allowedBucket=profile?new RegExp(`^vtv-web-${profile.profile}-[a-z0-9-]{3,40}$`):/^vtv-web-dev-[a-z0-9-]{3,40}$/;
 if(!accountId||!/^[a-f0-9]{32}$/.test(accountId)||env.R2_APPROVED_ACCOUNT!==accountId||!bucket||!allowedBucket.test(bucket)||env.R2_APPROVED_BUCKET!==bucket||!accessKeyId||!/^[a-f0-9]{32}$/.test(accessKeyId)||!secretAccessKey||!/^[a-f0-9]{64}$/.test(secretAccessKey)||!auditToken||!/^[A-Za-z0-9_-]{20,200}$/.test(auditToken))return undefined;
 return {accountId,bucket,accessKeyId,secretAccessKey,auditToken};
}
export function r2SafetyAudit(config:R2Configuration,fetcher:typeof fetch=fetch){return async()=>{
 async function get(suffix:string){const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucket}/${suffix}`,{headers:{authorization:'Bearer '+config.auditToken},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const body=await response.json();if(body.success!==true||body.errors?.length)throw Error();return body.result;}
 // Read only: never change a domain, lock, DNS entry or bucket configuration.
 const managed=await get('domains/managed'),custom=await get('domains/custom'),lock=await get('lock');
 if(managed.enabled!==false||!Array.isArray(custom.domains)||custom.domains.some((d:{enabled:unknown})=>d.enabled!==false)||!Array.isArray(lock.rules)||!lock.rules.some((r:{enabled:unknown;prefix:unknown;condition?:{type:unknown}})=>r.enabled===true&&(r.prefix===undefined||r.prefix===''||r.prefix==='companies/')&&r.condition?.type==='Indefinite'))throw Error('Private locked R2 bucket required');
};}
function etag(value:unknown){if(typeof value!=='string'||!/^"[a-f0-9]{32}"$/.test(value))throw Error('Unsupported R2 object receipt');return value;}
// R2 has no S3 VersionId. Receipt is explicitly a SHA/ETag content identity,
// protected by conditional creation plus audited indefinite prefix bucket lock.
// This adapter does not pretend to provide native S3 version history.
export function r2OriginalStore(config:R2Configuration,client=new S3Client({endpoint:`https://${config.accountId}.r2.cloudflarestorage.com`,region:'auto',credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'}),audit=r2SafetyAudit(config)):PrivateOriginalStore&PrivateAssetStore&{listKeys():Promise<string[]>}{
 return {
  async put(input){const m=uploadMetadata(input);try{
   await audit();
   try{const result=await client.send(new PutObjectCommand({Bucket:config.bucket,Key:m.key,Body:input.bytes,ContentLength:m.byteSize,ContentType:input.mime,Metadata:{sha256:m.sha256},IfNoneMatch:'*'}),{abortSignal:AbortSignal.timeout(30000)});etag(result.ETag);}catch(e){if(!(e instanceof Error)||e.name!=='PreconditionFailed')throw e;const head=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:m.key}),{abortSignal:AbortSignal.timeout(15000)});if(head.ContentLength!==m.byteSize||head.Metadata?.sha256!==m.sha256)throw Error();etag(head.ETag);}
   return {...m,version:m.sha256};
  }catch{throw new ApiError(503,'UNAVAILABLE','Private R2 original upload was not confirmed.');}},
  async read(original:StoredOriginal){checkOriginal(original);try{
   await audit();let tag:string;
   if(original.version===original.sha256){const head=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:original.key}),{abortSignal:AbortSignal.timeout(15000)});if(head.ContentLength!==original.byteSize||head.Metadata?.sha256!==original.sha256)throw Error();tag=etag(head.ETag);}
   else{const match=original.version.match(/^r2-sha256:([a-f0-9]{64}):etag:([a-f0-9]{32})$/);if(!match||match[1]!==original.sha256)throw Error();tag='"'+match[2]+'"';}
   const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:original.key,IfMatch:tag}),{abortSignal:AbortSignal.timeout(20000)});
   if(!result.Body||etag(result.ETag)!==tag||result.ContentLength!==original.byteSize||result.Metadata?.sha256!==original.sha256)throw Error();
   const chunks:Buffer[]=[];let size=0;const body=result.Body as AsyncIterable<Uint8Array>&{destroy?:()=>void};try{for await(const part of body){size+=part.length;if(size>original.byteSize)throw Error();chunks.push(Buffer.from(part));}}catch(e){body.destroy?.();throw e;}
   const bytes=Buffer.concat(chunks);if(bytes.length!==original.byteSize||createHash('sha256').update(bytes).digest('hex')!==original.sha256)throw Error();return bytes;
  }catch{throw new ApiError(503,'UNAVAILABLE','Private R2 original integrity could not be verified.');}},
  async putAsset(input){
   const m=supplierLogoMetadata(input);try{
    await audit();
    try{const result=await client.send(new PutObjectCommand({Bucket:config.bucket,Key:m.key,Body:input.bytes,ContentLength:m.byteSize,ContentType:m.mime,Metadata:{sha256:m.sha256},IfNoneMatch:'*'}),{abortSignal:AbortSignal.timeout(30000)});etag(result.ETag);}
    catch(e){if(!(e instanceof Error)||e.name!=='PreconditionFailed')throw e;const head=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:m.key}),{abortSignal:AbortSignal.timeout(15000)});if(head.ContentLength!==m.byteSize||head.Metadata?.sha256!==m.sha256||head.ContentType!==m.mime)throw Error();etag(head.ETag);}
    const asset={...m,version:m.sha256};checkPrivateAsset(asset);return asset;
   }catch{throw new ApiError(503,'UNAVAILABLE','Private R2 supplier image upload was not confirmed.');}},
  async readAsset(asset:StoredPrivateAsset){checkPrivateAsset(asset);try{
   await audit();let tag:string;
   if(asset.version===asset.sha256){const head=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:asset.key}),{abortSignal:AbortSignal.timeout(15000)});if(head.ContentLength!==asset.byteSize||head.Metadata?.sha256!==asset.sha256||head.ContentType!==asset.mime)throw Error();tag=etag(head.ETag);}
   else{const match=asset.version.match(/^r2-sha256:([a-f0-9]{64}):etag:([a-f0-9]{32})$/);if(!match||match[1]!==asset.sha256)throw Error();tag='"'+match[2]+'"';}
   const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:asset.key,IfMatch:tag}),{abortSignal:AbortSignal.timeout(20000)});
   if(!result.Body||etag(result.ETag)!==tag||result.ContentLength!==asset.byteSize||result.Metadata?.sha256!==asset.sha256||result.ContentType!==asset.mime)throw Error();
   const chunks:Buffer[]=[];let size=0;const body=result.Body as AsyncIterable<Uint8Array>&{destroy?:()=>void};try{for await(const part of body){size+=part.length;if(size>asset.byteSize)throw Error();chunks.push(Buffer.from(part));}}catch(e){body.destroy?.();throw e;}
   const bytes=Buffer.concat(chunks);if(size!==asset.byteSize||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error();return bytes;
  }catch{throw new ApiError(503,'UNAVAILABLE','Private R2 supplier image integrity could not be verified.');}},
  async listKeys(){try{
   await audit();const keys:string[]=[];let token:string|undefined;
   do{
    const result=await client.send(new ListObjectsV2Command({Bucket:config.bucket,Prefix:'companies/',ContinuationToken:token,MaxKeys:1000}),{abortSignal:AbortSignal.timeout(20000)});
    for(const object of result.Contents??[]){if(typeof object.Key!=='string')throw Error();if(/^companies\/[a-f0-9-]{36}\/documents\/[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(object.Key)){keys.push(object.Key);if(keys.length>100000)throw Error();}else if(!/^companies\/[a-f0-9-]{36}\/suppliers\/[a-f0-9-]{36}\/logos\/[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(object.Key))throw Error();}
    if(result.IsTruncated){if(!result.NextContinuationToken||result.NextContinuationToken===token)throw Error();token=result.NextContinuationToken;}else token=undefined;
   }while(token);
   return keys.sort();
  }catch{throw new ApiError(503,'UNAVAILABLE','Private R2 object inventory could not be verified.');}}
 };
}
