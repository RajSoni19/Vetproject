import {createHash} from "node:crypto";
import {S3Client,GetBucketVersioningCommand,GetBucketAclCommand,GetBucketPolicyCommand,PutObjectCommand,HeadObjectCommand,GetObjectCommand} from "@aws-sdk/client-s3";
import {ApiError} from "@/lib/server/api-v1";
import {checkOriginal,checkPrivateAsset,supplierLogoMetadata,uploadMetadata,type PrivateAssetStore,type PrivateOriginalStore,type StoredOriginal,type StoredPrivateAsset} from "@/lib/server/saas/object-storage";
import type {PrivateS3Configuration} from "@/lib/server/saas/s3-config";

export function privateS3Store(config:PrivateS3Configuration,client=new S3Client({endpoint:config.endpoint,region:config.region,forcePathStyle:true,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:2})):PrivateOriginalStore&PrivateAssetStore {
  async function privateBucket(){
    const options={abortSignal:AbortSignal.timeout(10000)};
    const version=await client.send(new GetBucketVersioningCommand({Bucket:config.bucket}),options);
    if(version.Status!=="Enabled")throw Error();
    const acl=await client.send(new GetBucketAclCommand({Bucket:config.bucket}),options);
    if(!acl.Owner?.ID||!acl.Grants?.length||acl.Grants.some(g=>g.Grantee?.Type!=="CanonicalUser"||g.Grantee.ID!==acl.Owner?.ID))throw Error();
    // A bucket policy may grant access independently of ACLs. Refuse all policies
    // until a policy-specific review is implemented, including anonymous grants.
    try{await client.send(new GetBucketPolicyCommand({Bucket:config.bucket}),options);throw Error();}
    catch(error){if(!(error instanceof Error)||error.name!=="NoSuchBucketPolicy")throw error;}
  }
  return {
    async put(input){
      const m=uploadMetadata(input);
      try{
        await privateBucket();
        let version:string|undefined;
        try{
          const result=await client.send(new PutObjectCommand({Bucket:config.bucket,Key:m.key,Body:input.bytes,ContentLength:m.byteSize,ContentType:input.mime,ChecksumSHA256:Buffer.from(m.sha256,"hex").toString("base64"),Metadata:{sha256:m.sha256},IfNoneMatch:"*"}),{abortSignal:AbortSignal.timeout(30000)});
          version=result.VersionId;
        }catch(error){
          if(!(error instanceof Error)||error.name!=="PreconditionFailed")throw error;
          // Idempotent retry of this immutable server-generated key. HEAD alone
          // cannot authorize a download; the caller still needs its tenant row.
          const head=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:m.key}),{abortSignal:AbortSignal.timeout(10000)});
          if(head.ContentLength!==m.byteSize||head.Metadata?.sha256!==m.sha256)throw Error();version=head.VersionId;
        }
        const original={...m,version:version??""};checkOriginal(original);return original;
      }catch{throw new ApiError(503,"UNAVAILABLE","Private original storage is unavailable. Upload was not confirmed.");}
    },
    async read(original){
      checkOriginal(original);
      try{
        await privateBucket();
        const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:original.key,VersionId:original.version}),{abortSignal:AbortSignal.timeout(15000)});
        if(!result.Body||result.VersionId!==original.version||result.ContentLength!==original.byteSize||result.Metadata?.sha256!==original.sha256)throw Error();
        const chunks:Buffer[]=[];let size=0;
        const body=result.Body as AsyncIterable<Uint8Array>&{destroy?:()=>void};
        try{for await(const chunk of body){size+=chunk.length;if(size>original.byteSize)throw Error();chunks.push(Buffer.from(chunk));}}catch(error){body.destroy?.();throw error;}
        const bytes=Buffer.concat(chunks);
        if(size!==original.byteSize||createHash("sha256").update(bytes).digest("hex")!==original.sha256)throw Error();return bytes;
      }catch{throw new ApiError(503,"UNAVAILABLE","Private original could not be verified.");}
    },
    async putAsset(input){
      const m=supplierLogoMetadata(input);
      try{
        await privateBucket();
        let version:string|undefined;
        try{
          const result=await client.send(new PutObjectCommand({Bucket:config.bucket,Key:m.key,Body:input.bytes,ContentLength:m.byteSize,ContentType:m.mime,ChecksumSHA256:Buffer.from(m.sha256,"hex").toString("base64"),Metadata:{sha256:m.sha256},IfNoneMatch:"*"}),{abortSignal:AbortSignal.timeout(30000)});
          version=result.VersionId;
        }catch(error){
          if(!(error instanceof Error)||error.name!=="PreconditionFailed")throw error;
          const head=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:m.key}),{abortSignal:AbortSignal.timeout(10000)});
          if(head.ContentLength!==m.byteSize||head.Metadata?.sha256!==m.sha256||head.ContentType!==m.mime)throw Error();version=head.VersionId;
        }
        const asset={...m,version:version??""};checkPrivateAsset(asset);return asset;
      }catch{throw new ApiError(503,"UNAVAILABLE","Private supplier image storage is unavailable. Upload was not confirmed.");}
    },
    async readAsset(asset:StoredPrivateAsset){
      checkPrivateAsset(asset);
      try{
        await privateBucket();
        const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:asset.key,VersionId:asset.version}),{abortSignal:AbortSignal.timeout(15000)});
        if(!result.Body||result.VersionId!==asset.version||result.ContentLength!==asset.byteSize||result.Metadata?.sha256!==asset.sha256||result.ContentType!==asset.mime)throw Error();
        const chunks:Buffer[]=[];let size=0;const body=result.Body as AsyncIterable<Uint8Array>&{destroy?:()=>void};
        try{for await(const chunk of body){size+=chunk.length;if(size>asset.byteSize)throw Error();chunks.push(Buffer.from(chunk));}}catch(error){body.destroy?.();throw error;}
        const bytes=Buffer.concat(chunks);if(size!==asset.byteSize||createHash("sha256").update(bytes).digest("hex")!==asset.sha256)throw Error();return bytes;
      }catch{throw new ApiError(503,"UNAVAILABLE","Private supplier image could not be verified.");}
    }
  };
}
