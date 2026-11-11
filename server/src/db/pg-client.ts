import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env
dotenv.config();

const { Pool } = pg;

export class PgDatabase {
  private static instance: PgDatabase;
  public pool: pg.Pool;
  private initialized = false;

  private constructor() {
    this.pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '1234',
      database: process.env.PG_DATABASE || 'fluxheal',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]:', err.message);
    });
  }

  public static getInstance(): PgDatabase {
    if (!PgDatabase.instance) {
      PgDatabase.instance = new PgDatabase();
    }
    return PgDatabase.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.initialized) return;

    try {
      const schemaPath = path.resolve(process.cwd(), 'src', 'db', 'schema.sql');
      let schemaSql = '';

      if (fs.existsSync(schemaPath)) {
        schemaSql = fs.readFileSync(schemaPath, 'utf8');
      } else {
        // Fallback to relative to dist if running compiled
        const distSchemaPath = path.resolve(process.cwd(), 'dist', 'db', 'schema.sql');
        if (fs.existsSync(distSchemaPath)) {
          schemaSql = fs.readFileSync(distSchemaPath, 'utf8');
        } else {
          const directPath = path.resolve(__dirname, 'schema.sql');
          schemaSql = fs.readFileSync(directPath, 'utf8');
        }
      }

      await this.pool.query(schemaSql);
      this.initialized = true;
      console.log('[PostgreSQL] Database schema & DDL initialized successfully.');
    } catch (err: any) {
      console.error('[PostgreSQL] Schema initialization error:', err.message);
      throw err;
    }
  }

  public async resetAllTables(): Promise<void> {
    await this.pool.query(`
      TRUNCATE TABLE 
        clean_telemetry_warehouse, 
        raw_staging_payloads, 
        quarantine_dlq, 
        healing_rules_registry, 
        green_compute_ledger,
        noc_audit_ledger
      CASCADE;
    `);
  }

  public async query(text: string, params?: any[]): Promise<pg.QueryResult> {
    return this.pool.query(text, params);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
