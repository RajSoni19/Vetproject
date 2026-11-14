// Explicit synthetic tenants only; no schema changes, customer mail or providers.
const s=require('../saas-services.cjs');
exports.seed=async(label='price-demo')=>{
 const user=await s.provisionVerifiedTestIdentity(label),session=await s.sessionForVerifiedTestIdentity(user),company=await s.companyFor(user.userId),business=s.business(),invoices=s.loadSource('lib/server/saas/invoices').invoiceService(business.database),prices=s.loadSource('lib/server/procurement/service').companyPriceService(business.database),key=()=>s.crypto.randomUUID(),scope=permission=>({sessionCookie:session.token,companyId:company,permission});
 await s.operator(db=>db.query("INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference) SELECT account_id,'Growth','active',300,3,6,NULL,true,now(),'synthetic-local-demo-not-payment' FROM saas.company_profiles WHERE company_id=$1",[company]));
 await s.operator(db=>db.query("UPDATE web_auth.companies SET name='SYNTHETIC DEMO — Procurement & Analytics' WHERE id=$1",[company]));
 const suppliers=[];for(const name of ['Tesco (synthetic)','Sainsbury’s (synthetic)','Costco (synthetic)'])suppliers.push(await invoices.saveContact(scope('contacts:write'),{kind:'supplier',name,status:'active'},key()));
 const customer=await invoices.saveContact(scope('contacts:write'),{kind:'customer',name:'Synthetic sales customer',status:'active'},key()),products=[];
 for(const [name,variant,unit] of [['Tomatoes','Fresh / loose / Class I / unbranded','kg'],['Milk','Whole / Brand A / standard','l']])products.push(await prices.command(scope('invoices:read'),{action:'product',payload:{name,variant,unit,gtin:null}},key(),1));
 const created=[];
 const make=async({supplier=0,date='2026-10-28',price='6',qty='1',product=0,pack='6',content='500',unit='g',rate='0',description='Tomatoes pack',direction='purchase',kind='invoice',creditForId=null,match=true})=>{
  const input={direction,kind,contactId:direction==='sale'?customer.id:suppliers[supplier].id,number:'SYN-'+String(created.length+1).padStart(3,'0'),issuedOn:date,dueOn:null,currency:'GBP',rounding:'line-half-up',lines:[{description,quantity:qty,unitPrice:price,discount:'0',rate,treatment:rate==='0'?'zero':'standard',pricing:'exclusive'}],notes:'SYNTHETIC DEMO ONLY. Not a supplier quotation or payment.',creditForId};
  const invoice=await invoices.create(scope(kind==='credit-note'?'invoices:correct':'invoices:write'),input,key());await invoices.confirm(scope('invoices:confirm'),invoice.id,key(),invoice.version);const detail=await invoices.detail(scope('invoices:read'),invoice.id),line=detail.lines[0];
  if(match&&direction==='purchase'&&kind==='invoice')await prices.command(scope('invoices:read'),{action:'match',payload:{lineId:line.id,productId:products[product].id,itemsPerPack:pack,contentPerItem:content,unit}},key(),1);
  created.push({id:invoice.id,lineId:line.id,...input,product,pack,content,unit});return invoice;
 };
 await make({supplier:0,price:'6'});await make({supplier:1,price:'1.80',pack:'1',content:'1',unit:'kg'});await make({supplier:2,price:'14',qty:'2',pack:'2',content:'2',unit:'kg'});
 await make({supplier:0,price:'8',date:'2026-09-30'});await make({supplier:0,price:'8',date:'2026-10-01'});
 for(let supplier=0;supplier<3;supplier++)await make({supplier,product:1,price:['6','5.40','7.20'][supplier],pack:'6',content:'500',unit:'ml',description:'Brand A whole milk 6 x 500ml',rate:supplier===2?'20':'0'});
 await make({price:'3',description:'Tomato sauce? Unmatched ambiguous description',match:false});
 const credited=await make({supplier:2,price:'4',description:'Credited tomatoes',pack:'1',content:'1',unit:'kg'});await make({supplier:2,price:'1',description:'Partial credit for damaged tomatoes',kind:'credit-note',creditForId:credited.id,match:false});
 await make({direction:'sale',price:'100',rate:'20',description:'Synthetic sale',match:false});await make({direction:'sale',price:'80',rate:'20',description:'Prior period synthetic sale',date:'2026-09-15',match:false});
 await prices.command(scope('invoices:read'),{action:'alias',payload:{id:null,supplierId:suppliers[0].id,description:'Tomatoes pack',productId:products[0].id,itemsPerPack:'6',contentPerItem:'500',unit:'g'}},key(),1);
 return {user,session,company,business,invoices,prices,products,suppliers,created,scope,key};
};
