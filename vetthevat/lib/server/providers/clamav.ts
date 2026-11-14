import {createConnection} from "node:net";
import {ApiError} from "@/lib/server/api-v1";
import {maxDocumentBytes,validateDocumentSignature} from "@/lib/document-validation";
import type {InvoiceMime} from "@/lib/server/stage1/documents";
import type {TrustedInspectionPort} from "@/lib/server/saas/document-worker";
export type ClamConfiguration={host:'127.0.0.1';port:number;maxSignatureAgeMs:number;policy:string;socket?:string};
export function readClamConfiguration(env:Readonly<Record<string,string|undefined>>):ClamConfiguration|undefined{
 if(env.CLAMAV_ENABLED!=='1'||env.CLAMAV_ISOLATED_WORKER_APPROVED!=='1'||env.CLAMAV_HOST!=='127.0.0.1')return undefined;
 const port=Number(env.CLAMAV_PORT),age=Number(env.CLAMAV_MAX_SIGNATURE_AGE_HOURS),policy=env.CLAMAV_INSPECTION_POLICY;
 if(!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(age)||age<1||age>48||!policy||!/^[A-Za-z0-9._-]{1,100}$/.test(policy))return undefined;
 return {host:'127.0.0.1',port,maxSignatureAgeMs:age*3600000,policy};
}
export type ClamTransport=(frames:readonly Uint8Array[],signal:AbortSignal)=>Promise<string>;
export function clamTransport(config:ClamConfiguration,idleTimeoutMs=45000):ClamTransport{if(!Number.isSafeInteger(idleTimeoutMs)||idleTimeoutMs<1||idleTimeoutMs>45000)throw new ApiError(503,'UNAVAILABLE','Invalid scanner timeout.');return (frames,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted){reject(new Error('Scan cancelled'));return;}
 const socket=createConnection(config.socket?{path:config.socket}:{host:config.host,port:config.port}),parts:Buffer[]=[];let length=0,settled=false;
 const finish=(error?:Error,result?:string)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);socket.destroy();if(error)reject(error);else resolve(result!);};
 const abort=()=>finish(new Error('Scan cancelled'));signal.addEventListener('abort',abort,{once:true});socket.setTimeout(idleTimeoutMs,()=>finish(new Error('Scanner timeout')));socket.on('error',()=>finish(new Error('Scanner unavailable')));socket.on('end',()=>{if(!settled)finish(new Error('Incomplete scanner response'));});
 socket.on('data',part=>{const chunk=typeof part==='string'?Buffer.from(part):part;length+=chunk.length;if(length>4096){finish(new Error('Scanner output limit'));return;}parts.push(chunk);const bytes=Buffer.concat(parts);if(bytes.includes(0)){if(bytes.indexOf(0)!==bytes.length-1){finish(new Error('Invalid scanner response'));return;}finish(undefined,bytes.subarray(0,-1).toString('utf8'));}});
 socket.once('connect',()=>{let index=0;const write=()=>{while(index<frames.length){if(!socket.write(frames[index++])){socket.once('drain',write);return;}}};write();});
});}
export function scanFrames(bytes:Uint8Array){if(!bytes.length||bytes.length>maxDocumentBytes)throw new ApiError(400,'INVALID_REQUEST','Document size exceeds scan limits.');const frames:Uint8Array[]=[Buffer.from('zINSTREAM\0')];for(let at=0;at<bytes.length;at+=65536){const part=bytes.subarray(at,at+65536),size=Buffer.alloc(4);size.writeUInt32BE(part.length);frames.push(size,part);}frames.push(Buffer.alloc(4));return frames;}
export interface BoundedDecoder {inspect(bytes:Uint8Array,mime:InvoiceMime,signal:AbortSignal):Promise<{pages:number;maxPagePixels:number;decodedBytes:number}>;}
export function clamInspection(config:ClamConfiguration,decoder:BoundedDecoder|undefined,transport=clamTransport(config)):TrustedInspectionPort{
 if(!decoder)throw new ApiError(503,'UNAVAILABLE','Isolated bounded document decoder required.');
 return {async inspect(bytes,mime,signal){
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(45000)]);validateDocumentSignature(mime,bytes.length,bytes);deadline.throwIfAborted();
  const version=await transport([Buffer.from('zVERSION\0')],deadline),match=version.match(/^ClamAV ([0-9][A-Za-z0-9.+_-]*)\/(\d+)\/(.{10,100})$/);
  const updated=match?Date.parse(match[3]):NaN,age=Date.now()-updated;if(!match||!Number.isFinite(age)||age< -300000||age>config.maxSignatureAgeMs)throw new ApiError(503,'UNAVAILABLE','Scanner signatures are unavailable or stale.');
  const result=await transport(scanFrames(bytes),deadline);deadline.throwIfAborted();
  if(/^stream: [^\x00\r\n]{1,200} FOUND$/.test(result))return {verdict:'infected',engine:'ClamAV '+match[1]+'/'+match[2],policy:config.policy};
  if(result!=='stream: OK')throw new ApiError(503,'UNAVAILABLE','Scanner did not confirm inspection.');
  const decoded=await decoder!.inspect(bytes,mime,deadline);deadline.throwIfAborted();
  if(!Number.isInteger(decoded.pages)||decoded.pages<1||decoded.pages>20||!Number.isSafeInteger(decoded.maxPagePixels)||decoded.maxPagePixels<1||decoded.maxPagePixels>20000000||!Number.isSafeInteger(decoded.decodedBytes)||decoded.decodedBytes<1||decoded.decodedBytes>100000000)throw new ApiError(400,'INVALID_REQUEST','Document decoding limits exceeded.');
  return {verdict:'clean',engine:'ClamAV '+match[1]+'/'+match[2],policy:config.policy};
 }};
}
