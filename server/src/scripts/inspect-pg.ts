import { PgDatabase } from '../db/pg-client.js';

async function main() {
  const db = PgDatabase.getInstance();
  try {
    const warehouseRes = await db.query(
      "SELECT id, device_id, power_kw, is_healed, _healed_meta->>'method' as method, ingested_at FROM clean_telemetry_warehouse ORDER BY ingested_at DESC LIMIT 5;"
    );
    console.log('--- Real PostgreSQL clean_telemetry_warehouse ---');
    console.table(warehouseRes.rows);

    const greenRes = await db.query(
      "SELECT event_id, pipeline_mode, total_batch_rows, avoided_backfill_rows, co2_grams_saved, recorded_at FROM green_compute_ledger ORDER BY recorded_at DESC LIMIT 5;"
    );
    console.log('--- Real PostgreSQL green_compute_ledger ---');
    console.table(greenRes.rows);

    const rulesRes = await db.query(
      "SELECT id, source_signature, anomaly_category, times_triggered, is_active FROM healing_rules_registry ORDER BY created_at DESC;"
    );
    console.log('--- Real PostgreSQL healing_rules_registry ---');
    console.table(rulesRes.rows);
  } catch (err: any) {
    console.error(err.message);
  } finally {
    await db.close();
  }
}

main();
