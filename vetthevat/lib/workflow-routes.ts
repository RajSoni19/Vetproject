export const orsWorkflowRoutes=[
 {path:'/app/ors/dashboard',title:'ORS Dashboard',group:'Overview'},
 {path:'/app/ors/orders',title:'Orders',group:'Purchasing',action:'/app/ors/prices',actionLabel:'New order'},
 {path:'/app/ors/orders/new',title:'Create Order',parent:'/app/ors/orders'},
 {path:'/app/ors/purchase-orders',title:'Purchase Orders',group:'Purchasing'},
 {path:'/app/ors/supplier-invoices',title:'Supplier Invoices',group:'Purchasing',action:'/app/ors/supplier-invoices/upload',actionLabel:'Upload supplier invoice'},
 {path:'/app/ors/supplier-invoices/upload',title:'Upload Supplier Invoice',parent:'/app/ors/supplier-invoices'},
 {path:'/app/ors/supplier-invoices/match',title:'Link VAT Invoice',parent:'/app/ors/supplier-invoices'},
 {path:'/app/ors/catalogue',title:'Product Catalogue',group:'Stock',action:'/app/ors/catalogue/new',actionLabel:'Create product'},
 {path:'/app/ors/catalogue/new',title:'Create Product',parent:'/app/ors/catalogue'},
 {path:'/app/ors/inventory',title:'Inventory',group:'Stock'},
 {path:'/app/ors/inventory/warehouses/new',title:'Create Warehouse',parent:'/app/ors/inventory'},
 {path:'/app/ors/inventory/locations/new',title:'Create Stock Location',parent:'/app/ors/inventory'},
 {path:'/app/ors/inventory/transfers/new',title:'Stock Transfer',parent:'/app/ors/inventory'},
 {path:'/app/ors/inventory/adjustments/new',title:'Stock Adjustment',parent:'/app/ors/inventory'},
 {path:'/app/ors/goods-receipts',title:'Goods Receipts',group:'Stock',action:'/app/ors/goods-receipts/new',actionLabel:'Receive goods'},
 {path:'/app/ors/goods-receipts/new',title:'Receive Goods',parent:'/app/ors/goods-receipts'},
 {path:'/app/ors/suppliers',title:'Suppliers',group:'Directory',action:'/app/ors/suppliers/new',actionLabel:'Add supplier'},
 {path:'/app/ors/suppliers/new',title:'Add Supplier',parent:'/app/ors/suppliers'},
 {path:'/app/ors/reports',title:'Reports',group:'Insights'},
 {path:'/app/ors/shop',title:'Product Shopping',group:'Purchasing'},
 {path:'/app/ors/cart',title:'Cart',group:'Purchasing'},
 {path:'/app/ors/shopping-orders',title:'Shopping Orders',group:'Purchasing'},
 {path:'/app/ors/shopping',title:'Shopping Requisitions',group:'Purchasing'},
 {path:'/app/ors/sales',title:'Sales & Fulfilment',group:'Sales',action:'/app/ors/sales/new',actionLabel:'Create sales order'},
 {path:'/app/ors/sales/new',title:'Create Sales Order',parent:'/app/ors/sales'},
 {path:'/app/ors/prices',title:'Supplier Prices',group:'Insights'},
] as const;
export function workflowRoute(path:string):{path:string;title:string;parent?:string;action?:string;actionLabel?:string}|undefined{
 if(/^\/app\/ors\/shopping-orders\/[a-f0-9-]{36}$/.test(path))return {path,title:'Shopping Order Details',parent:'/app/ors/shopping-orders'};
 const exact=orsWorkflowRoutes.find(r=>r.path===path);if(exact)return exact;
 const detail=path.match(/^\/app\/ors\/(orders|purchase-orders|supplier-invoices|catalogue|goods-receipts|suppliers)\/([a-f0-9-]{36})(?:\/edit)?$/);
 if(detail)return {path,title:({orders:'Order Details','purchase-orders':'Purchase Order Details','supplier-invoices':'Supplier Invoice Review',catalogue:'Product Details','goods-receipts':'Goods Receipt Details',suppliers:'Supplier Details'} as Record<string,string>)[detail[1]],parent:'/app/ors/'+detail[1]};
 if(path==='/app/vat')return {path,title:'VAT Reports',parent:'/app/dashboard'};
 if(path==='/app/invoices/review')return {path,title:'OCR Review',parent:'/app/invoices/upload'};
 if(/\/app\/invoices\/[a-f0-9-]{36}\/edit$/.test(path))return {path,title:'Edit Invoice',parent:path.replace(/\/edit$/,'')};
 if(path==='/app/suppliers/new')return {path,title:'Add Supplier',parent:'/app/suppliers'};
 return undefined;
}
