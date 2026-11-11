import { PgDatabase } from '../db/pg-client.js';

async function main() {
  const db = PgDatabase.getInstance();
  try {
    await db.initSchema();
    const res = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    console.log('Tables in PostgreSQL fluxheal database:');
    res.rows.forEach((r) => console.log('  - ' + r.table_name));
  } catch (err: any) {
    console.error('Error initializing DB:', err.message);
  } finally {
    await db.close();
  }
}

main();
