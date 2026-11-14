// Real approved local PostgreSQL + authenticated TLS loopback SMTP only.
const s=require('./saas-services.cjs'),{localSmtp}=require('./fixtures/local-smtp.cjs');
async function run(){
 const db=new s.Client(s.connection('vtv_saas_operator')),locks=new s.Client(s.connection('vtv_saas_operator')),smtp=await localSmtp(),results=[];await db.connect();await locks.connect();
 try{
 const target=(await db.query('SELECT current_database() AS db,inet_server_port() AS port')).rows[0];s.assert.deepEqual(target,{db:'vtv_saas_dev',port:55440});
 // Hold historical jobs untouched, so the worker can claim only this fixture.
 await locks.query('BEGIN');await locks.query('SELECT id FROM contact_intake.notification_outbox FOR UPDATE');
 const payload={fullName:'Synthetic Contact',businessName:'Example Test',email:'test@example.test',category:'Other',message:'Please help with a synthetic question.',consent:true},enquiry=(await db.query('INSERT INTO contact_intake.enquiries(installation_id,payload,duplicate_hash) SELECT installation_id,$1::jsonb,$2 FROM saas.schema_version WHERE version=1 RETURNING id',[JSON.stringify(payload),s.crypto.randomBytes(32).toString('hex')])).rows[0];
 const id=(await db.query('INSERT INTO contact_intake.notification_outbox(enquiry_id) VALUES($1) RETURNING id',[enquiry.id])).rows[0].id;
 await db.query('SET SESSION AUTHORIZATION vtv_contact_worker');
 await s.assert.rejects(db.query('SELECT * FROM contact_intake.enquiries'),{code:'42501'});results.push('worker raw-table access denied');
 const store={claim:async()=>(await db.query('SELECT contact_intake.claim_notice() AS job')).rows[0].job,finish:async(job,provider,failed)=>(await db.query('SELECT contact_intake.finish_notice($1,$2,$3,$4) AS ok',[job.id,job.lease,provider,failed])).rows[0].ok};
 const first=await store.claim();s.assert.equal(first.id,id);s.assert.equal(await store.claim(),null);s.assert.equal(await store.finish({...first,lease:s.crypto.randomUUID()},null,true),false);results.push('leased claim excludes concurrent claim and rejects stale lease');
 const {processContactNotice}=s.loadSource('lib/server/contact-notifications');s.assert.equal((await processContactNotice({...store,claim:async()=>first},smtp.mailer,'sink@example.test',new AbortController().signal)).state,'accepted');s.assert.equal(smtp.messages.length,1);s.assert.equal(smtp.messages[0].to,'sink@example.test');s.assert.equal(await store.finish(first,'duplicate',false),false);results.push('real Nodemailer TLS SMTP acceptance acknowledged once');
 await db.query('RESET SESSION AUTHORIZATION');const row=(await db.query('SELECT state,attempts,lease_id FROM contact_intake.notification_outbox WHERE id=$1',[id])).rows[0];s.assert.deepEqual(row,{state:'accepted',attempts:1,lease_id:null});results.push('durable accepted receipt clears lease');
 s.fs.mkdirSync('.launch-acceptance',{recursive:true});s.fs.writeFileSync('.launch-acceptance/contact-worker-postgres.json',JSON.stringify({at:new Date().toISOString(),target:'127.0.0.1:55440/vtv_saas_dev',identity:'operator SET SESSION AUTHORIZATION; not credential acceptance',smtp:'authenticated loopback TLS; not production delivery',results},null,2));results.forEach(x=>console.log('REAL PASS '+x));
 }finally{await locks.query('ROLLBACK');await locks.end();await db.end();await smtp.close();}
}
run().catch(e=>{console.error('Contact worker acceptance failed: '+(e.code||e.message));process.exitCode=1;});
