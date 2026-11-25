import * as XLSX from "xlsx";
import {ukDate as formatUkDate,ukWorkbook} from "@/lib/uk-date";
import jsPDF from "jspdf";
import {ApiError} from "@/lib/server/api-v1";
import type {invoiceService} from "@/lib/server/saas/invoices";
import type {CompanyScope} from "@/lib/server/saas/transactions";
import type {InvoiceReport} from "@/lib/server/saas/reports";

function spreadsheetText(value:unknown){
 const text=String(value??"");
 return /^(?:\s*[=+\-@]|\t|\r)/.test(text)&&!/^\-?\d+(?:\.\d+)?$/.test(text)?"'"+text:text;
}
// A link that opens the invoice in the app and downloads its PDF (the person
// must be signed in; the PDF itself is never public).
export function invoicePdfLink(origin:string,id:string){return `${origin.replace(/\/+$/,"")}/app/invoices/${encodeURIComponent(id)}?pdf=1`;}
// Turns the text cells of one column (from row `firstRow`, 0-based) into clickable links.
function linkColumn(sheet:XLSX.WorkSheet,column:number,firstRow:number,targets:(string|null)[]){
  targets.forEach((target,index)=>{
    if(!target)return;
    const cell=sheet[XLSX.utils.encode_cell({r:firstRow+index,c:column})];
    if(cell)cell.l={Target:target,Tooltip:"Open the invoice PDF (sign in to VET THE VAT)"};
  });
}
// Plain names for VAT types in Excel downloads.
const TREATMENT_NAMES:Record<string,string>={standard:'Standard 20%',reduced:'Reduced 5%',zero:'Zero-rated 0%',exempt:'Exempt',outside:'Outside VAT',['not-evidenced']:'No VAT shown'};
// The same words as the VAT status filter on the Invoices page.
const VAT_STATUS_NAMES:Record<string,string>={'review-required':'Needs checking','not-evidenced':'No VAT shown',evidenced:'VAT shown on invoice',eligible:'VAT can be claimed',ineligible:"VAT can't be claimed"};
const PAYMENT_NAMES:Record<string,string>={'unpaid-due':'Unpaid','partially-paid':'Part paid','fully-paid':'Paid','not-applicable':'Not applicable'};
// Money as numbers (not text), so Excel can add the columns up.
const money=(value:unknown)=>{const number=Number(value);return value===null||value===undefined||value===""||!Number.isFinite(number)?"":number;};
export function exportReport(report:InvoiceReport,companyId:string,format:'pdf'|'xlsx',origin=""){
 if(format==='xlsx'){
  if(report.filters.status!=='confirmed')throw new ApiError(400,"INVALID_REQUEST","Excel exports include only confirmed, human-reviewed invoices.");
  const invoiceHeaders=['Invoice number','Supplier','Invoice date','Due date','Currency','Direction','Invoice status','Subtotal','VAT','Grand total','VAT evidenced','VAT claim eligibility','Payment status','Payment method','Amount paid','Balance due','Original invoice reference','Invoice PDF Link'];
  const invoiceRows=[invoiceHeaders,...report.items.map(row=>[
   spreadsheetText(row.number),spreadsheetText(row.contact),row.issued_on,row.due_on??"",row.currency,
   spreadsheetText(row.direction),spreadsheetText(row.state),money(row.net),money(row.vat),money(row.gross),row.vat_evidenced?money(row.vat_evidenced):"",
   spreadsheetText(VAT_STATUS_NAMES[row.vat_claim_status]??row.vat_claim_status),
   row.payment_status==='unavailable'?'Not recorded':spreadsheetText(PAYMENT_NAMES[row.payment_status]??row.payment_status),
   spreadsheetText(row.payment_method),money(row.amount_paid),money(row.balance_due),
   spreadsheetText(row.original_document_reference),
   origin ? "Open invoice PDF" : ""
  ])];
  const lineHeaders=['Invoice number','Supplier','Invoice date','Line item','Description','Quantity','Unit rate','Discount','VAT treatment','VAT rate','Pricing','Line subtotal','Line VAT','Line total'];
  const lineRows=[lineHeaders,...report.lineItems.map(row=>[
   spreadsheetText(row.invoice_number),spreadsheetText(row.supplier),row.invoice_date,row.position,
   spreadsheetText(row.description),money(row.quantity),money(row.unit_price),money(row.discount),
   spreadsheetText(TREATMENT_NAMES[row.treatment]??row.treatment),row.treatment==="not-evidenced"?"":money(row.rate),spreadsheetText(row.pricing==="inclusive"?"Includes VAT":row.pricing==="exclusive"?"Excludes VAT":row.pricing),money(row.net),row.treatment==="not-evidenced"?"":money(row.vat),money(row.gross)
  ])];
  const summarySheet=XLSX.utils.aoa_to_sheet(invoiceRows);
  if(origin)linkColumn(summarySheet,invoiceHeaders.length-1,1,report.items.map(row=>invoicePdfLink(origin,row.id)));
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,summarySheet,'Invoice Summary');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(lineRows),'Invoice Line Items');
  return {bytes:new Uint8Array(XLSX.write(ukWorkbook(workbook),{type:'buffer',bookType:'xlsx'})),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',name:'vetthevat-invoice-report.xlsx'};
 }
 const pdf=new jsPDF();let y=18;
 const line=(value:string)=>{for(const row of pdf.splitTextToSize(value,180) as string[]){if(y>275){pdf.addPage();y=18;}pdf.text(row,14,y);y+=7;}};
 line('VET THE VAT - Invoice report');line(`Company ${companyId} | ${formatUkDate(report.filters.startsOn)} to ${formatUkDate(report.filters.endsOn)} | ${report.filters.currency} | ${report.filters.status}`);
 line(`Records ${report.count} | Net ${report.net} | VAT ${report.vat} | Gross ${report.gross}`);
 for(const item of report.items)line(`${formatUkDate(item.issued_on)} | ${item.number} | ${item.contact} | ${item.direction} | ${item.kind} | Net ${item.net} VAT ${item.vat} Gross ${item.gross}`);
 return {bytes:new Uint8Array(pdf.output('arraybuffer')),mime:'application/pdf',name:'vetthevat-invoice-report.pdf'};
}

// Fetch within a reports:export scoped transaction. Never accept financial rows
// or totals from the HTTP client. Decimal strings remain exact in Excel cells.
export async function exportVat(service:ReturnType<typeof invoiceService>,scope:CompanyScope,period:unknown,format:"pdf"|"xlsx"){
  if(scope.permission!=="reports:export")throw new ApiError(403,"FORBIDDEN","Export permission required.");
  const report=await service.vatReport(scope,period);
  const metadata={companyId:scope.companyId,...report.period,notice:"Management VAT draft; not submitted to HMRC."};
  if(format==="xlsx"){
    const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(report.groups),"Confirmed VAT");XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([metadata]),"Scope");
    return {bytes:new Uint8Array(XLSX.write(ukWorkbook(workbook),{type:"buffer",bookType:"xlsx"})),mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",name:"vetthevat-vat-draft.xlsx"};
  }
  if(format!=="pdf")throw new ApiError(400,"INVALID_REQUEST","Invalid export format.");
  const pdf=new jsPDF();let y=18;
  const line=(value:string)=>{for(const row of pdf.splitTextToSize(value,180) as string[]){if(y>275){pdf.addPage();y=18;}pdf.text(row,14,y);y+=7;}};
  line("VET THE VAT - Management VAT draft");line(`Company: ${scope.companyId}`);line(`${report.period.startsOn} to ${report.period.endsOn} | ${report.period.currency}`);line(metadata.notice);
  for(const group of report.groups)line(`${group.direction} | ${group.treatment} | ${group.rate}% | Net ${group.net} | VAT ${group.vat} | Gross ${group.gross}`);
  return {bytes:new Uint8Array(pdf.output("arraybuffer")),mime:"application/pdf",name:"vetthevat-vat-draft.pdf"};
}
export async function exportInvoice(service:ReturnType<typeof invoiceService>,scope:CompanyScope,id:string,format:"pdf"|"xlsx",origin=""){
  if(scope.permission!=="reports:export")throw new ApiError(403,"FORBIDDEN","Export permission required.");
  const data=await service.exportInvoice(scope,id);
  if(format==="xlsx"){
    const invoice=data.invoice as Record<string,unknown>,tax=data.taxReview as Record<string,unknown>,payment=data.payment as Record<string,unknown>;
    const textCell=(value:unknown)=>spreadsheetText(value);
    const summary=[
      ["Invoice number","Supplier","Supplier email","Supplier phone","Supplier address","Supplier VAT number","Invoice date","Due date","Subtotal","VAT evidenced","VAT evidence status","VAT claim eligibility","VAT treatment","Grand total","Payment status","Payment method","Amount paid","Balance due","Original document reference"],
      [invoice.number,invoice.supplier_name,invoice.supplier_email,invoice.supplier_phone,invoice.supplier_address,invoice.supplier_vat_number,
       invoice.issued_on,invoice.due_on??"",invoice.net,tax.evidencedVat??"",tax.evidenceStatus,tax.claimStatus,tax.taxTreatment,
       invoice.gross,payment.status,payment.method??"",payment.amountPaid??"",payment.balanceDue??"",data.reference??""]
    ].map((row,index)=>row.map((value,column)=>index===0||[0,1,2,3,4,5,10,11,12,14,15,18].includes(column)?textCell(value):value));
    const lineRows=[
      ["Invoice number","Supplier","Invoice date","Line","Description","Quantity","Unit price","Discount","VAT treatment","VAT rate","Pricing","Subtotal","VAT amount","Line total","VAT evidence status"],
      ...data.lines.map((raw)=>{
        const row=raw as Record<string,unknown>;
        const notEvidenced=row.treatment==="not-evidenced";
        return [invoice.number,invoice.supplier_name,invoice.issued_on,row.position,row.description,row.quantity,row.unit_price,row.discount,row.treatment,notEvidenced?"":row.rate,row.pricing,row.net,notEvidenced?"":row.vat,row.gross,tax.evidenceStatus]
          .map((value,column)=>[0,1,2,4,8,10,14].includes(column)?textCell(value):value);
      })
    ];
    // One sheet, column layout: invoice headings across the top with the values
    // underneath, then the item table. Real numbers, plain-English VAT labels.
    const n=(value:unknown)=>value===null||value===undefined||value===""?"":Number(value);
    const header=[
      ["Invoice number","Invoice date","Due date","Supplier","Supplier VAT number","Supplier address","Supplier email","Supplier phone","Currency","Net","VAT","Total",...(origin?["Invoice PDF"]:[])],
      [textCell(invoice.number),textCell(ukDate(invoice.issued_on)),textCell(ukDate(invoice.due_on)),textCell(invoice.supplier_name),textCell(invoice.supplier_vat_number??""),
       textCell(invoice.supplier_address??""),textCell(invoice.supplier_email??""),textCell(invoice.supplier_phone??""),textCell(invoice.currency),n(invoice.net),n(invoice.vat),n(invoice.gross),...(origin?["Open invoice PDF"]:[])]
    ];
    const items=[["#","Description","Quantity","Unit price","VAT","Net","VAT amount","Total"],
      ...data.lines.map(raw=>{const row=raw as Record<string,unknown>;return [n(row.position),textCell(row.description),n(row.quantity),n(row.unit_price),textCell(vatLabel(row.treatment,row.rate)),n(row.net),row.treatment==="not-evidenced"?"":n(row.vat),n(row.gross)];}),
      ["","","","","Totals",n(invoice.net),n(invoice.vat),n(invoice.gross)]];
    const sheet=XLSX.utils.aoa_to_sheet([...header,[],["Items"],...items]);
    // Widths suit both tables (row 1 headings and the item columns below).
    sheet["!cols"]=[{wch:16},{wch:44},{wch:12},{wch:32},{wch:20},{wch:30},{wch:26},{wch:16},{wch:10},{wch:12},{wch:12},{wch:12},{wch:18}];
    if(origin)linkColumn(sheet,12,1,[invoicePdfLink(origin,id)]);
    sheet["!autofilter"]={ref:`A5:H${5+data.lines.length}`};
    const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,"Invoice");
    return {bytes:new Uint8Array(XLSX.write(ukWorkbook(workbook),{type:"buffer",bookType:"xlsx"})),mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",name:`invoice-${fileSafe(invoice.number)}.xlsx`};
  }
  if(format!=="pdf")throw new ApiError(400,"INVALID_REQUEST","Invalid export format.");
  return {bytes:invoicePdf(data),mime:"application/pdf",name:`invoice-${fileSafe((data.invoice as Record<string,unknown>).number)}.pdf`};
}

const fileSafe=(value:unknown)=>String(value??"invoice").replace(/[^A-Za-z0-9._-]+/g,"-").slice(0,60)||"invoice";
function ukDate(value:unknown){const text=String(value??"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(text)?formatUkDate(text):"";}
function vatLabel(treatment:unknown,rate:unknown){
  const r=Number(rate);
  return treatment==="standard"?`Standard ${r}%`:treatment==="reduced"?`Reduced ${r}%`:treatment==="zero"?"Zero-rated":treatment==="exempt"?"Exempt":treatment==="outside"?"Outside scope":treatment==="not-evidenced"?"Not shown":String(treatment??"");
}
const qty=(value:unknown)=>{const v=Number(value);return Number.isInteger(v)?String(v):String(Math.round(v*10000)/10000);};

// A clean A4 invoice record: header, supplier, details, item table, totals.
function invoicePdf(data:Awaited<ReturnType<ReturnType<typeof invoiceService>["exportInvoice"]>>){
  const invoice=data.invoice as Record<string,unknown>,contact=(invoice.contact_snapshot??{}) as Record<string,unknown>;
  const currency=String(invoice.currency??"GBP");
  const money=(value:unknown)=>new Intl.NumberFormat("en-GB",{style:"currency",currency}).format(Number(value??0));
  const pdf=new jsPDF({unit:"mm",format:"a4"}),W=210,M=15;let y=0;
  const text=(value:string,x:number,yy:number,opts:{size?:number;bold?:boolean;color?:[number,number,number];align?:"left"|"right"}={})=>{pdf.setFont("helvetica",opts.bold?"bold":"normal");pdf.setFontSize(opts.size??10);pdf.setTextColor(...(opts.color??[30,41,59]));pdf.text(value,x,yy,{align:opts.align??"left"});};
  // Header band
  pdf.setFillColor(15,122,58);pdf.rect(0,0,W,24,"F");
  text("VET THE VAT",M,15,{size:16,bold:true,color:[255,255,255]});
  text(invoice.kind==="credit-note"?"CREDIT NOTE":"PURCHASE INVOICE",W-M,15,{size:12,bold:true,color:[255,255,255],align:"right"});
  y=36;
  // Supplier block (left) and invoice details (right)
  text("SUPPLIER",M,y,{size:8,bold:true,color:[100,116,139]});
  text(String(invoice.supplier_name??contact.name??""),M,y+6,{size:12,bold:true});
  let sy=y+12;
  for(const part of [contact.address??invoice.supplier_address,invoice.supplier_vat_number?`VAT No: ${invoice.supplier_vat_number}`:null,invoice.supplier_email,invoice.supplier_phone].filter(Boolean) as string[]){
    for(const row of pdf.splitTextToSize(String(part),95) as string[]){text(row,M,sy,{size:9,color:[71,85,105]});sy+=5;}
  }
  const details:[string,string][]=[["Invoice number",String(invoice.number??"")],["Invoice date",ukDate(invoice.issued_on)],["Due date",ukDate(invoice.due_on)||"—"],["Status",String(invoice.state??"").replace(/^\w/,c=>c.toUpperCase())]];
  let dy=y;for(const [label,value] of details){text(label,128,dy,{size:9,color:[100,116,139]});text(value,W-M,dy,{size:9,bold:true,align:"right"});dy+=6;}
  y=Math.max(sy,dy)+6;
  // Item table
  const descWidth=78;const cols=[{h:"Description",x:M,align:"left" as const},{h:"Qty",x:M+86,align:"right" as const},{h:"Unit price",x:M+110,align:"right" as const},{h:"VAT",x:M+138,align:"right" as const},{h:"Total",x:W-M,align:"right" as const}];
  const header=()=>{pdf.setFillColor(241,245,249);pdf.rect(M,y-5,W-2*M,8,"F");for(const c of cols)text(c.h,c.align==="right"?c.x:c.x+2,y,{size:9,bold:true,color:[51,65,85],align:c.align});y+=8;};
  header();
  for(const raw of data.lines){
    const row=raw as Record<string,unknown>,desc=pdf.splitTextToSize(String(row.description??""),descWidth) as string[],h=Math.max(1,desc.length)*4.6+2.4;
    if(y+h>262){pdf.addPage();y=20;header();}
    desc.forEach((d,i)=>text(d,M+2,y+i*4.6,{size:9}));
    text(qty(row.quantity),cols[1].x,y,{size:9,align:"right"});
    text(money(row.unit_price),cols[2].x,y,{size:9,align:"right"});
    text(vatLabel(row.treatment,row.rate),cols[3].x,y,{size:8,color:[71,85,105],align:"right"});
    text(money(row.gross),cols[4].x,y,{size:9,bold:true,align:"right"});
    y+=h;pdf.setDrawColor(226,232,240);pdf.line(M,y-3.6,W-M,y-3.6);
  }
  // Totals box
  if(y+30>280){pdf.addPage();y=20;}
  y+=4;const bx=W-M-75;
  for(const [label,value,strong] of [["Net",money(invoice.net),false],["VAT",money(invoice.vat),false],["Total",money(invoice.gross),true]] as [string,string,boolean][]){
    if(strong){pdf.setFillColor(15,122,58);pdf.rect(bx,y-5,75,9,"F");}
    text(label,bx+3,y+0.5,{size:strong?11:10,bold:strong,color:strong?[255,255,255]:[71,85,105]});
    text(value,W-M-3,y+0.5,{size:strong?11:10,bold:true,color:strong?[255,255,255]:[30,41,59],align:"right"});y+=strong?10:7;
  }
  // Footer
  const pages=pdf.getNumberOfPages();
  for(let p=1;p<=pages;p++){pdf.setPage(p);text(`Generated by VET THE VAT from the saved invoice record · Page ${p} of ${pages}`,W/2,290,{size:7.5,color:[148,163,184],align:"center" as "left"});}
  return new Uint8Array(pdf.output("arraybuffer"));
}
