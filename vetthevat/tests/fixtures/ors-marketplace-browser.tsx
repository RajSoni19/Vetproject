// Synthetic HTTP fixture only. Never imported by application routes.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {OrsProductMarketplace} from '../../components/ors-product-marketplace';
import {lineAmounts,sumAmounts,whatsappMessage,offerUsable,phoneDigits,type Offer} from '../../lib/ors-marketplace';
const product='123e4567-e89b-42d3-a456-426614174001',supplier='123e4567-e89b-42d3-a456-426614174002',supplier2='123e4567-e89b-42d3-a456-426614174003',company='123e4567-e89b-42d3-a456-426614174010';
const suppliers=[{id:supplier,name:'Synthetic Orchard',source:'manager_confirmed',productName:null},{id:supplier2,name:'Synthetic Market',source:'manager_confirmed',productName:null}];
const products=[{id:product,sku:'SYN-RICE',name:'Synthetic Rice',stock_unit:'kg',category:'Pantry',image_path:'/ors/catalogue/grains.svg',units:[{code:'box',baseUnit:'kg',baseQuantityPerUnit:'5'},{code:'kg',baseUnit:'kg',baseQuantityPerUnit:'1'}],suppliers},{id:'123e4567-e89b-42d3-a456-426614174004',sku:'SYN-UNKNOWN',name:'Synthetic Unquoted',stock_unit:'pcs',category:'Other',units:[{code:'pcs',baseUnit:'pcs',baseQuantityPerUnit:'1'}],suppliers:[suppliers[0]]}];
const offers:Offer[]=suppliers.map((s,i)=>({id:'offer-'+i,material_id:product,supplier_id:s.id,unit_code:'box',base_unit:'kg',base_quantity_per_unit:'5',unit_price:i?'11':'12',currency:'GBP',vat_rate:'20',price_includes_vat:!i,minimum_order_quantity:'1',available_quantity:'100',availability_state:'available',valid_until:'2099-01-01T00:00:00Z',version:1}));
offers.push({...offers[1],id:'offer-kg',unit_code:'kg',base_quantity_per_unit:'1',unit_price:'2.50'});
const events:any[]=[],popups:any[]=[];let badPhone=false,changed=false;
const read=()=>JSON.parse(localStorage.getItem('synthetic-cart')??'null');const save=(v:any)=>localStorage.setItem('synthetic-cart',JSON.stringify(v));
const drafts=()=>JSON.parse(localStorage.getItem('synthetic-orders')??'[]');
(window as any).shoppingTest={events,popups,company,supplier,supplier2,product,setBadPhone:(v:boolean)=>{badPhone=v;},setChanged:(v:boolean)=>{changed=v;}};
document.addEventListener("click",e=>{const link=(e.target as Element)?.closest?.("a");if(link?.href.startsWith("https://wa.me/")){e.preventDefault();popups.push(link.href);}});
window.open=()=>{const popup={opener:null,location:{replace:(url:string)=>popups.push(url)},close:()=>{}};return popup as any;};
const quote=()=>{const cart=read();return {requisitionId:cart.id,version:cart.version,fingerprint:'a'.repeat(64),groups:cart.groups.filter((g:any)=>g.lines.length).map((g:any)=>{const lines=g.lines.map((l:any)=>{const offer=offers.find(o=>o.supplier_id===g.supplier_id&&o.material_id===l.materialId&&o.unit_code===l.unit);return {...l,offer:offer??null,...(offer?lineAmounts(offer,l.quantity):{subtotal:'0.00',vat:'0.00',total:'0.00'})};});return {id:g.id,supplierName:g.supplier_name,currency:'GBP',issues:[...(badPhone?['Supplier WhatsApp number is missing or invalid.']:[]),...lines.filter((l:any)=>!l.offer||!offerUsable(l.offer,l.quantity)).map(()=> 'Verified price unavailable')],lines,...sumAmounts(lines)};})};};
window.fetch=async(input,init)=>{const path=String(input),method=init?.method??'GET',body=typeof init?.body==='string'?JSON.parse(init.body):null,headers=new Headers(init?.headers);events.push({path,method,body,company:headers.get('x-company-id')});
 if(path==='/api/auth/session')return Response.json({csrfToken:'synthetic'});
 if(headers.get('x-company-id')!==company)return Response.json({error:{message:'Company permission required.'}},{status:403});
 let data:any;
 if(path.endsWith('/catalogue/manage'))return Response.json({error:{message:'Purchasing manager only'}},{status:403});
 if(path.endsWith('/catalogue'))data=products;
 else if(path.endsWith('/offers'))data={ready:true,items:offers};
 else if(path.endsWith('/cart'))data=read();
 else if(path.includes('/quote/'))data=quote();
 else if(path.endsWith('/cart/items')){let cart=read()??{id:'123e4567-e89b-42d3-a456-426614174020',version:1,groups:[]};if(method==='POST'){let group=cart.groups.find((g:any)=>g.supplier_id===body.supplierId);if(!group){group={id:body.supplierId,supplier_id:body.supplierId,supplier_name:suppliers.find(s=>s.id===body.supplierId)!.name,lines:[]};cart.groups.push(group);}const p=products.find(p=>p.id===body.materialId)!;group.lines.push({id:crypto.randomUUID(),materialId:p.id,sku:p.sku,name:p.name,quantity:body.quantity,unit:body.unit,note:null});}else for(const g of cart.groups){if(method==='PATCH')g.lines=g.lines.map((l:any)=>l.id===body.lineId?{...l,quantity:body.quantity}:l);if(method==='DELETE')g.lines=g.lines.filter((l:any)=>l.id!==body.lineId);}cart.version++;save(cart);data=cart;}
 else if(path.endsWith('/checkout')){if(changed)return Response.json({error:{message:'Prices, stock or cart changed. Revalidate and review totals before checkout.'}},{status:409});const q=quote();if(q.groups.some((g:any)=>g.issues.length))return Response.json({error:{message:'Resolve supplier issues'}},{status:400});const orders=q.groups.map((g:any,i:number)=>{const reference='ORS-SYNTHETIC'+String(drafts().length+i),message=whatsappMessage('Synthetic Company',g.supplierName,reference,'GBP',g.lines.map((l:any)=>({name:l.name,sku:l.sku,quantity:l.quantity,unit:l.unit,unitPrice:l.offer.unit_price,vatRate:l.offer.vat_rate,includesVat:l.offer.price_includes_vat,total:l.total})),g);return {...g,id:crypto.randomUUID(),reference,supplierName:g.supplierName,state:'pending_dispatch',message,url:'https://wa.me/'+phoneDigits('+441234567890')+'?text='+encodeURIComponent(message)};});localStorage.setItem('synthetic-orders',JSON.stringify([...drafts(),...orders]));save(null);data={orders};}
 else if(path.includes('/orders')){const id=path.split('/orders/')[1],all=drafts().filter((o:any)=>!id||o.id===id);data={ready:true,actions:id?all:[],items:all.map((o:any)=>({id:o.id,order_reference:o.reference,supplier_name:o.supplierName,state:o.state,currency:'GBP',subtotal:o.subtotal,vat_amount:o.vat,total_amount:o.total,created_at:'2026-11-04T10:00:00Z'})),lines:id?all[0]?.lines.map((l:any)=>({product_name:l.name,sku:l.sku,quantity:l.quantity,unit_code:l.unit,unit_price:l.offer.unit_price,vat_rate:l.offer.vat_rate,price_includes_vat:l.offer.price_includes_vat,total_amount:l.total})):[]};}
 else throw Error('Unexpected fixture request '+path);
 return Response.json({data});
};
const path=location.pathname,mode=path.includes('shopping-orders')?'orders':path.includes('/cart')?'cart':'catalogue';
createRoot(document.getElementById('root')!).render(<OrsProductMarketplace companyId={company} enabled mode={mode} orderId={path.match(/shopping-orders\/(.+)$/)?.[1]}/>);
