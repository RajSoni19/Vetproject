const http=require('node:http');
function localEntry(build){return http.createServer((request,response)=>{
 const headers={'cache-control':'no-store','x-vetthevat-local-build':build};
 if(!['localhost:3000','127.0.0.1:3000'].includes(request.headers.host)||!['GET','HEAD'].includes(request.method)){response.writeHead(405,headers);response.end();return;}
 try{const target=new URL(request.url,'https://localhost:3444');if(target.origin!=='https://localhost:3444'||!request.url.startsWith('/')||request.url.startsWith('//'))throw Error();response.writeHead(307,{...headers,location:target.href});response.end();}
 catch{response.writeHead(400,headers);response.end();}
});}
module.exports={localEntry};
