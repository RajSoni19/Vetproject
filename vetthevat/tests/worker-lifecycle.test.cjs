const test=require('node:test'),assert=require('node:assert/strict');
// Load actual workerLoop TypeScript through the existing source test loader.
const {loadSource}=require('./load-source.cjs'),{workerLoop}=loadSource('lib/server/worker-loop');
test('independent worker loop stops claiming after graceful cancellation',async()=>{const abort=new AbortController(),states=[];let claims=0;await workerLoop(async()=>{claims++;return {state:'idle'};},{signal:abort.signal,delayMs:1,record:state=>{states.push(state);abort.abort();}});assert.equal(claims,1);assert.deepEqual(states,['idle']);});
test('worker failures exit for supervisor recovery without automatically replaying an uncertain operation',async()=>{const states=[];let claims=0;await assert.rejects(workerLoop(async()=>{claims++;throw Error('synthetic-private-error');},{signal:new AbortController().signal,delayMs:1,record:state=>states.push(state)}),/lease recovery/);assert.equal(claims,1);assert.deepEqual(states,['error']);});
