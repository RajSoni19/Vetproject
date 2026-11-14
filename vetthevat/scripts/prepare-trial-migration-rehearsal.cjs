// Produce fixed-target rehearsal copies; the production/development-reviewed
// migration and rollback remain byte-for-byte unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),migrations=path.join(root,'database/migrations/saas');
const target='D:/vetthevat/.trial-029-rehearsal/cluster';
const pairs=[
 ['029_automatic_14_day_trial.review.sql','029_automatic_14_day_trial.rehearsal.review.sql'],
 ['029_automatic_14_day_trial.rollback.review.sql','029_automatic_14_day_trial.rollback.rehearsal.review.sql']
];
for(const [sourceName,targetName] of pairs){
 let sql=fs.readFileSync(path.join(migrations,sourceName),'utf8');
 if(!sql.includes("inet_server_port()<>55440")||!sql.includes("D:/vetthevat.saas-dev/cluster"))throw Error(`Unexpected target guard in ${sourceName}`);
 sql=sql.replace(/^-- REVIEW ONLY\./m,'-- REHEARSAL ONLY. Disposable cluster target: 127.0.0.1:55441/vtv_saas_dev.')
  .replaceAll('inet_server_port()<>55440','inet_server_port()<>55441')
  .replaceAll('D:/vetthevat.saas-dev/cluster',target);
 if(sql.includes('55440')||sql.includes('D:/vetthevat.saas-dev/cluster'))throw Error(`Unreplaced target guard in ${sourceName}`);
 const file=path.join(migrations,targetName);
 fs.writeFileSync(file,sql,{flag:'wx'});
 console.log(JSON.stringify({file:path.relative(root,file),sha256:crypto.createHash('sha256').update(sql).digest('hex'),source:sourceName}));
}
