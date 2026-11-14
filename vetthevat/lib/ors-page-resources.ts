export function orsPageResources(path:string){
 const catalogue=/\/(catalogue|inventory|orders\/new|goods-receipts\/new|supplier-invoices|sales)/.test(path),requests=path.includes('/orders')&&!path.includes('/purchase-orders'),orders=path.includes('/purchase-orders')||path.includes('/goods-receipts')||path.includes('/supplier-invoices'),matches=path.endsWith('/supplier-invoices/match'),inventory=path.includes('/inventory')||path.includes('/goods-receipts')||matches,sales=path.includes('/sales'),contacts=path.includes('/suppliers')||requests||orders||sales||path.includes('/supplier-invoices');
 return {catalogue,requests,orders,inventory,sales,matches,contacts,invoices:matches};
}
