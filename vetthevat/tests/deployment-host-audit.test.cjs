const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');

const script=fs.readFileSync('deploy/ubuntu/audit-host-readonly.sh','utf8');

test('shared-host inventory is scoped to read-only commands and never reads environment or key files',()=>{
 assert.match(script,/set -uo pipefail/);
 assert.match(script,/systemctl list-units --type=service --state=running/);
 assert.match(script,/ss -H -ltnp/);
 assert.match(script,/pg_isready -h 127\.0\.0\.1/);
 assert.match(script,/getent ahosts "\$domain"/);
 assert.match(script,/openssl x509 -in "\$certificate" -noout -subject -issuer -dates -ext subjectAltName/);
 assert.match(script,/PM2 CLI installed; its process list was not queried/);
 assert.doesNotMatch(script,/\b(systemctl|service)\s+(start|stop|restart|reload|enable|disable)\b/);
 assert.doesNotMatch(script,/\b(apt|apt-get)\s+(install|upgrade|update|remove|purge)\b/);
 assert.doesNotMatch(script,/\b(npm|pnpm|yarn)\s+(install|add|update|upgrade)\b/);
 assert.doesNotMatch(script,/\b(ufw|iptables|nft)\s+(allow|deny|add|delete|flush|insert|append)\b/);
 assert.doesNotMatch(script,/\b(mkdir|touch|rm|mv|cp|install|chown|chmod|tee)\b/);
 assert.doesNotMatch(script,/\b(psql|pg_dump|pg_restore)\b/);
 assert.doesNotMatch(script,/systemctl\s+show|\/proc\/[^ ]*\/environ|nginx\s+-T|pm2\s+(ls|jlist)|certbot\s+certificates/);
 assert.doesNotMatch(script,/\.env|\.pem|\.key|DATABASE_URL|PASSWORD|SECRET|TOKEN/);
});

test('offline migration inventory covers current forward SQL but cannot authorize a managed bootstrap',()=>{
 const output=execFileSync(process.execPath,['scripts/deployment/migration-inventory.cjs'],{encoding:'utf8'});
 const inventory=JSON.parse(output);
 const files=inventory.sources.map(source=>source.file);
 assert.ok(files.includes('041_invoice_module_review_initializer.review.sql'));
 assert.ok(files.includes('039_ors_live_offers_whatsapp_dispatch.review.sql'));
 assert.ok(files.includes('036_ors_supplier_invoice_lines.review.sql'));
 assert.ok(!files.some(file=>file.includes('.rollback.')));
 assert.ok(!files.some(file=>file.includes('.rehearsal.')));
 assert.equal(inventory.executed,false);
 assert.equal(inventory.managedBootstrapReady,false);
});
