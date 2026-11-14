import type {Company,Invoice,StoredDocument} from "@/lib/domain";
import {buildReport,type ReportFilters} from "@/lib/reporting";
import {toMinorUnits,fromMinorUnits} from "@/lib/money";
export function buildVatReport(invoices:Invoice[],documents:StoredDocument[],company:Company,filters:ReportFilters={}){
 const report=buildReport(invoices,documents,company,filters);
 const rows=report.rows.flatMap(invoice=>invoice.lineItems.filter(line=>!filters.vatRate||filters.vatRate==="All"||line.vatRate===Number(filters.vatRate)).map(line=>({id:invoice.id+":"+line.id,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,supplier:invoice.supplierName,currency:invoice.currency,rate:line.vatRate,net:line.netAmount,vat:line.vatAmount,gross:line.grossAmount,classification:line.taxClassification||"Unclassified",direction:invoice.transactionType||"Unclassified"})));
 const totals=[...new Set(rows.map(row=>row.currency))].sort().map(currency=>{const group=rows.filter(row=>row.currency===currency);return {currency,net:fromMinorUnits(group.reduce((sum,row)=>sum+toMinorUnits(row.net),0)),vat:fromMinorUnits(group.reduce((sum,row)=>sum+toMinorUnits(row.vat),0)),gross:fromMinorUnits(group.reduce((sum,row)=>sum+toMinorUnits(row.gross),0))};});
 const directionTotals=[...new Set(rows.map(row=>row.currency))].flatMap(currency=>["Purchase","Sale","Unclassified"].map(direction=>{const group=rows.filter(row=>row.currency===currency&&row.direction===direction);return {currency,direction,count:group.length,vat:fromMinorUnits(group.reduce((sum,row)=>sum+toMinorUnits(row.vat),0))};}));
 return {...report,vatRows:rows,vatTotals:totals,directionTotals};
}
