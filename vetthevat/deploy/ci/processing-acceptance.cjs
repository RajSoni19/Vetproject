// Real native scanner/decoder/OCR in disposable Linux CI, no database/provider.
const assert=require('node:assert/strict'),{request}=require('node:http'),{jsPDF}=require('jspdf'),fs=require('node:fs');
const socket='/run/vetthevat-staging/processing.sock';
function call(path,bytes,mime='application/pdf'){return new Promise((resolve,reject)=>{const req=request({socketPath:socket,path,method:'POST',headers:{'content-type':mime,'content-length':bytes.length},signal:AbortSignal.timeout(70000)},res=>{let raw='';res.setEncoding('utf8');res.on('data',part=>{raw+=part;if(raw.length>1100000)req.destroy(Error('Output limit'));});res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(raw)});}catch(e){reject(e);}});});req.on('error',reject);req.end(bytes);});}
async function main(){
 assert.equal(process.platform,'linux');assert.notEqual(process.getuid(),0);assert.equal(process.env.VTV_DISPOSABLE_ACCEPTANCE,'YES');
 const pdf=new jsPDF();pdf.setFontSize(22);pdf.text('Synthetic Invoice UK 240',20,35);pdf.text('Net GBP 100.00 VAT 20.00 Total 120.00',20,65);pdf.addPage();pdf.text('Second page reviewed manually',20,35);const bytes=Buffer.from(pdf.output('arraybuffer'));
 const scan=await call('/inspect',bytes);assert.equal(scan.status,200);assert.equal(scan.body.verdict,'clean');assert.match(scan.body.engine,/^ClamAV /);
 const ocr=await call('/ocr',bytes);assert.equal(ocr.status,200);assert.equal(ocr.body.pages.length,2);assert.match(ocr.body.pages.map(p=>p.text).join('\n'),/Synthetic Invoice/i);
 const corrupt=await call('/inspect',Buffer.from('%PDF-1.4\nnot-a-valid-document\n%%EOF'));assert.equal(corrupt.status,422);
 const eicar=['X5O!P%@AP[4\\PZX54(P^)7CC)7}$','EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
 const infected=await call('/inspect',Buffer.from('%PDF-1.4\n% '+eicar+'\n%%EOF'));assert.equal(infected.status,200);assert.equal(infected.body.verdict,'infected');
 assert.ok(fs.statSync(socket).isSocket());console.log(JSON.stringify({realClamAV:true,twoPageDecode:true,realTesseract:true,corruptDenied:true,eicarDenied:true,neon:false,r2:false,invoiceConfirmation:false}));
}
if(require.main===module)main().catch(()=>{console.error('Native processing acceptance failed; no file was promoted to a financial record.');process.exitCode=1;});
