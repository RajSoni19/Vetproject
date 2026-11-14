// Offline component rendering for visual QA only. Never an application route,
// authentication bypass or fixture served by the production application.
const fs=require('node:fs');const path=require('node:path');
const {loadSource}=require('./load-source.cjs');
exports.renderOrs=async()=>{
 const filename=path.resolve(__dirname,'../components/ors-workspace.tsx');
 const swc=require('next/dist/build/swc');await swc.loadBindings();
 const {code}=await swc.transform(fs.readFileSync(filename,'utf8'),{
  filename,jsc:{parser:{syntax:'typescript',tsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}
 });
 const module={exports:{}};new Function('require','module','exports',code)(id=>id.startsWith('@/')?loadSource(id.slice(2)):require(id),module,module.exports);
 return require('react-dom/server').renderToStaticMarkup(require('react').createElement(module.exports.OrsWorkspace));
};
