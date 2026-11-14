// Synthetic local crash-drill process, NOT a production worker entrypoint.
const s=require('../saas-services.cjs');
async function main(){const client=new s.Client(s.connection('vtv_saas_operator'));await client.connect();await client.query('SET SESSION AUTHORIZATION vtv_saas_document_worker');const store=s.loadSource('lib/server/saas/worker-store').documentWorkerStore(client,s.configuration().installationId),lease=await store.claim('inspect');if(!lease)throw Error();process.send({lease});setInterval(()=>{},1000);}
main().catch(()=>{process.send?.({error:'Synthetic lease process failed'});process.exitCode=1;process.exit(1);});
