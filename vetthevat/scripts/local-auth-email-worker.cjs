// Local-only polling bridge for the authenticated web-auth notification route.
// SMTP secrets remain in the application process; only the bearer secret is
// used by this loopback TLS request. It never follows email links or logs data.
const https=require('node:https'),s=require('./saas-dev-common.cjs');
function start(){
 const secret=process.env.WEB_AUTH_WORKER_SECRET;if(!secret||secret.length<32)throw Error('A private auth notification worker secret is required.');
 const ca=s.fs.readFileSync(s.path.join(s.directory,'localhost.crt'));let stopped=false,timer;
 function poll(){if(stopped)return;const request=https.request({hostname:'127.0.0.1',port:3444,servername:'localhost',ca,method:'POST',path:'/api/internal/auth-notifications',headers:{host:'localhost:3444',authorization:`Bearer ${secret}`,'content-length':'0'},timeout:12000},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>{if(response.statusCode===200){try{const result=JSON.parse(body);if(result.state==='accepted')console.log('Account email accepted by configured SMTP.');}catch{}}schedule();});});request.on('timeout',()=>request.destroy());request.on('error',()=>schedule());request.end();}
 function schedule(){if(!stopped)timer=setTimeout(poll,10000);}
 poll();return()=>{stopped=true;clearTimeout(timer);};
}
module.exports={start};
