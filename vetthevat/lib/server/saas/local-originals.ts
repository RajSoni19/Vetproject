import {localUat} from "@/lib/server/local-uat";
import {createHash,randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {closeSync,copyFileSync,fchmodSync,fsyncSync,fstatSync,linkSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,renameSync,statSync,unlinkSync,writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from "node:path";
import {managedProfileSelected} from "@/lib/server/deployment-profile";
import {ApiError} from "@/lib/server/api-v1";
import {checkOriginal,checkPrivateAsset,supplierLogoMetadata,uploadMetadata,type PrivateAssetStore,type PrivateOriginalStore,type StoredOriginal,type StoredPrivateAsset,type SupplierLogoMime} from "@/lib/server/saas/object-storage";

const temporaryName=/^\.upload-[a-f0-9-]{36}\.tmp$/;
export type LocalPrivateOriginalStore=PrivateOriginalStore&PrivateAssetStore&{has(original:StoredOriginal):Promise<boolean>};
const rootName=(env:Readonly<Record<string,string|undefined>>)=>{
  const configured=env.SAAS_LOCAL_ORIGINALS_DIR;
  if(configured)return configured;
  const dataRoot=process.platform==="win32"
    ?env.LOCALAPPDATA||join(homedir(),"AppData","Local")
    :env.XDG_DATA_HOME||join(homedir(),".local","share");
  return join(dataRoot,"VetTheVat","private-originals");
};
function isWithin(parent:string,child:string){
  const rel=relative(parent,child);
  return rel===""||rel!==".."&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel);
}
function samePath(left:string,right:string){return process.platform==="win32"?left.toLowerCase()===right.toLowerCase():left===right;}
function privateRoot(env:Readonly<Record<string,string|undefined>>,workspace:string){
  const configured=rootName(env);
  if(!isAbsolute(configured))throw new ApiError(503,"UNAVAILABLE","Private storage must be configured with an absolute directory.");
  const base=resolve(workspace),root=resolve(/*turbopackIgnore: true*/configured);
  if(isWithin(base,root))throw new ApiError(503,"UNAVAILABLE","Private storage must be outside the application workspace.");
  mkdirSync(root,{recursive:true,mode:0o700});
  const info=lstatSync(root);
  if(!info.isDirectory()||info.isSymbolicLink()||!samePath(resolve(realpathSync(/*turbopackIgnore: true*/root)),root))throw new ApiError(503,"UNAVAILABLE","Unsafe private storage directory.");
  return root;
}
function flushDirectory(root:string){
  if(process.platform==="win32")return;
  const fd=openSync(root,constants.O_RDONLY);
  try{fsyncSync(fd);}finally{closeSync(fd);}
}
function cleanStaleTemporaryFiles(root:string){
  const cutoff=Date.now()-24*60*60*1000;
  for(const name of readdirSync(root)){
    if(!temporaryName.test(name))continue;
    const path=join(root,name),info=lstatSync(path);
    if(info.isSymbolicLink()||!info.isFile())throw new ApiError(503,"UNAVAILABLE","Unsafe temporary object in private storage.");
    if(info.mtimeMs<cutoff)unlinkSync(path);
  }
}
function safeRead(root:string,key:string,extension:"original"|"asset"="original"){
  const name=createHash("sha256").update(key).digest("hex")+"."+extension,path=join(/*turbopackIgnore: true*/root,name);
  if(!samePath(dirname(path),root)||basename(path)!==name)throw new ApiError(503,"UNAVAILABLE","Unsafe private object identity.");
  const info=lstatSync(path);
  if(info.isSymbolicLink()||!info.isFile()||!samePath(resolve(realpathSync(/*turbopackIgnore: true*/path)),path))throw new ApiError(503,"UNAVAILABLE","Unsafe private object path.");
  const flags=constants.O_RDONLY|(constants.O_NOFOLLOW??0),fd=openSync(/*turbopackIgnore: true*/path,flags);
  try{
    if(!fstatSync(fd).isFile())throw new ApiError(503,"UNAVAILABLE","Private object is not a regular file.");
    return readFileSync(fd);
  }finally{closeSync(fd);}
}

// Local development storage only. The configured root is outside the source
// tree; files are private, immutable, atomically linked into place and never URL-addressable.
export function localPrivateOriginals(env:Readonly<Record<string,string|undefined>>,workspace:string):LocalPrivateOriginalStore|undefined{
  if(managedProfileSelected(env))return undefined;
  const uat=localUat(env);if(env.VTV_LOCAL_UAT_ENABLED==='1'&&!uat)return undefined;
  if(env.SAAS_LOCAL_ORIGINALS_ENABLED!=="1"||env.SAAS_LOCAL_ORIGINALS_APPROVED!==(uat?.database??"vtv_saas_dev")||env.VERCEL!==undefined||!["test","development"].includes(env.WEB_AUTH_ENV??"")||env.WEB_AUTH_ORIGIN!==(uat?.origin??"https://localhost:3444")||env.SAAS_DATABASE_APPROVED!==(uat?.database??"vtv_saas_dev"))return undefined;
  const root=privateRoot(env,workspace);
  cleanStaleTemporaryFiles(root);
  return filesystemOriginalStore(root);
}

// Shared immutable byte-store; callers own environment/path approval. No public URLs.
export function filesystemOriginalStore(root:string,options:{readOnly?:boolean;fileMode?:number}={}):LocalPrivateOriginalStore{
  const info=lstatSync(root);
  if(!info.isDirectory()||info.isSymbolicLink()||!samePath(resolve(realpathSync(root)),resolve(root)))throw new ApiError(503,"UNAVAILABLE","Unsafe private storage directory.");
  const read=(key:string,extension:"original"|"asset"="original")=>safeRead(root,key,extension);
  const write=async(key:string,extension:"original"|"asset",bytes:Uint8Array,sha256:string,byteSize:number)=>{
    if(options.readOnly)throw new ApiError(403,"FORBIDDEN","This storage identity has read-only access.");
    const path=join(/*turbopackIgnore: true*/root,createHash("sha256").update(key).digest("hex")+"."+extension),temporary=join(/*turbopackIgnore: true*/root,`.upload-${randomUUID()}.tmp`);
    let fd:number|undefined;
    try{
      fd=openSync(temporary,"wx",0o600);writeFileSync(fd,bytes);if(options.fileMode!==undefined)fchmodSync(fd,options.fileMode);fsyncSync(fd);closeSync(fd);fd=undefined;
      if(lstatSync(root).isSymbolicLink()||!samePath(resolve(realpathSync(/*turbopackIgnore: true*/root)),root))throw new ApiError(503,"UNAVAILABLE","Private storage directory changed during upload.");
      try{linkSync(temporary,path);}catch(error){
        const code=(error as NodeJS.ErrnoException).code;
        if(code==="EEXIST"){
          const existing=read(key,extension);
          if(existing.byteLength!==byteSize||createHash("sha256").update(existing).digest("hex")!==sha256)throw new ApiError(503,"UNAVAILABLE","Existing private object failed integrity verification.");
        }else if(code==="EPERM"||code==="EXDEV"||code==="ENOTSUP"){
          try{
            renameSync(temporary,path);
          }catch(renErr){
            if((renErr as NodeJS.ErrnoException).code==="EEXIST"){
              const existing=read(key,extension);
              if(existing.byteLength!==byteSize||createHash("sha256").update(existing).digest("hex")!==sha256)throw new ApiError(503,"UNAVAILABLE","Existing private object failed integrity verification.");
            }else{
              copyFileSync(temporary,path);
              try{unlinkSync(temporary);}catch(_){}
            }
          }
        }else{
          throw error;
        }
      }
      flushDirectory(root);const persisted=read(key,extension);
      if(persisted.byteLength!==byteSize||createHash("sha256").update(persisted).digest("hex")!==sha256)throw new ApiError(503,"UNAVAILABLE","Private object integrity verification failed.");
    }finally{
      if(fd!==undefined)closeSync(fd);
      try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    }
  };
  return {
    async has(original){
      checkOriginal(original);
      if(original.version!==original.sha256)throw new ApiError(503,"UNAVAILABLE","Private object version mismatch.");
      let bytes:Buffer;
      try{bytes=read(original.key);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}
      if(bytes.byteLength!==original.byteSize||createHash("sha256").update(bytes).digest("hex")!==original.sha256)throw new ApiError(503,"UNAVAILABLE","Private object integrity verification failed.");
      return true;
    },
    async put(input){
      const metadata=uploadMetadata(input);await write(metadata.key,"original",input.bytes,metadata.sha256,metadata.byteSize);return {...metadata,version:metadata.sha256};
    },
    async read(original){
      checkOriginal(original);
      if(original.version!==original.sha256)throw new ApiError(503,"UNAVAILABLE","Private object version mismatch.");
      const bytes=read(original.key);
      if(bytes.byteLength!==original.byteSize||createHash("sha256").update(bytes).digest("hex")!==original.sha256)throw new ApiError(503,"UNAVAILABLE","Private object integrity verification failed.");
      return bytes;
    },
    async putAsset(input){
      const metadata=supplierLogoMetadata(input);await write(metadata.key,"asset",input.bytes,metadata.sha256,metadata.byteSize);return {...metadata,version:metadata.sha256};
    },
    async readAsset(asset:StoredPrivateAsset){
      checkPrivateAsset(asset);if(asset.version!==asset.sha256)throw new ApiError(503,"UNAVAILABLE","Private asset version mismatch.");
      const bytes=read(asset.key,"asset");
      if(bytes.byteLength!==asset.byteSize||createHash("sha256").update(bytes).digest("hex")!==asset.sha256)throw new ApiError(503,"UNAVAILABLE","Private asset integrity verification failed.");
      return bytes;
    }
  };
}

export function copyLegacyLocalOriginals(sourceDirectory:string,destinationDirectory:string,workspace:string){
  const source=resolve(sourceDirectory),destination=resolve(destinationDirectory),base=resolve(workspace);
  if(!isAbsolute(sourceDirectory)||!isAbsolute(destinationDirectory)||isWithin(base,destination)||isWithin(source,destination)||isWithin(destination,source))throw new ApiError(400,"INVALID_REQUEST","Legacy storage copy requires absolute, separate source and destination directories, with the destination outside the workspace.");
  const sourceInfo=lstatSync(source);
  if(!sourceInfo.isDirectory()||sourceInfo.isSymbolicLink()||!samePath(resolve(realpathSync(source)),source))throw new ApiError(400,"INVALID_REQUEST","Legacy storage source is not a safe directory.");
  mkdirSync(destination,{recursive:true,mode:0o700});
  const destinationInfo=lstatSync(destination);
  if(!destinationInfo.isDirectory()||destinationInfo.isSymbolicLink()||!samePath(resolve(realpathSync(destination)),destination))throw new ApiError(400,"INVALID_REQUEST","Legacy storage destination is not a safe directory.");
  let copied=0,alreadyPresent=0;
  for(const name of readdirSync(source)){
    if(!/^[a-f0-9]{64}\.original$/.test(name))throw new ApiError(400,"INVALID_REQUEST","Legacy storage contains an unexpected filename.");
    const sourcePath=join(source,name),sourceStat=lstatSync(sourcePath);
    if(sourceStat.isSymbolicLink()||!sourceStat.isFile()||sourceStat.size<1||sourceStat.size>10*1024*1024)throw new ApiError(400,"INVALID_REQUEST","Legacy storage contains an unsafe object.");
    const bytes=readFileSync(sourcePath),digest=createHash("sha256").update(bytes).digest("hex");
    const destinationPath=join(destination,name),temporary=join(destination,`.upload-${randomUUID()}.tmp`);
    let fd:number|undefined;
    try{
      fd=openSync(temporary,"wx",0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;
      try{linkSync(temporary,destinationPath);copied++;}catch(error){
        const code=(error as NodeJS.ErrnoException).code;
        if(code==="EEXIST"){
          const existing=readFileSync(destinationPath);
          if(existing.byteLength!==bytes.byteLength||createHash("sha256").update(existing).digest("hex")!==digest)throw new ApiError(503,"UNAVAILABLE","Existing destination object failed integrity verification.");
          alreadyPresent++;
        }else if(code==="EPERM"||code==="EXDEV"||code==="ENOTSUP"){
          try{
            renameSync(temporary,destinationPath);copied++;
          }catch(renErr){
            if((renErr as NodeJS.ErrnoException).code==="EEXIST"){
              const existing=readFileSync(destinationPath);
              if(existing.byteLength!==bytes.byteLength||createHash("sha256").update(existing).digest("hex")!==digest)throw new ApiError(503,"UNAVAILABLE","Existing destination object failed integrity verification.");
              alreadyPresent++;
            }else{
              copyFileSync(temporary,destinationPath);copied++;
              try{unlinkSync(temporary);}catch(_){}
            }
          }
        }else{
          throw error;
        }
      }
      const verified=readFileSync(destinationPath);
      if(verified.byteLength!==bytes.byteLength||createHash("sha256").update(verified).digest("hex")!==digest)throw new ApiError(503,"UNAVAILABLE","Copied object failed integrity verification.");
    }finally{
      if(fd!==undefined)closeSync(fd);
      try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    }
  }
  flushDirectory(destination);
  return {copied,alreadyPresent,total:copied+alreadyPresent};
}
