// Read-only review packaging. Never connects to PostgreSQL or executes SQL.
const fs=require('node:fs'),crypto=require('node:crypto');
const files=['043_platform_administration.review.sql','043_platform_administration.initial-admin.review.sql','043_platform_administration.rollback.review.sql'];
const migrations=files.map(name=>{const file='database/migrations/saas/'+name;return {file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),approved:false,executedOnLiveDevelopment:false};});
const source=fs.readFileSync('lib/server/platform-admin.ts','utf8'),pin=source.match(/platformSchemaSha256='([a-f0-9]{64})'/)?.[1];
if(pin!==migrations[0].sha256)throw Error('The runtime activation pin differs from the review candidate.');
const report={scope:'local application only; no VPS operations',migrations,automaticExecution:false,requires:['explicit approval of migration filename and SHA-256','private pre-change database backup and verified restore','separate approval naming the existing verified initial administrator UUID','post-approval authenticated Next.js MFA acceptance'],rollback:'Disable the feature, roll back application files, retain schema and immutable financial/audit records; optional separately approved function-privilege containment SQL.'};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--write')){fs.mkdirSync('.deployment-review',{recursive:true});fs.writeFileSync('.deployment-review/platform-admin-migration-review.json',JSON.stringify(report,null,2));}
