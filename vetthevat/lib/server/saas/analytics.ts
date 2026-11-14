import {ApiError,uuid} from "@/lib/server/api-v1";
import {vatPeriod,money} from "@/lib/server/saas/vat";
import {text} from "@/lib/server/saas/invoice-contracts";
import {pricesEnabled} from "@/lib/server/procurement/service";
import type {CompanyDatabase,CompanyScope} from "@/lib/server/saas/transactions";
import {invoiceSoftDeleteEnabled} from "@/lib/server/saas/invoice-soft-delete";
export function analyticsFilters(search:URLSearchParams){for(const k of search.keys())if(!['startsOn','endsOn','currency','supplierId','productId','query','after','format','direction','period'].includes(k)||search.getAll(k).length!==1)throw new ApiError(400,'INVALID_REQUEST','Invalid analytics filter.');const direction=search.get('direction'),allTime=search.get('period')==='all-time';if(search.has('period')&&(!allTime||search.get('startsOn')!=='2000-01-01'))throw new ApiError(400,'INVALID_REQUEST','Invalid analytics period.');if(direction!==null&&!['purchase','sale'].includes(direction))throw new ApiError(400,'INVALID_REQUEST','Invalid invoice direction.');const period=vatPeriod({startsOn:search.get('startsOn'),endsOn:search.get('endsOn'),currency:search.get('currency')},allTime?73050:366),days=Math.round((Date.parse(period.endsOn)-Date.parse(period.startsOn))/86400000)+1,format=search.get('format');if(format&&!['csv','xlsx'].includes(format)||format&&search.has('after'))throw new ApiError(400,'INVALID_REQUEST','Invalid export selection.');return {...period,direction,previousStartsOn:new Date(Date.parse(period.startsOn)-days*86400000).toISOString().slice(0,10),previousEndsOn:new Date(Date.parse(period.startsOn)-86400000).toISOString().slice(0,10),supplierId:search.has('supplierId')?uuid(search.get('supplierId')):null,productId:search.has('productId')?uuid(search.get('productId')):null,query:text(search.get('query'),200),after:search.has('after')?uuid(search.get('after')):null,format};}
export const metricDictionary={
 procurementSpend:'SUM confirmed purchase net, including signed credit notes, by invoice date and selected currency. This is recorded procurement, not cost of goods sold.',
 revenue:'SUM confirmed sales net, including signed credit notes, by invoice date and selected currency.',
 inputVat:'SUM confirmed purchase VAT. Management review figure; not a legal claim or recoverability determination.',
 outputVat:'SUM confirmed sales VAT. Management figure, not an HMRC submission.',
 potentialVat:'Recorded output VAT less recorded input VAT. No entitlement or claim is implied.',
 invoiceCount:'COUNT confirmed invoice and credit-note records. Drafts are counted separately.',
 allocated:'SUM manual payments recorded for selected invoice IDs through the report end date. Not multiplied by line joins.',
 outstanding:'For each ordinary invoice, MAX(0, gross minus confirmed linked credits and manual payment records).',
 previousPeriod:'Equal-length immediately preceding period with identical invoice filters. Missing prior evidence is unavailable, not zero.',
 inventory:'Current quantities by material and its recorded unit. No summed mixed units, inventory valuation or COGS inferred.',
 margin:'Unavailable: reliable COGS and full operating-expense attribution are absent. No net profit is claimed.'
};
const decimal=(v:unknown)=>v===null||v===undefined?null:BigInt(String(v).replace('.',''));
function delta(current:unknown,previous:unknown){const a=decimal(current),b=decimal(previous);if(a===null||b===null)return null;const percent=b>BigInt(0)?(a-b)*BigInt(10000)/b:null,absolute=percent===null?null:percent<BigInt(0)?-percent:percent;return {amount:money(a-b),percent:absolute===null?null:(percent!<BigInt(0)?'-':'')+String(absolute/BigInt(100))+'.'+String(absolute%BigInt(100)).padStart(2,'0')};}
export function analyticsService(database:CompanyDatabase){return {read(scope:CompanyScope,search:URLSearchParams){const f=analyticsFilters(search),exporting=Boolean(f.format);if(scope.permission!==(exporting?'reports:export':'reports:read'))throw new ApiError(403,'FORBIDDEN','Analytics permission required.');if(f.productId&&!pricesEnabled(process.env))throw new ApiError(503,'UNAVAILABLE','Product matching schema is not enabled.');return database.scoped({...scope,snapshot:true},async tx=>{
 const liveFilter=invoiceSoftDeleteEnabled(process.env)?" AND i.deleted_at IS NULL":"";
 const values=[tx.companyId,f.previousStartsOn,f.endsOn,f.currency,f.supplierId,f.query,f.startsOn,f.previousEndsOn,f.after,f.productId,f.direction];
 const productClause=f.productId?'AND EXISTS(SELECT 1 FROM price_intelligence.line_matches m WHERE m.company_id=i.company_id AND m.invoice_id=i.id AND m.product_id=$10::uuid)':'AND ($10::uuid IS NULL)';
 const base=`SELECT i.* FROM business.invoices i WHERE i.company_id=$1${liveFilter} AND i.issued_on BETWEEN $2::date AND $3::date AND i.currency=$4 AND ($5::uuid IS NULL OR i.contact_id=$5) AND ($6::text IS NULL OR strpos(lower(i.number||' '||coalesce(i.contact_snapshot->>'name','')),lower($6))>0) ${productClause} AND ($11::text IS NULL OR i.direction=$11)`;
 const row=(await tx.query(`WITH base AS MATERIALIZED (${base}),current AS (SELECT * FROM base WHERE issued_on >= $7::date),verified AS(SELECT * FROM current WHERE state='confirmed'),prior AS(SELECT * FROM base WHERE issued_on<=$8::date AND state='confirmed'),page AS(SELECT id::text,number,issued_on::text,direction,kind,state,currency,contact_id::text,contact_snapshot->>'name' AS contact,net::text,vat::text,gross::text FROM current WHERE state='confirmed' AND ($9::uuid IS NULL OR id>$9) ORDER BY id LIMIT ${exporting?5001:51})
 SELECT (SELECT jsonb_build_object('invoiceCount',count(*)::text,'procurementSpend',sum(net) FILTER(WHERE direction='purchase')::text,'revenue',sum(net) FILTER(WHERE direction='sale')::text,'inputVat',sum(vat) FILTER(WHERE direction='purchase')::text,'outputVat',sum(vat) FILTER(WHERE direction='sale')::text) FROM verified) AS metrics,
 (SELECT jsonb_build_object('procurementSpend',sum(net) FILTER(WHERE direction='purchase')::text,'revenue',sum(net) FILTER(WHERE direction='sale')::text) FROM prior) AS previous,
 (SELECT count(*)::text FROM current WHERE state='draft') AS pending,(SELECT count(*)::text FROM current WHERE state='confirmed') AS record_count,
 coalesce((SELECT jsonb_agg(page ORDER BY id) FROM page),'[]') AS records,
 coalesce((SELECT jsonb_agg(t ORDER BY t.period,t.direction) FROM (SELECT to_char(issued_on,'YYYY-MM') AS period,direction,sum(net)::text AS net,sum(vat)::text AS vat,count(*)::text AS invoices FROM verified GROUP BY 1,2) t),'[]') AS timeline,
 coalesce((SELECT jsonb_agg(s ORDER BY s.total::numeric DESC) FROM (SELECT contact_id::text AS id,max(contact_snapshot->>'name') AS name,sum(net)::text AS total,count(*)::text AS invoices FROM verified WHERE direction='purchase' GROUP BY contact_id ORDER BY sum(net) DESC LIMIT 30) s),'[]') AS suppliers`,values)).rows[0];
 if(!row||!Array.isArray(row.records))throw new ApiError(503,'UNAVAILABLE','Analytics receipt unavailable.');
 if(exporting&&BigInt(String(row.record_count))>BigInt(5000))throw new ApiError(400,'INVALID_REQUEST','Narrow exports to 5000 invoices.');
 const metrics=row.metrics as Record<string,unknown>,previous=row.previous as Record<string,unknown>,count=String(metrics.invoiceCount),input=decimal(metrics.inputVat),output=decimal(metrics.outputVat);
 const auth=(await tx.query("SELECT saas.authorized_company($1,'inventory:read') AS inventory,saas.authorized_company($1,'procurement:read') AS procurement,saas.authorized_company($1,'sales:read') AS sales",[tx.companyId])).rows[0];
 // Invoice filters cannot be silently projected onto unrelated raw cash/orders.
 const broad=!f.supplierId&&!f.productId&&!f.query&&!f.direction;let allocations=null,orders=null,inventory=null;
 const selected=(await tx.query(`WITH selected AS (${base}) SELECT i.id::text,i.gross::text,(SELECT coalesce(-sum(c.gross),0)::text FROM business.invoices c WHERE c.company_id=i.company_id AND c.credit_for_id=i.id AND c.state='confirmed' AND c.issued_on<=$3::date) AS credits FROM selected i WHERE i.issued_on>=$7::date AND i.state='confirmed' AND i.kind='invoice' AND ($8::text IS NULL OR true) AND ($9::text IS NULL OR true) LIMIT 5001`,values)).rows;
 const paymentSchemaReady=(await tx.query("SELECT to_regclass('business.invoice_payments') IS NOT NULL AS ready")).rows[0]?.ready===true;
 const manualPayments=paymentSchemaReady?(await tx.query(`SELECT p.invoice_id::text,upper(btrim(p.transaction_reference)) AS reference,sum(p.amount)::numeric(14,2)::text AS amount
   FROM business.invoice_payments p JOIN jsonb_to_recordset($2::jsonb) AS i(id uuid) ON i.id=p.invoice_id
   WHERE p.company_id=$1 AND p.paid_on<=$3::date
   GROUP BY p.invoice_id,upper(btrim(p.transaction_reference))`,[tx.companyId,JSON.stringify(selected),f.endsOn])).rows:[];
 if(selected.length<=5000)allocations=(await tx.query(`WITH amounts AS(
    SELECT i.id,i.gross,i.credits
    FROM jsonb_to_recordset($1::jsonb) AS i(id uuid,gross numeric,credits numeric)
  ), manual AS(
    SELECT invoice_id,sum(amount)::numeric(20,2) AS amount FROM jsonb_to_recordset($2::jsonb)
     AS p(invoice_id uuid,reference text,amount numeric) GROUP BY invoice_id
  )
  SELECT count(*)::text AS invoices,coalesce(sum(m.amount),0)::numeric(20,2)::text AS allocated,
   sum(greatest(0,a.gross-a.credits-coalesce(m.amount,0)))::numeric(20,2)::text AS outstanding
  FROM amounts a LEFT JOIN manual m ON m.invoice_id=a.id`,
  [JSON.stringify(selected),JSON.stringify(manualPayments)])).rows[0];
 if(broad&&auth?.procurement&&auth?.sales)orders={purchase:(await tx.query('SELECT state,count(*)::text AS count FROM operations.purchase_orders WHERE company_id=$1 AND ordered_on BETWEEN $2::date AND $3::date GROUP BY state ORDER BY state',[tx.companyId,f.startsOn,f.endsOn])).rows,sales:(await tx.query('SELECT state,count(*)::text AS count FROM operations.sales_orders WHERE company_id=$1 AND ordered_on BETWEEN $2::date AND $3::date GROUP BY state ORDER BY state',[tx.companyId,f.startsOn,f.endsOn])).rows};
 if(broad&&auth?.inventory)inventory=(await tx.query("SELECT m.id::text,m.name,m.unit,m.reorder_point::text,sum(b.on_hand)::text AS on_hand,sum(b.on_hand-b.reserved)::text AS available,CASE WHEN count(b.material_id)=0 THEN NULL ELSE sum(b.on_hand-b.reserved)<=m.reorder_point END AS low_stock FROM operations.materials m LEFT JOIN operations.stock_balances b ON b.company_id=m.company_id AND b.material_id=m.id WHERE m.company_id=$1 AND m.state='active' GROUP BY m.id ORDER BY m.name LIMIT 100",[tx.companyId])).rows;
 const filterOptions={suppliers:(await tx.query("SELECT id::text,name FROM business.counterparties WHERE company_id=$1 AND kind='supplier' ORDER BY name LIMIT 500",[tx.companyId])).rows,products:pricesEnabled(process.env)?(await tx.query('SELECT id::text,name,variant FROM price_intelligence.products WHERE company_id=$1 ORDER BY name LIMIT 500',[tx.companyId])).rows:[]};
 const items=(row.records as Record<string,unknown>[]).slice(0,exporting?5000:50);return {filters:f,filterOptions,metrics:{...metrics,pending:String(row.pending),potentialVat:count==='0'?null:money((output??BigInt(0))-(input??BigInt(0))),grossProfit:null,netProfit:null,margin:null},previous,changes:{revenue:delta(metrics.revenue,previous.revenue),procurementSpend:delta(metrics.procurementSpend,previous.procurementSpend)},timeline:row.timeline,suppliers:row.suppliers,records:items,recordCount:String(row.record_count),after:!exporting&&row.records.length>50?String(items.at(-1)?.id):null,allocations,orders,inventory,metricDictionary,scopeNotes:{orders:'Non-monetary order counts by order date; orders have no currency field. Hidden when invoice-only filters are selected.',inventory:'Current snapshot, per recorded unit; not a historical valuation. Hidden when invoice-only filters are selected.',product:'Product filters select whole invoices containing a verified matched product; invoice KPIs include the whole selected invoice.',market:'Insufficient market data. Cross-company sharing is disabled.'}};
 });}};}
