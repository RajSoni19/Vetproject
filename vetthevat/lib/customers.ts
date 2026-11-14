import type { Customer, Invoice } from "@/lib/domain";
const normalize=(value:string)=>value.trim().replace(/\s+/g," ").toLowerCase();
export function validateCustomer(customer:Customer,customers:Customer[]){
  const errors:string[]=[];
  if(!customer.name.trim())errors.push("Customer name is required.");
  if(customer.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))errors.push("Enter a valid email address.");
  if(customer.vatNumber&&!/^[A-Za-z0-9 .-]{5,25}$/.test(customer.vatNumber))errors.push("Check the VAT identifier format. Registration is not verified.");
  if(!["Active","Review","Archived"].includes(customer.status))errors.push("Choose a valid customer status.");
  if(customers.some(row=>row.id!==customer.id&&row.companyId===customer.companyId&&(normalize(row.name)===normalize(customer.name)||Boolean(customer.vatNumber)&&row.vatNumber.replace(/\s/g,"").toLowerCase()===customer.vatNumber.replace(/\s/g,"").toLowerCase())))errors.push("A customer with this name or VAT number already exists in this company. Review that record first.");
  return errors;
}
export function customerInvoices(customer:Customer,invoices:Invoice[]){
  return invoices.filter(row=>row.companyId===customer.companyId&&row.transactionType==="Sale"&&(row.customerId===customer.id||!row.customerId&&normalize(row.customerName)===normalize(customer.name)&&(!row.customerVatNumber||!customer.vatNumber||normalize(row.customerVatNumber)===normalize(customer.vatNumber))));
}
