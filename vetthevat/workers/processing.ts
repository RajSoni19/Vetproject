// Runs as a separate sandboxed OS identity with NO database, R2, SMTP or Stripe
// secrets. ClamAV must be local via a protected Unix socket; no network listener.
import {createServer} from "node:http";
import {execFile} from "node:child_process";
import {mkdtemp,writeFile,readFile,readdir,rm,chmod,lstat,unlink,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {clamInspection,clamTransport} from "@/lib/server/providers/clamav";
import {validateDocumentSignature,maxDocumentBytes} from "@/lib/document-validation";
import {parseExtraction} from "@/lib/server/stage1/extraction";
import type {InvoiceMime} from "@/lib/server/stage1/documents";

const deadline=(signal:AbortSignal)=>AbortSignal.any([signal,AbortSignal.timeout(60000)]);
function command(file:string,args:string[],signal:AbortSignal){return new Promise<string>((resolve,reject)=>execFile(file,args,{signal,timeout:45000,maxBuffer:1100000,encoding:'utf8',env:{NODE_ENV:'production',PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:'/nonexistent',MAGICK_CONFIGURE_PATH:'/etc/vetthevat/processing-policy'},windowsHide:true},(error,stdout)=>error?reject(Error('Bounded processing command failed')):resolve(stdout)));}
export async function decodePages(bytes:Uint8Array,mime:InvoiceMime,directory:string,signal:AbortSignal){
 validateDocumentSignature(mime,bytes.length,bytes);const input=join(directory,'original');await writeFile(input,bytes,{mode:0o600});let expected=1,textByPage:string[]=[];
 if(mime==='application/pdf'){
  const info=await command('/usr/bin/pdfinfo',[input],signal);expected=Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);if(!Number.isInteger(expected)||expected<1||expected>20||/^Encrypted:\s+yes/m.test(info))throw Error('Unsupported PDF');
  const nativeText=await command('/usr/bin/pdftotext',['-layout','-enc','UTF-8',input,'-'],signal),nativePages=nativeText.split('\f');
  if(nativePages.at(-1)?.trim()==='')nativePages.pop();
  if(nativePages.length===expected&&nativePages.every(page=>page.length<=100000))textByPage=nativePages;
  // Decode every accepted page; scaling bounds the raster before allocation.
  await command('/usr/bin/pdftoppm',['-f','1','-l',String(expected),'-scale-to','2400','-png','-singlefile',input,join(directory,'page-1')],signal);
  if(expected>1){for(let page=2;page<=expected;page++)await command('/usr/bin/pdftoppm',['-f',String(page),'-l',String(page),'-scale-to','2400','-png','-singlefile',input,join(directory,'page-'+page)],signal);}
 }else{
  const size=await command('/usr/bin/identify',['-ping','-format','%w %h\n',input],signal),frames=size.trim().split('\n');if(frames.length!==1)throw Error('Multi-frame image rejected');const [width,height]=frames[0].split(' ').map(Number);if(!Number.isSafeInteger(width*height)||width<1||height<1||width*height>20000000)throw Error('Image pixel limit');
  await command('/usr/bin/convert',['-limit','memory','128MiB','-limit','map','256MiB',input,'-strip',join(directory,'page-1.png')],signal);
 }
 const files=(await readdir(directory)).filter(f=>/^page-\d+\.png$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)![0])-Number(b.match(/\d+/)![0]));if(files.length!==expected)throw Error('Incomplete decoding');let decodedBytes=0,maxPagePixels=0;
 for(const name of files){const data=await readFile(join(directory,name));if(data.length<24||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid decoded PNG');const pixels=data.readUInt32BE(16)*data.readUInt32BE(20);if(!Number.isSafeInteger(pixels)||pixels<1||pixels>20000000)throw Error('Decoded pixel limit');decodedBytes+=pixels*4;maxPagePixels=Math.max(maxPagePixels,pixels);if(decodedBytes>100000000)throw Error('Decoded memory limit');}
 return {files,pages:files.length,maxPagePixels,decodedBytes,textByPage};
}
async function processBytes(bytes:Uint8Array,mime:InvoiceMime,ocr:boolean,signal:AbortSignal){
  const directory=await mkdtemp(join(tmpdir(),'vtv-decode-'));
 try{let decoded:Awaited<ReturnType<typeof decodePages>>|undefined;const policy=process.env.CLAMAV_INSPECTION_POLICY??'',socket=process.env.CLAMAV_SOCKET??'';
  const local=process.env.VTV_DOCUMENT_WORKER_PROFILE==='local-wsl'&&process.env.VTV_DEPLOYMENT_PROFILE==='local';
  if(!(local&&policy==='vtv-local-bounded-v1'&&socket==='/run/clamav/clamd.ctl')&&!(!local&&/^vtv-bounded-v[0-9]+$/.test(policy)&&/^\/run\/vetthevat-clamav-(staging|production)\/clamd[.]sock$/.test(socket)))throw Error('Approved scanner policy/socket required');
  const scanner=await lstat(socket),groups=process.getgroups?.()??[],ownerAccess=(scanner.mode&0o600)===0o600&&scanner.uid===process.getuid?.(),groupAccess=(scanner.mode&0o060)===0o060&&groups.includes(scanner.gid);if(!scanner.isSocket()||(scanner.mode&0o007)!==0||(!ownerAccess&&!groupAccess))throw Error('Scanner socket must be protected from other local users');
  const config={host:'127.0.0.1' as const,port:3310,maxSignatureAgeMs:24*3600000,policy,socket};
  const receipt=await clamInspection(config,{inspect:async(b,m,s)=>{decoded=await decodePages(b,m,directory,s);return decoded;}},clamTransport(config)).inspect(bytes,mime,signal);
  if(!ocr)return receipt;if(receipt.verdict!=='clean'||!decoded)throw Error('Clean inspection required');const pages=[];
  for(let index=0;index<decoded.files.length;index++){
   const native=decoded.textByPage[index];
   if(native&&native.replace(/\s/g,'').length>=40){pages.push({text:native,confidence:null});continue;}
   const image=join(directory,decoded.files[index]),text=await command('/usr/bin/tesseract',[image,'stdout','-l','eng','--psm','3','-c','preserve_interword_spaces=1'],signal);
   if(text.length>100000)throw Error('OCR text limit');
   const preliminary=parseExtraction(text),needsLayout=preliminary.lines.length===0||preliminary.lines.some(line=>!line.description)||preliminary.warnings.some(warning=>warning.includes('descriptions and numeric rows do not reconcile'));
   if(!needsLayout){pages.push({text,confidence:null});continue;}
   const tsv=await command('/usr/bin/tesseract',[image,'stdout','-l','eng','--psm','3','-c','preserve_interword_spaces=1','tsv'],signal);
   const words: {text:string;left:number;top:number;width:number;height:number}[]=[];
   for(const row of tsv.split(/\r?\n/).slice(1)){
    const cells=row.split('\t');if(cells.length<12||cells[0]!=='5')continue;
    const [page,block,paragraph,line,word,left,top,width,height]=cells.slice(1,10).map(Number),value=cells[11]?.trim();
    if(!value||value.length>200||![page,block,paragraph,line,word,left,top,width,height].every(Number.isSafeInteger)||left<0||top<0||width<1||height<1)continue;
    if(words.length<2501)words.push({text:value,left,top,width,height});
   }
   pages.push({text,confidence:null,...(words.length<=2500&&words.length>0?{layout:{words}}:{})});
  }
  if(Buffer.byteLength(JSON.stringify(pages))>1000000)throw Error('OCR output limit');return {pages};
 }finally{await rm(directory,{recursive:true,force:true});}
}
async function main(){
 const uid=process.getuid?.()??0,local=process.env.VTV_DOCUMENT_WORKER_PROFILE==='local-wsl'&&process.env.VTV_DEPLOYMENT_PROFILE==='local';
 if(process.platform!=='linux'||uid===0||Object.keys(process.env).some(k=>/DATABASE_URL|PASSWORD|SECRET_KEY|OUTBOX_KEY|CSRF_SECRET/.test(k)))throw Error('Isolated secret-free non-root processing identity required');
 const socket=process.env.DOCUMENT_PROCESSING_SOCKET,localSocket=`/run/user/${uid}/vtv-document-worker/processing.sock`;if(!socket||!(local&&socket===localSocket||!local&&/^\/run\/vetthevat-(staging|production)\/processing\.sock$/.test(socket)))throw Error('Invalid socket');
 if(local){const directory=join('/run/user',String(uid),'vtv-document-worker');await mkdir(directory,{recursive:true,mode:0o700});const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==uid)throw Error('Unsafe local socket directory');await chmod(directory,0o700);}
 try{const old=await lstat(socket);if(!old.isSocket()||old.uid!==uid)throw Error('Refusing existing foreign socket');await unlink(socket);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 let busy=false;const server=createServer(async(req,res)=>{res.setHeader('cache-control','no-store');if(req.method==='GET'&&req.url==='/live'){res.end('{"live":true}');return;}if(req.method!=='POST'||!['/inspect','/ocr'].includes(req.url??'')){res.writeHead(404);res.end();return;}if(busy){res.writeHead(503);res.end();return;}busy=true;const abort=new AbortController();req.once('aborted',()=>abort.abort());try{const size=Number(req.headers['content-length']),mime=String(req.headers['content-type']) as InvoiceMime;if(!Number.isSafeInteger(size)||size<1||size>maxDocumentBytes||!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw Error('Invalid document');const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>size)throw Error('Upload limit');chunks.push(Buffer.from(part));}if(length!==size)throw Error('Incomplete document');const result=await processBytes(Buffer.concat(chunks),mime,req.url==='/ocr',deadline(abort.signal));res.setHeader('content-type','application/json');res.end(JSON.stringify(result));}catch{res.writeHead(422);res.end('{"error":"Document processing failed"}');}finally{busy=false;}});
 server.requestTimeout=65000;server.headersTimeout=10000;server.maxConnections=4;await new Promise<void>(resolve=>server.listen(socket,resolve));await chmod(socket,0o660);for(const sig of ['SIGTERM','SIGINT'])process.once(sig,()=>server.close(()=>process.exit(0)));
 console.log('Isolated processing socket ready; no document contents logged.');
}
if(require.main===module)main().catch(()=>{console.error('Isolated processing startup failed; configuration details redacted.');process.exitCode=1;});
