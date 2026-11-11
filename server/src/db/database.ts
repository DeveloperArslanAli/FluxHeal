import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'fluxheal.db');

export class FluxHealDatabase {
  private static instance: FluxHealDatabase;
  public db: DatabaseSync;

  private constructor(inMemory = false) {
    this.db = new DatabaseSync(inMemory ? ':memory:' : DB_PATH);
    this.initPragmas();
    this.initSchema();
  }

  public static getInstance(inMemory = false): FluxHealDatabase {
    if (!FluxHealDatabase.instance) {
      FluxHealDatabase.instance = new FluxHealDatabase(inMemory);
    }
    return FluxHealDatabase.instance;
  }

  private initPragmas() {
    try {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA busy_timeout = 5000;');
    } catch {
      // ignore in-memory pragma errors
    }
  }

  public resetAllTables(): void {
    this.db.exec(`
      DELETE FROM clean_telemetry_warehouse;
      DELETE FROM raw_staging_payloads;
      DELETE FROM quarantine_dlq;
      DELETE FROM healing_rules_registry;
      DELETE FROM green_compute_ledger;
      DELETE FROM noc_audit_ledger;
    `);
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clean_telemetry_warehouse (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        metric_timestamp TEXT NOT NULL,
        power_kw REAL NOT NULL,
        voltage_v REAL,
        temperature_c REAL,
        moisture_pct REAL,
        frequency_hz REAL,
        is_healed INTEGER DEFAULT 0,
        healed_meta TEXT,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS raw_staging_payloads (
        batch_id TEXT NOT NULL,
        row_id TEXT PRIMARY KEY,
        source_connector TEXT NOT NULL,
        emissions REAL NOT NULL,
        power_consumed REAL NOT NULL,
        raw_payload TEXT NOT NULL,
        processed INTEGER DEFAULT 0,
        received_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quarantine_dlq (
        id TEXT PRIMARY KEY,
        source_connector TEXT NOT NULL,
        raw_payload TEXT NOT NULL,
        healed_payload TEXT,
        anomaly_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        status TEXT DEFAULT 'ISOLATED',
        confidence_score REAL,
        applied_rule_id TEXT,
        quarantined_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS healing_rules_registry (
        id TEXT PRIMARY KEY,
        source_signature TEXT UNIQUE NOT NULL,
        anomaly_category TEXT NOT NULL,
        rule_definition TEXT NOT NULL,
        sql_patch_template TEXT,
        confidence_score REAL NOT NULL,
        times_triggered INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS green_compute_ledger (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        pipeline_mode TEXT NOT NULL,
        total_batch_rows INTEGER NOT NULL,
        quarantined_rows INTEGER NOT NULL,
        avoided_backfill_rows INTEGER NOT NULL,
        cpu_ms_saved REAL NOT NULL,
        energy_wh_saved REAL NOT NULL,
        co2_grams_saved REAL NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_warehouse_device ON clean_telemetry_warehouse(device_id, metric_timestamp);
      CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine_dlq(status);
      CREATE INDEX IF NOT EXISTS idx_rules_sig ON healing_rules_registry(source_signature);

      CREATE TABLE IF NOT EXISTS noc_audit_ledger (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_snapshot TEXT,
        metadata TEXT,
        ip_address TEXT,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_noc_audit_actor ON noc_audit_ledger(actor_id);
    `);
  }
}
