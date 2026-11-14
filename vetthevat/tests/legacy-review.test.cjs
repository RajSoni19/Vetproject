const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const demo=loadSource('tests/fixtures/legacy-workspace'),{restoreWorkspace}=loadSource('lib/workspace');
const {prepareLegacyDeletion,restoreLegacySelection}=loadSource('lib/legacy-review');
const {legacyRecordReview}=loadSource('lib/workspace-bootstrap');
function sample(){const result=restoreWorkspace(JSON.stringify({invoices:[demo.invoices[0]],documents:demo.documents.filter(row=>row.id===demo.invoices[0].documentId)}),{...demo,selectedCompanyId:demo.companies[0].id,settings:{}});result.invoices[0]={...result.invoices[0],notes:'Synthetic genuine edit'};return result;}
test('legacy deletion requires explicit valid selection and protects links and companies',()=>{
 const state=sample(),review=legacyRecordReview(state),invoice=review.find(r=>r.kind==='invoices'),document=review.find(r=>r.kind==='documents');
 assert.throws(()=>prepareLegacyDeletion(state,[]));assert.throws(()=>prepareLegacyDeletion(state,[{kind:'invoices',id:'genuine-created-record'}]));assert.throws(()=>prepareLegacyDeletion(state,[invoice,invoice]));
 assert.throws(()=>prepareLegacyDeletion(state,[review.find(r=>r.kind==='companies')]));assert.throws(()=>prepareLegacyDeletion(state,[invoice]));assert.throws(()=>prepareLegacyDeletion(state,[document]));
 const raw=JSON.stringify(state),next=prepareLegacyDeletion(state,[invoice,document]);assert.equal(next.invoices.length,0);assert.equal(JSON.stringify(state),raw);assert.equal(next.suppliers.length,state.suppliers.length);
 const duplicate=sample();duplicate.invoices.push({...duplicate.invoices[0],notes:'A different record with the same identity'});assert.throws(()=>prepareLegacyDeletion(duplicate,[invoice,document]),/Duplicate or missing/);
});
test('recovery merges selected rows, preserves newer records and refuses overwriting identities',()=>{
 const state=sample(),selected=legacyRecordReview(state).filter(r=>r.kind==='invoices'||r.kind==='documents'),next=prepareLegacyDeletion(state,selected);
 const genuine={...state.invoices[0],id:'synthetic-new-id',documentId:'',notes:'Newer user record'};next.invoices=[genuine];
 const restored=restoreLegacySelection(next,state,selected);assert.ok(restored.invoices.includes(genuine));assert.equal(restored.invoices.find(r=>r.id===state.invoices[0].id).notes,'Synthetic genuine edit');
 assert.throws(()=>restoreLegacySelection(restored,state,selected),/already exists/);
});
test('pending recovery dependencies and explicit restorations survive read-only reload',()=>{
 const state=sample(),selected=legacyRecordReview(state).filter(r=>r.kind==='invoices'||r.kind==='documents'),next=prepareLegacyDeletion(state,selected);
 next.legacyReviewBackups=[{key:'synthetic-key',at:'2026-10-20',count:2,companyIds:state.companies.map(r=>r.id),protectedIds:[...state.invoices,...state.documents,...state.suppliers].map(r=>r.id)}];
 const reloaded=restoreWorkspace(JSON.stringify(next),next);assert.equal(reloaded.suppliers.length,state.suppliers.length);
 const restored=restoreLegacySelection(reloaded,state,selected);assert.equal(restored.invoices.length,1);
});
