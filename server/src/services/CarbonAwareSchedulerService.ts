import { GridCarbonStatus, DeferredEltBatch } from '../types/index.js';
import { GreenMetricsService } from './GreenMetricsService.js';

export interface CarbonSchedulerOptions {
  region?: string;
  thresholdGco2?: number;
  initialIntensityGco2?: number;
  deferralActive?: boolean;
}

export type CarbonEventCallback = (eventName: string, data: any) => void;

export class CarbonAwareSchedulerService {
  private region: string;
  private currentIntensityGco2: number;
  private thresholdGco2: number;
  private deferralActive: boolean;
  private deferredBatches: DeferredEltBatch[] = [];
  private emitEvent: CarbonEventCallback | null = null;
  private totalCarbonSavedByDeferralGrams = 0;

  constructor(
    private readonly greenMetrics: GreenMetricsService,
    options: CarbonSchedulerOptions = {}
  ) {
    this.region = options.region ?? 'CAISO-CALIFORNIA';
    this.thresholdGco2 = options.thresholdGco2 ?? 300; // 300 gCO2/kWh threshold
    this.currentIntensityGco2 = options.initialIntensityGco2 ?? 425; // Default peak dirty state for demo
    this.deferralActive = options.deferralActive ?? true;
  }

  public setEventCallback(cb: CarbonEventCallback): void {
    this.emitEvent = cb;
  }

  public getStatus(): GridCarbonStatus {
    const isClean = this.currentIntensityGco2 <= this.thresholdGco2;
    const totalRows = this.deferredBatches.reduce((acc, b) => acc + b.recordCount, 0);

    return {
      region: this.region,
      currentIntensityGco2: this.currentIntensityGco2,
      status: isClean ? 'CLEAN_WINDOW' : 'PEAK_DIRTY',
      solarSurplus: this.currentIntensityGco2 < 200,
      updatedAt: new Date().toISOString(),
      deferralActive: this.deferralActive,
      thresholdGco2: this.thresholdGco2,
      deferredBatchCount: this.deferredBatches.length,
      totalDeferredRows: totalRows,
    };
  }

  public setGridIntensity(intensityGco2: number): GridCarbonStatus {
    this.currentIntensityGco2 = Math.max(50, Math.min(800, intensityGco2));
    const status = this.getStatus();

    if (this.emitEvent) {
      this.emitEvent('grid:intensity_update', status);
    }
    return status;
  }

  public setDeferralActive(active: boolean): GridCarbonStatus {
    this.deferralActive = active;
    const status = this.getStatus();

    if (this.emitEvent) {
      this.emitEvent('grid:intensity_update', status);
    }
    return status;
  }

  public shouldDefer(): boolean {
    return this.deferralActive && this.currentIntensityGco2 > this.thresholdGco2;
  }

  /**
   * Enqueues an analytical ELT batch during high-carbon grid peak
   */
  public enqueueBatch(batchId: string, recordCount: number, sourceConnector = 'elt-staging'): DeferredEltBatch {
    // 1000 rows ~ 0.05 kWh of compute
    const estimatedEnergyKwh = Math.round((recordCount * 0.00005) * 10000) / 10000;

    const deferred: DeferredEltBatch = {
      batchId,
      enqueuedAt: new Date().toISOString(),
      recordCount,
      sourceConnector,
      estimatedEnergyKwh,
      peakIntensityGco2: this.currentIntensityGco2,
    };

    this.deferredBatches.push(deferred);

    if (this.emitEvent) {
      this.emitEvent('carbon:batch_deferred', {
        batch: deferred,
        status: this.getStatus(),
      });
    }

    return deferred;
  }

  /**
   * Flushes deferred batches when grid carbon intensity drops into clean window
   */
  public async flushDeferredBatches(
    executor: (batch: DeferredEltBatch) => Promise<any>
  ): Promise<{
    executedCount: number;
    totalRowsProcessed: number;
    carbonGramsSaved: number;
    results: any[];
  }> {
    if (this.deferredBatches.length === 0) {
      return { executedCount: 0, totalRowsProcessed: 0, carbonGramsSaved: 0, results: [] };
    }

    const batchesToRun = [...this.deferredBatches];
    this.deferredBatches = [];

    let totalRows = 0;
    let carbonSaved = 0;
    const results = [];

    for (const batch of batchesToRun) {
      const res = await executor(batch);
      results.push(res);
      totalRows += batch.recordCount;

      // Avoided emissions from running during clean window vs peak:
      // grams = (peakIntensity - cleanIntensity) * kWh
      const deltaIntensity = Math.max(0, batch.peakIntensityGco2 - this.currentIntensityGco2);
      const gramsSaved = Math.round(deltaIntensity * batch.estimatedEnergyKwh);
      carbonSaved += gramsSaved;

      if (batch.recordCount > 0) {
        // Record into PostgreSQL Green Ledger
        await this.greenMetrics.recordAvoidedBackfill(0, batch.recordCount, 'ELT');
      }
    }

    this.totalCarbonSavedByDeferralGrams += carbonSaved;

    if (this.emitEvent) {
      this.emitEvent('carbon:batch_executed', {
        executedCount: batchesToRun.length,
        totalRowsProcessed: totalRows,
        carbonGramsSaved: carbonSaved,
        status: this.getStatus(),
      });
    }

    return {
      executedCount: batchesToRun.length,
      totalRowsProcessed: totalRows,
      carbonGramsSaved: carbonSaved,
      results,
    };
  }

  public getDeferredBatches(): DeferredEltBatch[] {
    return [...this.deferredBatches];
  }
}
