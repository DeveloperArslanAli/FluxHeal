import { PgDatabase } from '../db/pg-client.js';
import { GreenMetricsService } from './GreenMetricsService.js';
import { HealerService } from './HealerService.js';
import { randomUUID } from 'crypto';

export interface EltExecutionResult {
  success: boolean;
  healed: boolean;
  rowsProcessed: number;
  patchedSql?: string;
  ruleApplied?: string;
  avoidedRows: number;
}

export class EltWarehouseService {
  private pg = PgDatabase.getInstance();

  constructor(
    private readonly healer: HealerService,
    private readonly greenMetrics: GreenMetricsService
  ) {}

  /**
   * Seeds real staging payloads for an ELT analytical run using bulk PostgreSQL insert.
   */
  public async seedStagingBatch(batchId: string, count = 1000): Promise<void> {
    const client = await this.pg.pool.connect();
    try {
      await client.query('BEGIN');

      const sql = `
        INSERT INTO raw_staging_payloads (
          batch_id, row_id, source_connector, emissions, power_consumed, raw_payload, processed, received_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE, NOW());
      `;

      for (let i = 0; i < count; i++) {
        const rowId = randomUUID();
        const isZero = i === Math.floor(count / 2);
        const emissions = 120.0 + (i % 30);
        const powerConsumed = isZero ? 0.0 : 45.0 + (i % 25);
        const rawPayload = JSON.stringify({ device: `INV-${i}`, emissions, power_consumed: powerConsumed });

        await client.query(sql, [batchId, rowId, 'elt-staging', emissions, powerConsumed, rawPayload]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Real Transactional ELT Warehouse SQL Execution with PostgreSQL SAVEPOINT Patching
   */
  public async executeAndHealEltQuery(batchId: string, brokenSql: string): Promise<EltExecutionResult> {
    const client = await this.pg.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SAVEPOINT elt_execution');

      let executionSuccess = false;
      let rows: any[] = [];

      try {
        // Direct query attempt (triggers division-by-zero SQLSTATE 22012 when power_consumed = 0)
        const res = await client.query(brokenSql, [batchId]);
        rows = res.rows;
        executionSuccess = true;
        await client.query('RELEASE SAVEPOINT elt_execution');
        await client.query('COMMIT');

        return {
          success: true,
          healed: false,
          rowsProcessed: rows.length,
          avoidedRows: 0,
        };
      } catch (pgError: any) {
        // Intercept PostgreSQL SQLSTATE 22012 (division_by_zero) or check error
        // 2. Rollback strictly to transaction savepoint (preserving connection & transaction block)
        await client.query('ROLLBACK TO SAVEPOINT elt_execution');

        // 3. Healer AST agent rewrites the broken query with NULLIF
        const patch = this.healer.patchSqlQuery(brokenSql, pgError.code || '22012');

        // 4. Retry inside new verified savepoint
        await client.query('SAVEPOINT elt_healed_retry');
        const healedRes = await client.query(patch.patchedSql, [batchId]);
        await client.query('RELEASE SAVEPOINT elt_healed_retry');

        // 5. Mark staging batch as processed
        await client.query('UPDATE raw_staging_payloads SET processed = TRUE WHERE batch_id = $1;', [batchId]);
        await client.query('COMMIT');

        // 6. Record avoided backfill in green ledger
        const greenEvent = await this.greenMetrics.recordAvoidedBackfill(1, healedRes.rows.length, 'ELT');

        return {
          success: true,
          healed: true,
          rowsProcessed: healedRes.rows.length,
          patchedSql: patch.patchedSql,
          ruleApplied: patch.rule,
          avoidedRows: greenEvent.avoided_backfill_rows,
        };
      }
    } finally {
      client.release();
    }
  }
}
