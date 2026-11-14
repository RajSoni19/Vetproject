const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {randomUUID,createHash}=require('node:crypto');
const {loadSource}=require('./load-source.cjs');
test('Stage 1 local private originals: write-once persistence, ownership, integrity and public-path avoidance',async()=>{
 const {localOriginalStore}=loadSource('lib/server/stage1/local-storage');
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vet-stage1-storage-')); const storage=await localOriginalStore(workspace,'test');
 const bytes=Buffer.from('synthetic-original-only'),companyId=randomUUID(),id=randomUUID(),sha256=createHash('sha256').update(bytes).digest('hex');
 const stored=await storage.put({companyId,id,bytes,sha256}); const original={...stored,id,companyId,sha256,byteSize:bytes.length,mimeType:'image/png'};
 assert.deepEqual(Buffer.from(await storage.read(original)),bytes);assert.ok(!stored.objectId.includes('http'));
 await assert.rejects(storage.put({companyId,id,bytes,sha256}));
 await assert.rejects(storage.read({...original,companyId:randomUUID()}));
 await assert.rejects(storage.read({...original,sha256:'0'.repeat(64)}));
 await assert.rejects(storage.put({companyId:'../escape',id,bytes,sha256}));
 assert.deepEqual(await fs.readdir(workspace),['.stage1-private']);
 // Synthetic temporary artifacts are retained; no recursive deletion performed.
});
test('Stage 1 digital PDF adapter reads a real synthetic PDF with installed PDF.js',async()=>{
 const {jsPDF}=require('jspdf');const pdf=new jsPDF();pdf.text(['Supplier: Synthetic Ltd','Invoice number: SYN-001','Currency: GBP','Subtotal: 100.00','VAT amount: 20.00','Grand total: 120.00'],10,20);
 const {digitalPdf}=loadSource('lib/server/stage1/pdf-reader');
 const result=await digitalPdf(new Uint8Array(pdf.output('arraybuffer')),AbortSignal.timeout(15000));
 assert.equal(result.pages,1);assert.ok(result.textByPage[0].includes('SYN-001'));assert.ok(result.textByPage[0].includes('100.00'));
});
test('Stage 1 local OCR adapter reads a synthetic PNG using local Tesseract assets',async()=>{
 const {createCanvas}=require('@napi-rs/canvas');const canvas=createCanvas(1200,250);const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1200,250);context.fillStyle='black';context.font='48px Arial';context.fillText('INVOICE SYNTHETIC 12345',30,90);context.fillText('TOTAL 120.00 GBP',30,170);
 const {localImageOcr}=loadSource('lib/server/stage1/local-ocr');
 const result=await localImageOcr(path.resolve(__dirname,'..'),'test')(canvas.toBuffer('image/png'),'image/png',AbortSignal.timeout(45000));
 assert.match(result,/12345/);assert.match(result,/120[.,]00/);
});
