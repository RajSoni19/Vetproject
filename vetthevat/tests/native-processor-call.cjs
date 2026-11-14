// Local synthetic-file bridge only; no credentials, database or global job claims.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
async function main(){
 const [socket,route,file,mime]=process.argv.slice(2),root=path.resolve(__dirname,'../docs/test-results');
 if(process.platform!=='linux'||!/^\/run\/user\/\d+\/vtv-document-worker\/processing\.sock$/.test(socket)||!['/inspect','/ocr'].includes(route)||!['application/pdf','image/png'].includes(mime)||path.dirname(fs.realpathSync(file))!==root)throw Error('Synthetic bridge scope required');
 const bytes=fs.readFileSync(file);
 const result=await new Promise((resolve,reject)=>{const request=http.request({socketPath:socket,path:route,method:'POST',headers:{'content-type':mime,'content-length':bytes.length},signal:AbortSignal.timeout(70000)},response=>{let raw='';response.setEncoding('utf8');response.on('data',s=>{raw+=s;if(raw.length>1100000)request.destroy(Error('Output bound'));});response.on('end',()=>{try{if(response.statusCode!==200)throw Error('Processing refused');resolve(JSON.parse(raw));}catch(e){reject(e);}});});request.on('error',reject);request.end(bytes);});
 console.log(JSON.stringify(result));
}
main().catch(()=>{console.error('Synthetic native processor request failed');process.exitCode=1;});
