import { CleanTelemetryRecord } from '../types/index.js';
import { PgDatabase } from '../db/pg-client.js';
import { randomUUID } from 'crypto';

export class WarehouseRepository {
  private pg = PgDatabase.getInstance();

  public async insertCleanRecord(record: Partial<CleanTelemetryRecord>): Promise<CleanTelemetryRecord> {
    const id = record.id || randomUUID();
    const clean: CleanTelemetryRecord = {
      id,
      device_id: record.device_id || 'UNKNOWN',
      metric_timestamp: record.metric_timestamp || new Date().toISOString(),
      power_kw: record.power_kw ?? 0.0,
      voltage_v: record.voltage_v ?? 230.0,
      temperature_c: record.temperature_c ?? 25.0,
      moisture_pct: record.moisture_pct ?? 45.0,
      frequency_hz: record.frequency_hz ?? 50.0,
      is_healed: record.is_healed ?? false,
      _healed_meta: record._healed_meta ?? null,
      ingested_at: record.ingested_at || new Date().toISOString(),
    };

    const sql = `
      INSERT INTO clean_telemetry_warehouse (
        id, device_id, metric_timestamp, power_kw, voltage_v,
        temperature_c, moisture_pct, frequency_hz, is_healed, _healed_meta, ingested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    await this.pg.query(sql, [
      clean.id,
      clean.device_id,
      clean.metric_timestamp,
      clean.power_kw,
      clean.voltage_v ?? null,
      clean.temperature_c ?? null,
      clean.moisture_pct ?? null,
      clean.frequency_hz ?? null,
      clean.is_healed,
      clean._healed_meta ? JSON.stringify(clean._healed_meta) : null,
      clean.ingested_at,
    ]);

    return clean;
  }

  public async getRecentRecords(limit = 50): Promise<CleanTelemetryRecord[]> {
    const sql = `
      SELECT * FROM clean_telemetry_warehouse
      ORDER BY ingested_at DESC
      LIMIT $1;
    `;

    const res = await this.pg.query(sql, [limit]);
    return res.rows.map((r: any) => ({
      id: r.id,
      device_id: r.device_id,
      metric_timestamp: r.metric_timestamp instanceof Date ? r.metric_timestamp.toISOString() : r.metric_timestamp,
      power_kw: parseFloat(r.power_kw),
      voltage_v: r.voltage_v ? parseFloat(r.voltage_v) : undefined,
      temperature_c: r.temperature_c ? parseFloat(r.temperature_c) : undefined,
      moisture_pct: r.moisture_pct ? parseFloat(r.moisture_pct) : undefined,
      frequency_hz: r.frequency_hz ? parseFloat(r.frequency_hz) : undefined,
      is_healed: Boolean(r.is_healed),
      _healed_meta: r._healed_meta,
      ingested_at: r.ingested_at instanceof Date ? r.ingested_at.toISOString() : r.ingested_at,
    }));
  }

  public async getCount(): Promise<number> {
    const res = await this.pg.query('SELECT COUNT(*) as cnt FROM clean_telemetry_warehouse;');
    return res.rows[0] ? parseInt(res.rows[0].cnt, 10) : 0;
  }

  public async getHealedCount(): Promise<number> {
    const res = await this.pg.query('SELECT COUNT(*) as cnt FROM clean_telemetry_warehouse WHERE is_healed = TRUE;');
    return res.rows[0] ? parseInt(res.rows[0].cnt, 10) : 0;
  }

  public async getFastPathCount(): Promise<number> {
    const res = await this.pg.query('SELECT COUNT(*) as cnt FROM clean_telemetry_warehouse WHERE is_healed = FALSE;');
    return res.rows[0] ? parseInt(res.rows[0].cnt, 10) : 0;
  }

  public async revertByRuleId(ruleId: string): Promise<number> {
    const sql = `
      UPDATE clean_telemetry_warehouse
      SET is_healed = FALSE,
          _healed_meta = NULL,
          power_kw = 0.0
      WHERE is_healed = TRUE 
        AND _healed_meta ->> 'rule_id' = $1;
    `;

    const res = await this.pg.query(sql, [ruleId]);
    return res.rowCount || 0;
  }
}
