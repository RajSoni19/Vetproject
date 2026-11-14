const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

test('camera capture retains reviewed pages unless the existing private upload path confirms success',()=>{
 const capture=fs.readFileSync('components/invoice-capture-upload.tsx','utf8'),workspace=fs.readFileSync('components/server-document-workspace.tsx','utf8');
 assert.match(capture,/onUpload:\(file:File,capturedAt:string\)=>Promise<boolean>/);
 assert.match(capture,/if\(success\)clear\(\)/);
 assert.match(workspace,/async function upload\(file:File,_capturedAt:string\):Promise<boolean>/);
 assert.match(workspace,/return true;/);
 assert.match(workspace,/return false;/);
 assert.match(workspace,/request\("\/api\/business\/documents","POST"/);
 assert.match(workspace,/setRoutingId\(result\.id\)/);
});

test('camera previews remain local and original-document retrieval stays inspection gated',()=>{
 const capture=fs.readFileSync('components/invoice-capture-upload.tsx','utf8'),workspace=fs.readFileSync('components/server-document-workspace.tsx','utf8');
 assert.match(capture,/URL\.createObjectURL\(file\)/);
 assert.match(capture,/URL\.revokeObjectURL/);
 assert.match(workspace,/if\(row\.state!=="clean"\)return/);
 assert.match(workspace,/row\.state==="clean"\?<><Button/);
});
