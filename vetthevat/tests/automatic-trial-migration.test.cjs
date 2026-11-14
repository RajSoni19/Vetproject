const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {loadModule,parseSync}=require('libpg-query');
const forward=fs.readFileSync('database/migrations/saas/029_automatic_14_day_trial.review.sql','utf8');
const rollback=fs.readFileSync('database/migrations/saas/029_automatic_14_day_trial.rollback.review.sql','utf8');

test('automatic trial migration is target-guarded, transactional, one per verified identity and time limited',()=>{
 assert.match(forward,/current_database\(\)<>'vtv_saas_dev'/);
 assert.match(forward,/host\(inet_server_addr\(\)\)<>'127\.0\.0\.1'/);
 assert.match(forward,/inet_server_port\(\)<>55440/);
 assert.match(forward,/session_user<>'vtv_saas_operator'/);
 assert.match(forward,/actor_id uuid PRIMARY KEY/);
 assert.match(forward,/trial_start=clock_timestamp\(\)/);
 assert.match(forward,/trial_end=trial_start\+interval '14 days'/);
 assert.match(forward,/profile_state='active'/);
 assert.match(forward,/paymentConfirmed',false/);
 assert.match(forward,/trial_expires_at>statement_timestamp\(\)/);
 assert.match(forward,/reports:export/);
 assert.doesNotMatch(forward,/DISABLE ROW LEVEL SECURITY|DROP POLICY|DROP TABLE business\./i);
 assert.doesNotMatch(forward,/CREATE ROLE|ALTER ROLE|PASSWORD/i);
});

test('trial rollback refuses after any trial and preserves business records',()=>{
 assert.match(rollback,/EXISTS\(SELECT 1 FROM saas\.trial_history\)/);
 assert.match(rollback,/trial_started_at IS NOT NULL/);
 assert.doesNotMatch(rollback,/DELETE FROM business\.|TRUNCATE|DROP TABLE business\./i);
 assert.match(rollback,/CREATE OR REPLACE FUNCTION saas\.authorized_company/);
});
test('trial metadata check rejects SQL NULL truth values for partial metadata',()=>{
 assert.match(forward,/trial_status IS NOT NULL AND trial_status IN\('active','expired','converted'\).*trial_expires_at IS NOT NULL/s);
});
test('expiry refresh qualifies the entitlement version column against its billing-account join',()=>{
 assert.match(forward,/UPDATE saas\.subscription_entitlements e SET trial_status='expired',version=e\.version\+1\s+FROM saas\.billing_accounts a/);
});

test('PostgreSQL parser accepts both reviewed SQL scripts without executing them',async()=>{
 await loadModule();
 for(const sql of [forward,rollback])assert.ok(parseSync(sql));
});
