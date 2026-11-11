import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '1234',
  database: 'postgres',
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully!');
    const versionRes = await client.query('SELECT version();');
    console.log('Postgres Version:', versionRes.rows[0].version);

    const dbCheck = await client.query("SELECT 1 FROM pg_database WHERE datname = 'fluxheal'");
    if (dbCheck.rows.length === 0) {
      await client.query('CREATE DATABASE fluxheal;');
      console.log('Database "fluxheal" created successfully!');
    } else {
      console.log('Database "fluxheal" already exists.');
    }
  } catch (err) {
    console.error('PostgreSQL Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
