import { GreenLedgerEvent, GreenLedgerTotals } from '../types/index.js';
import { PgDatabase } from '../db/pg-client.js';
import { randomUUID } from 'crypto';

export class GreenMetricsService {
  private static readonly VCPU_WATTS = 12.0;
  private static readonly PUE = 1.2;
  private static readonly GRID_INTENSITY = 475.0; // gCO2 / kWh

  private pg = PgDatabase.getInstance();

  /**
   * Records avoided computation event into PostgreSQL ledger.
   * Real-time calculation from incoming batch and quarantine counts.
   */
  public async recordAvoidedBackfill(
    quarantinedCount = 1,
    batchSize = 1000,
    pipelineMode: 'ETL' | 'ELT' = 'ETL'
  ): Promise<GreenLedgerEvent> {
    const avoidedRows = Math.max(0, batchSize - quarantinedCount);
    
    // Average 1.42ms of CPU compute avoided per healthy row skipped from full backfill
    const cpuMsSaved = avoidedRows * 1.42;
    const cpuHoursSaved = cpuMsSaved / (3600 * 1000);

    // E_Wh = (T_saved_ms / 3,600,000) * P_vCPU * PUE
    const energyWhSaved = cpuHoursSaved * GreenMetricsService.VCPU_WATTS * GreenMetricsService.PUE;

    // C_gCO2e = (E_Wh / 1000) * I_grid
    const co2GramsSaved = (energyWhSaved / 1000.0) * GreenMetricsService.GRID_INTENSITY;

    const event: GreenLedgerEvent = {
      id: randomUUID(),
      event_id: randomUUID(),
      pipeline_mode: pipelineMode,
      total_batch_rows: batchSize,
      quarantined_rows: quarantinedCount,
      avoided_backfill_rows: avoidedRows,
      cpu_ms_saved: Math.round(cpuMsSaved * 100) / 100,
      energy_wh_saved: Math.round(energyWhSaved * 1000) / 1000,
      co2_grams_saved: Math.round(co2GramsSaved * 1000) / 1000,
      recorded_at: new Date().toISOString(),
    };

    const sql = `
      INSERT INTO green_compute_ledger (
        id, event_id, pipeline_mode, total_batch_rows, quarantined_rows,
        avoided_backfill_rows, cpu_ms_saved, energy_wh_saved, co2_grams_saved, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
    `;

    await this.pg.query(sql, [
      event.id,
      event.event_id,
      event.pipeline_mode,
      event.total_batch_rows,
      event.quarantined_rows,
      event.avoided_backfill_rows,
      event.cpu_ms_saved,
      event.energy_wh_saved,
      event.co2_grams_saved,
      event.recorded_at,
    ]);

    return event;
  }

  /**
   * Dynamically aggregates totals from PostgreSQL green_compute_ledger
   */
  public async getTotals(): Promise<GreenLedgerTotals> {
    const sql = `
      SELECT 
        COALESCE(SUM(avoided_backfill_rows), 0) as total_rows,
        COALESCE(SUM(cpu_ms_saved), 0) as total_cpu_ms,
        COALESCE(SUM(energy_wh_saved), 0) as total_energy_wh,
        COALESCE(SUM(co2_grams_saved), 0) as total_co2
      FROM green_compute_ledger;
    `;

    const res = await this.pg.query(sql);
    const row = res.rows[0];

    const totalRows = row ? parseInt(row.total_rows, 10) : 0;
    const totalCpuMs = row ? parseFloat(row.total_cpu_ms) : 0;
    const totalCpuHours = totalCpuMs / (3600 * 1000);
    const totalEnergyWh = row ? parseFloat(row.total_energy_wh) : 0;
    const totalCo2 = row ? parseFloat(row.total_co2) : 0;

    return {
      total_rows_avoided: totalRows,
      total_cpu_hours_saved: Math.round(totalCpuHours * 1000) / 1000,
      total_energy_wh_saved: Math.round(totalEnergyWh * 100) / 100,
      total_co2_grams_saved: Math.round(totalCo2 * 100) / 100,
    };
  }

  public async getRecentLedger(limit = 20): Promise<GreenLedgerEvent[]> {
    const sql = `
      SELECT * FROM green_compute_ledger
      ORDER BY recorded_at DESC
      LIMIT $1;
    `;

    const res = await this.pg.query(sql, [limit]);
    return res.rows.map((r: any) => ({
      id: r.id,
      event_id: r.event_id,
      pipeline_mode: r.pipeline_mode,
      total_batch_rows: r.total_batch_rows,
      quarantined_rows: r.quarantined_rows,
      avoided_backfill_rows: r.avoided_backfill_rows,
      cpu_ms_saved: parseFloat(r.cpu_ms_saved),
      energy_wh_saved: parseFloat(r.energy_wh_saved),
      co2_grams_saved: parseFloat(r.co2_grams_saved),
      recorded_at: r.recorded_at instanceof Date ? r.recorded_at.toISOString() : r.recorded_at,
    }));
  }
}
