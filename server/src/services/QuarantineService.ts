import { QuarantineRecord, QuarantineStatus } from '../types/index.js';
import { PgDatabase } from '../db/pg-client.js';
import { randomUUID } from 'crypto';

export class QuarantineService {
  private pg = PgDatabase.getInstance();

  public async addRecord(record: Omit<QuarantineRecord, 'id' | 'quarantined_at'>): Promise<QuarantineRecord> {
    const id = randomUUID();
    const quarantined_at = new Date().toISOString();
    const entry: QuarantineRecord = {
      ...record,
      id,
      quarantined_at,
    };

    const sql = `
      INSERT INTO quarantine_dlq (
        id, source_connector, raw_payload, healed_payload, anomaly_type,
        error_message, status, confidence_score, applied_rule_id, quarantined_at, resolved_at
      ) VALUES ($1, $2, $3, $4, $5::anomaly_category, $6, $7::quarantine_status, $8, $9, $10, $11)
      RETURNING *;
    `;

    await this.pg.query(sql, [
      entry.id,
      entry.source_connector,
      JSON.stringify(entry.raw_payload),
      entry.healed_payload ? JSON.stringify(entry.healed_payload) : null,
      entry.anomaly_type,
      entry.error_message,
      entry.status,
      entry.confidence_score ?? null,
      entry.applied_rule_id ?? null,
      entry.quarantined_at,
      entry.resolved_at ?? null,
    ]);

    return entry;
  }

  public async getRecord(id: string): Promise<QuarantineRecord | undefined> {
    const sql = 'SELECT * FROM quarantine_dlq WHERE id = $1;';
    const res = await this.pg.query(sql, [id]);
    const row = res.rows[0];
    if (!row) return undefined;

    return {
      id: row.id,
      source_connector: row.source_connector,
      raw_payload: row.raw_payload,
      healed_payload: row.healed_payload,
      anomaly_type: row.anomaly_type,
      error_message: row.error_message,
      status: row.status as QuarantineStatus,
      confidence_score: row.confidence_score ? parseFloat(row.confidence_score) : null,
      applied_rule_id: row.applied_rule_id,
      quarantined_at: row.quarantined_at instanceof Date ? row.quarantined_at.toISOString() : row.quarantined_at,
      resolved_at: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
    };
  }

  public async updateStatus(
    id: string,
    status: QuarantineStatus,
    healedPayload?: Record<string, any>,
    ruleId?: string,
    confidence?: number
  ): Promise<QuarantineRecord | undefined> {
    const resolved_at = (status === 'AUTO_HEALED' || status === 'REVERTED') ? new Date().toISOString() : null;

    const sql = `
      UPDATE quarantine_dlq
      SET status = $1::quarantine_status,
          healed_payload = COALESCE($2::jsonb, healed_payload),
          applied_rule_id = COALESCE($3::uuid, applied_rule_id),
          confidence_score = COALESCE($4::numeric, confidence_score),
          resolved_at = COALESCE($5::timestamptz, resolved_at)
      WHERE id = $6
      RETURNING *;
    `;

    await this.pg.query(sql, [
      status,
      healedPayload ? JSON.stringify(healedPayload) : null,
      ruleId ?? null,
      confidence ?? null,
      resolved_at,
      id,
    ]);

    return this.getRecord(id);
  }

  public async getRecent(limit = 20): Promise<QuarantineRecord[]> {
    const sql = `
      SELECT * FROM quarantine_dlq
      ORDER BY quarantined_at DESC
      LIMIT $1;
    `;

    const res = await this.pg.query(sql, [limit]);
    return res.rows.map((row: any) => ({
      id: row.id,
      source_connector: row.source_connector,
      raw_payload: row.raw_payload,
      healed_payload: row.healed_payload,
      anomaly_type: row.anomaly_type,
      error_message: row.error_message,
      status: row.status as QuarantineStatus,
      confidence_score: row.confidence_score ? parseFloat(row.confidence_score) : null,
      applied_rule_id: row.applied_rule_id,
      quarantined_at: row.quarantined_at instanceof Date ? row.quarantined_at.toISOString() : row.quarantined_at,
      resolved_at: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
    }));
  }

  public async getCount(): Promise<number> {
    const res = await this.pg.query('SELECT COUNT(*) as cnt FROM quarantine_dlq;');
    return res.rows[0] ? parseInt(res.rows[0].cnt, 10) : 0;
  }

  public async getPendingHitl(): Promise<QuarantineRecord[]> {
    const sql = "SELECT * FROM quarantine_dlq WHERE status = 'PENDING_HITL';";
    const res = await this.pg.query(sql);
    return res.rows.map((row: any) => ({
      id: row.id,
      source_connector: row.source_connector,
      raw_payload: row.raw_payload,
      healed_payload: row.healed_payload,
      anomaly_type: row.anomaly_type,
      error_message: row.error_message,
      status: row.status as QuarantineStatus,
      confidence_score: row.confidence_score ? parseFloat(row.confidence_score) : null,
      applied_rule_id: row.applied_rule_id,
      quarantined_at: row.quarantined_at instanceof Date ? row.quarantined_at.toISOString() : row.quarantined_at,
      resolved_at: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
    }));
  }
}
