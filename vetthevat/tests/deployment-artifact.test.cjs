const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const python=process.platform==='win32'?'python':'python3',hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(kind){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-archive-test-')),archive=path.join(root,'release.tar.gz');const script=`import io,tarfile,json,hashlib,sys
archive,kind=sys.argv[1:]
data=b'console.log("synthetic release")'
name='.env.local' if kind=='secret' else 'app/server.js'
digest=hashlib.sha256(data).hexdigest() if kind!='corrupt' else '0'*64
manifest=json.dumps({name:digest}).encode()
with tarfile.open(archive,'w:gz') as t:
 for filename,content in [(name,data),('checksums.json',manifest)]:
  entry=tarfile.TarInfo(filename);entry.size=len(content);t.addfile(entry,io.BytesIO(content))
 if kind=='symlink':
  entry=tarfile.TarInfo('app/link');entry.type=tarfile.SYMTYPE;entry.linkname='/etc/passwd';t.addfile(entry)
`;
const built=spawnSync(python,['-c',script,archive,kind],{encoding:'utf8',windowsHide:true});assert.equal(built.status,0,built.stderr);return {root,archive};}
test('release archive verification accepts authentic content but rejects secrets, symlinks and modified content before extraction',()=>{for(const kind of ['valid','secret','symlink','corrupt']){const f=fixture(kind);try{const target=path.join(f.root,'extracted'),result=spawnSync(python,['deploy/ubuntu/verify-archive.py',f.archive,target,hash(f.archive)],{encoding:'utf8',windowsHide:true});if(kind==='valid'){assert.equal(result.status,0,result.stderr);assert.ok(fs.existsSync(path.join(target,'app/server.js')));}else{assert.notEqual(result.status,0,kind);assert.equal(fs.existsSync(target),false,'rejected archive never reaches extraction');}}finally{fs.rmSync(f.root,{recursive:true,force:true});}}});
