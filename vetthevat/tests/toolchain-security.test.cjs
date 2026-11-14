const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('patched selector parser preserves the previous financial/theme/responsive CSS fixture',async()=>{
 const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/toolchain-compat.json'),'utf8'));
 const config=require('tailwindcss/loadConfig')(path.resolve(__dirname,'../tailwind.config.ts'));config.content=[{raw:fixture.raw,extension:'html'}];
 const output=await require('postcss')([require('tailwindcss')(config),require('autoprefixer')]).process(fixture.css,{from:undefined});
 assert.equal(crypto.createHash('sha256').update(output.css).digest('hex'),fixture.expectedSha256);
 assert.equal(require('postcss-selector-parser/package.json').version,'7.1.6');
 const lock=JSON.parse(fs.readFileSync(path.join(__dirname,'../package-lock.json'),'utf8'));
 const entries=Object.entries(lock.packages).filter(([key])=>key.endsWith('/postcss-selector-parser'));
 assert.ok(entries.length>0);assert.ok(entries.every(([,value])=>value.version==='7.1.6'));
});
test('patched selector parser handles a large flat selector and fails malformed input',()=>{
 const parser=require('postcss-selector-parser');
 const input=Array.from({length:12000},(_,i)=>'.synthetic-'+i).join(',');
 assert.equal(parser().processSync(input),input);
 assert.throws(()=>parser().processSync('[unclosed="value"'));
});
