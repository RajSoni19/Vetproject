const path=require('node:path');
const Module=require('node:module');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
function loadStorage(){
 const result=esbuild.buildSync({
  entryPoints:[path.join(root,'lib/server/saas/local-originals.ts')],
  bundle:true,platform:'node',target:'node22',format:'cjs',packages:'external',write:false,
  alias:{'@':root}
 });
 const filename=path.join(root,'scripts','copy-local-originals.bundle.cjs'),loaded=new Module(filename,module);
 loaded.filename=filename;loaded.paths=Module._nodeModulePaths(root);loaded._compile(result.outputFiles[0].text,filename);
 return loaded.exports.copyLegacyLocalOriginals;
}
function main(){
 const destination=process.argv[2];
 if(!destination||process.argv.length!==3||!path.isAbsolute(destination))throw Error('Usage: npm run documents:copy-local -- <absolute-private-directory>');
 const source=path.join(root,'.local-private-originals');
 const result=loadStorage()(source,destination,root);
 console.log(JSON.stringify({source:'legacy workspace storage',destination:'external private storage',...result,sourceDeleted:false}));
}
if(require.main===module)try{main();}catch(error){console.error('Local document copy refused: '+(error.code||error.status||error.message||'copy failed'));process.exitCode=1;}
module.exports={loadStorage};
