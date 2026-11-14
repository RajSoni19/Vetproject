export async function workerLoop(operation:(signal:AbortSignal)=>Promise<{state:string}>,options:{signal:AbortSignal;delayMs:number;record:(state:string)=>void}){
 while(!options.signal.aborted){try{const result=await operation(options.signal);options.record(result.state);if(result.state==='disabled')throw Error('Worker configuration is disabled');}catch{options.record('error');if(options.signal.aborted)break;throw Error('Worker operation failed; lease recovery belongs to the durable store');}
  await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);options.signal.removeEventListener('abort',done);resolve();},timer=setTimeout(done,options.delayMs);options.signal.addEventListener('abort',done,{once:true});if(options.signal.aborted)done();});
 }
}
