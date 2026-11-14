// Post-build check: inspect actual served server/client artifacts, never caches
// or historical test/docs. No credentials or financial documents are opened.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const files=[...walk('.next/static'),...walk('.next/server')].filter(name=>/\.(?:js|html|json|rsc)$/.test(name));
const forbidden=['Demo Business Ltd','Demo Retail Group','Northbridge Office Supplies Ltd','Steel sheet','Synthetic Materials Ltd','Demo Login','Continue as Demo','Guest Login','orsFixtures','mockInvoiceProcessingService','demoDocumentStorageService','Save local preview preferences','synthetic-only-not-real','demo-stage1','verified-cookie','fixture-user'];
for(const file of files){const source=fs.readFileSync(file,'utf8');for(const marker of forbidden)assert.ok(!source.includes(marker),`${file} contains ${marker}`);}
for(const file of walk('.next/server').filter(file=>file.endsWith('.nft.json'))){const manifest=JSON.parse(fs.readFileSync(file,'utf8'));for(const entry of manifest.files??[])assert.ok(!entry.replace(/\\/g,'/').includes('/tests/fixtures/'),file+' traces a test fixture');}
console.log('PASS production cleanup artifacts: '+files.length+' served build artifacts inspected; no business fixture markers, demo entry points, subscription simulators or test fixture traces.');
