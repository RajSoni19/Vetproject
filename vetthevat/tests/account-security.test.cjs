const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const {reserveInvoiceAllowance,accountUsageSummary}=loadSource('lib/server/account-usage');
const {enforceRequestLimits}=loadSource('lib/server/request-limits');
const {apiV1}=loadSource('lib/server/api-v1');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const period={start:'2026-10-01T00:00:00Z',end:'2026-11-01T00:00:00Z'};
const now=Date.parse('2026-10-20T00:00:00Z');
const resolver={resolve:async(user,company)=>({accountId:id(1),period,active:true,plan:"Starter"})};
// Test double only: verifies the port's expected protocol, NOT database atomicity.
function fixture(initial=0){
  let used=initial; const reservations=new Map();
  return {
    reserve:async input=>{
      const key=`${input.accountId}:${input.period.start}:${input.invoiceId}`;
      if(reservations.has(key))return {allowed:true,used,reserved:reservations.size,reservationId:key};
      if(used+reservations.size>=input.limit)return {allowed:false,used,reserved:reservations.size,reservationId:null};
      reservations.set(key,input.companyId);
      return {allowed:true,used,reserved:reservations.size,reservationId:key};
    },
    commit:async()=>{},release:async()=>{}
  };
}
test('70 invoices in one company leave 30 shared slots for another company',async()=>{
  const ledger=fixture();
  for(let n=1;n<=100;n++){
    const result=await reserveInvoiceAllowance({userId:id(2),companyId:id(n<=70?3:4),invoiceId:id(100+n)},resolver,ledger,now);
    assert.equal(result.usage.remaining,100-n);
  }
  await assert.rejects(reserveInvoiceAllowance({userId:id(2),companyId:id(4),invoiceId:id(201)},resolver,ledger,now),error=>error.status===409);
});
test('repeating an invoice save reserves once; competing final slots do not both pass the atomic port',async()=>{
  const ledger=fixture(99),input={userId:id(2),companyId:id(3),invoiceId:id(5)};
  const first=await reserveInvoiceAllowance(input,resolver,ledger,now);
  const retry=await reserveInvoiceAllowance(input,resolver,ledger,now);
  assert.equal(first.reservationId,retry.reservationId);
  assert.equal(retry.usage.remaining,0);
  const shared=fixture(99);
  const competing=await Promise.allSettled([6,7].map(n=>reserveInvoiceAllowance({...input,invoiceId:id(n)},resolver,shared,now)));
  assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
});
test('unconfigured quota and unverifiable ownership/period/store output fail closed',async()=>{
  const input={userId:id(2),companyId:id(3),invoiceId:id(5)};
  await assert.rejects(reserveInvoiceAllowance(input,undefined,fixture(),now),error=>error.status===503);
  await assert.rejects(reserveInvoiceAllowance(input,{resolve:async()=>null},fixture(),now),error=>error.status===403);
  await assert.rejects(reserveInvoiceAllowance(input,resolver,fixture(),Date.parse(period.end)),error=>error.status===503);
  const bad={reserve:async()=>({allowed:true,used:100,reserved:1,reservationId:'x'})};
  await assert.rejects(reserveInvoiceAllowance(input,resolver,bad,now),error=>error.status===503);
  assert.throws(()=>accountUsageSummary(100,-1),error=>error.status===503);
});
test('billing period comes from the trusted account resolver rather than the selected company or client',async()=>{
  let actual;
  const ledger={reserve:async input=>{actual=input;return {allowed:true,used:0,reserved:1,reservationId:'r'};}};
  const november={start:'2026-11-01T00:00:00Z',end:'2026-12-01T00:00:00Z'};
  await reserveInvoiceAllowance({userId:id(2),companyId:id(4),invoiceId:id(5)},{resolve:async()=>({accountId:id(1),period:november,active:true,plan:"Starter"})},ledger,Date.parse(november.start));
  assert.equal(actual.accountId,id(1));assert.equal(actual.limit,100);assert.deepEqual(actual.period,november);
});
test('rate limits require a shared store and return 429, Retry-After and non-cacheable errors',async()=>{
  const buckets=[{key:'account:trusted-id',limit:10,windowMs:60000},{key:'ip:trusted-address',limit:30,windowMs:60000}];
  await assert.rejects(enforceRequestLimits(undefined,buckets),error=>error.status===503);
  let received;
  const response=await apiV1(()=>enforceRequestLimits({consume:async value=>{received=value;return {allowed:false,retryAfterSeconds:23};}},buckets));
  assert.deepEqual(received,buckets);
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'23');
  assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(response.headers.get('x-request-id'));
  assert.equal((await response.json()).error.code,'RATE_LIMITED');
  await assert.rejects(enforceRequestLimits({consume:async()=>({allowed:true,retryAfterSeconds:0})},[{key:'x',limit:0,windowMs:60000}]),error=>error.status===503);
});
