const test=require('node:test');const assert=require('node:assert/strict');const {loadSource}=require('./load-source.cjs');
const {orsFixtures,requestMaterial,approveRequest,placeOrder,receiveOrder}=loadSource('tests/fixtures/ors-workflow');
test('ORS fixture workflow: approve, order, partial receive, balance, immutable history and no over-receiving',()=>{
  let state=orsFixtures();const original=state;
  state=requestMaterial(state,'material-steel',5,'request-1');assert.equal(original.requests.length,0);
  assert.throws(()=>placeOrder(state,'request-1'));
  state=approveRequest(state,'request-1');state=placeOrder(state,'request-1');assert.throws(()=>placeOrder(state,'request-1'));
  state=receiveOrder(state,'order-request-1',2,'receipt-1');assert.equal(state.orders[0].status,'open');assert.throws(()=>receiveOrder(state,'order-request-1',4,'receipt-2'));
  state=receiveOrder(state,'order-request-1',3,'receipt-2');assert.equal(state.orders[0].status,'received');assert.equal(state.movements.reduce((sum,row)=>sum+row.quantity,0),5);assert.equal(state.history.length,5);assert.equal(state.orders[0].vatInvoiceId,null);
  assert.throws(()=>receiveOrder(state,'order-request-1',1,'receipt-3'));
});
test('ORS fixtures reject foreign materials and fractional/nonfinite/negative quantities',()=>{
  for(const qty of [-1,0,NaN,Infinity,1.5,10001])assert.throws(()=>requestMaterial(orsFixtures(),'material-steel',qty,'r'));
  assert.throws(()=>requestMaterial(orsFixtures(),'foreign-material',1,'r'));
});
