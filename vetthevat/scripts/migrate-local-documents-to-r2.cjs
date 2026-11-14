const path=require('node:path');
const Module=require('node:module');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
function loadMigration(){
 const result=esbuild.buildSync({
  entryPoints:[path.join(root,'scripts/migrate-local-documents-to-r2.ts')],
  bundle:true,platform:'node',target:'node22',format:'cjs',packages:'external',write:false,
  alias:{'@':root}
 });
 const filename=path.join(root,'scripts','migrate-local-documents-to-r2.bundle.cjs'),loaded=new Module(filename,module);
 loaded.filename=filename;loaded.paths=Module._nodeModulePaths(root);loaded._compile(result.outputFiles[0].text,filename);
 return loaded.exports.runLocalDocumentR2Migration;
}
async function main(){const result=await loadMigration()(process.argv.slice(2));console.log(JSON.stringify(result));}
if(require.main===module)main().catch(error=>{console.error('Local-to-R2 migration stopped: '+(error.code||error.status||error.name||'failure'));process.exitCode=1;});
module.exports={loadMigration};
