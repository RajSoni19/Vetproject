const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://vetthevat_user:vraj%4019@194.62.248.68:5432/vetthevat_db',
    ssl: false
  });
  await client.connect();
  const procs = await client.query("SELECT routine_schema, routine_name FROM information_schema.routines WHERE routine_schema IN ('web_auth', 'web_business', 'saas', 'public')");
  console.log('Procedures:', procs.rows.map(r => r.routine_schema + '.' + r.routine_name));
  
  const tables = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('web_auth', 'web_business', 'saas')");
  console.log('Tables:', tables.rows.map(r => r.table_schema + '.' + r.table_name));
  
  await client.end();
}
main().catch(console.error);
