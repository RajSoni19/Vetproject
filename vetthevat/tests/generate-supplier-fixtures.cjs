const fs=require('node:fs'),{jsPDF}=require('jspdf'),{createCanvas}=require('@napi-rs/canvas'),{pages}=require('./fixtures/supplier-invoice.cjs');
fs.mkdirSync('docs/test-results',{recursive:true});
const pdf=new jsPDF({orientation:'landscape'});pdf.setFont('courier');pdf.setFontSize(11);
pages.forEach((page,i)=>{if(i)pdf.addPage();page.text.replace('Total: 39.80','Total: 40.80').split('\n').forEach((row,j)=>pdf.text(row,10,20+j*9));});
fs.writeFileSync('docs/test-results/supplier-multipage.pdf',Buffer.from(pdf.output('arraybuffer')));
const canvas=createCanvas(2600,1500),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,2600,1500);context.fillStyle='black';context.font='32px Consolas';
pages.flatMap(page=>page.text.replace('Total: 39.80','Total: 40.80').split('\n')).forEach((row,i)=>context.fillText(row,35,70+i*65));
fs.writeFileSync('docs/test-results/supplier-lines.png',canvas.toBuffer('image/png'));
console.log('Synthetic multi-line PDF and PNG fixtures generated.');
