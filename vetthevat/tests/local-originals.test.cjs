const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {localPrivateOriginals,copyLegacyLocalOriginals}=require('./load-source.cjs').loadSource('lib/server/saas/local-originals');
const env={SAAS_LOCAL_ORIGINALS_ENABLED:'1',SAAS_LOCAL_ORIGINALS_APPROVED:'vtv_saas_dev',WEB_AUTH_ENV:'test',WEB_AUTH_ORIGIN:'https://localhost:3444',SAAS_DATABASE_APPROVED:'vtv_saas_dev'};
function setup(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-originals-')),workspace=path.join(base,'workspace'),storage=path.join(base,'private');fs.mkdirSync(workspace);return {base,workspace,storage,configured:{...env,SAAS_LOCAL_ORIGINALS_DIR:storage}};}
function pdf(){return Buffer.from('%PDF-1.4\nlocal synthetic invoice\n%%EOF');}

test('local originals require explicit isolated approval and an absolute external storage path',()=>{
 const {base,workspace,storage,configured}=setup();
 try{
  for(const override of [{SAAS_LOCAL_ORIGINALS_ENABLED:'0'},{WEB_AUTH_ENV:'production'},{WEB_AUTH_ORIGIN:'https://example.com'},{VERCEL:'1'},{SAAS_LOCAL_ORIGINALS_APPROVED:''}])assert.equal(localPrivateOriginals({...configured,...override},workspace),undefined);
  assert.throws(()=>localPrivateOriginals({...configured,SAAS_LOCAL_ORIGINALS_DIR:'relative-private'},workspace),{status:503});
  assert.throws(()=>localPrivateOriginals({...configured,SAAS_LOCAL_ORIGINALS_DIR:path.join(workspace,'private')},workspace),{status:503});
  assert.equal(fs.existsSync(storage),false);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('local originals use atomic immutable writes and verify contents without a public URL',async()=>{
 const {base,workspace,storage,configured}=setup();
 try{
  const store=localPrivateOriginals(configured,workspace),input={companyId:crypto.randomUUID(),documentId:crypto.randomUUID(),mime:'application/pdf',bytes:pdf()},receipt=await store.put(input);
  assert.deepEqual(await store.put(input),receipt);assert.deepEqual(await store.read(receipt),input.bytes);
  assert.deepEqual(fs.readdirSync(storage),[crypto.createHash('sha256').update(receipt.key).digest('hex')+'.original']);
  await assert.rejects(()=>store.read({...receipt,version:'untrusted-version'}),{status:503});
  await assert.rejects(()=>store.read({...receipt,key:'../../public/document.pdf'}),{status:503});
  const file=path.join(storage,fs.readdirSync(storage)[0]);fs.writeFileSync(file,'tampered');
  await assert.rejects(()=>store.read(receipt),{status:503});await assert.rejects(()=>store.put(input),{status:503});
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('local originals reject symlink escapes and recover stale atomic-write remnants',async t=>{
 const {base,workspace,storage,configured}=setup();
 try{
  const store=localPrivateOriginals(configured,workspace),temporary=path.join(storage,`.upload-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary,'incomplete');fs.utimesSync(temporary,new Date(0),new Date(0));
  localPrivateOriginals(configured,workspace);assert.equal(fs.existsSync(temporary),false);
  const input={companyId:crypto.randomUUID(),documentId:crypto.randomUUID(),mime:'application/pdf',bytes:pdf()},receipt=await store.put(input),name=crypto.createHash('sha256').update(receipt.key).digest('hex')+'.original';
  fs.unlinkSync(path.join(storage,name));const outside=path.join(base,'outside.original');fs.writeFileSync(outside,pdf());
  try{fs.symlinkSync(outside,path.join(storage,name));}catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('Symlink creation is not permitted on this host.');return;}throw error;}
  await assert.rejects(()=>store.read(receipt),{status:503});
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('legacy storage copy is checksum-verified, repeatable and never deletes source files',()=>{
 const {base,workspace,storage}=setup(),legacy=path.join(workspace,'.local-private-originals');
 try{
  fs.mkdirSync(legacy);const content=pdf(),name=crypto.createHash('sha256').update('legacy-key').digest('hex')+'.original';fs.writeFileSync(path.join(legacy,name),content);
  assert.deepEqual(copyLegacyLocalOriginals(legacy,storage,workspace),{copied:1,alreadyPresent:0,total:1});
  assert.deepEqual(copyLegacyLocalOriginals(legacy,storage,workspace),{copied:0,alreadyPresent:1,total:1});
  assert.deepEqual(fs.readFileSync(path.join(storage,name)),content);assert.deepEqual(fs.readFileSync(path.join(legacy,name)),content);
  fs.writeFileSync(path.join(legacy,'unexpected'),'not an object');
  assert.throws(()=>copyLegacyLocalOriginals(legacy,storage,workspace),{status:400});
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
