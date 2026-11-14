const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {loadSource}=require('./load-source.cjs');
function sources(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(path.join(dir,entry.name)):/\.(tsx?|jsx?)$/.test(entry.name)?[path.join(dir,entry.name)]:[]);}
test('application has no test fixture imports, demo auth entry points, seed arrays or automatic cleanup',()=>{
 for(const filename of [...sources('app'),...sources('components'),...sources('lib')]){
  const source=fs.readFileSync(filename,'utf8');assert.doesNotMatch(source,/(?:from\s*["']|import\s*\(["']|require\s*\(["'])(?:@\/tests|[^"']*fixtures\/|@\/lib\/(?:demo-data|mock-data|ors\/fixtures))/,filename);
  assert.doesNotMatch(source,/Demo Login|Continue as Demo|Guest Login|Demo Business Ltd|initialInvoices|initialCompanies|removeUnchangedDemoData|loadWorkspaceWithoutDemo/,filename);
 }
 for(const old of ['lib/demo-data.ts','lib/mock-data.ts','lib/ors/fixtures.ts','lib/remove-demo-data.ts','components/subscription-preview-warning.tsx'])assert.equal(fs.existsSync(old),false,old);
});
test('ORS starts empty and a new instance cannot inherit previous in-memory data',()=>{
 const {emptyOrsWorkspace}=loadSource('lib/ors/workspace'),first=emptyOrsWorkspace();for(const rows of Object.values(first))assert.deepEqual(rows,[]);
 first.orders.push({id:'synthetic-user-row'});assert.deepEqual(emptyOrsWorkspace().orders,[]);
 assert.doesNotMatch(fs.readFileSync('components/ors-workspace.tsx','utf8'),/orsFixtures|requestMaterial|receiveOrder|supplier-test|Reset preview/);
});
test('billing page only presents verified-unavailable state and approved plan information',()=>{
 const source=fs.readFileSync('app/app/subscription/page.tsx','utf8');assert.match(source,/Account usage unavailable/);assert.match(source,/Billing history unavailable/);assert.doesNotMatch(source,/saveSubscriptionPreview|expiryPreview|previewInvoiceUsage|useAppState|<form/);
 const {subscriptionPlans}=loadSource('lib/plan-catalog');assert.deepEqual(Object.values(subscriptionPlans).map(p=>[p.monthlyPrice,p.invoices,p.companies,p.membersIncludingOwner]),[['9.00',30,2,2],['15.00',100,2,4],['25.00',300,3,6]]);
});
test('empty invoice reporting and dashboard calculations never invent financial figures',()=>{
 const {sumRecords,buildReport}=loadSource('lib/reporting'),{dashboardOverview}=loadSource('lib/dashboard-overview');assert.deepEqual(sumRecords([]),{count:0,net:0,vat:0,gross:0});
 const report=buildReport([],[],{id:'empty-company',name:'',currency:'GBP'});for(const key of ['rows','currencies','monthly','suppliers','statuses'])assert.deepEqual(report[key],[]);assert.deepEqual(dashboardOverview([]),{excludedCount:0,currencies:[]});
});
