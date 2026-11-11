import { HotRuleCacheService } from './HotRuleCacheService.js';
import { ValidatorService } from './ValidatorService.js';
import { QuarantineService } from './QuarantineService.js';
import { HealerService } from './HealerService.js';
import { GreenMetricsService } from './GreenMetricsService.js';
import { WarehouseRepository } from './WarehouseRepository.js';
import { CleanTelemetryRecord, HealingRule, QuarantineRecord } from '../types/index.js';
import { LakehouseSinkService } from './LakehouseSinkService.js';
import { NocGovernanceService } from './NocGovernanceService.js';
import { randomUUID } from 'crypto';

export interface IngestionResult {
  status: 'FAST_PATH_OK' | 'QUARANTINED_FOR_HEALING' | 'AUTO_HEALED' | 'PENDING_HITL';
  recordId?: string;
  quarantineId?: string;
  cachedRuleApplied?: string | null;
  latencyMs: number;
  quarantineRecord?: QuarantineRecord;
  cleanRecord?: CleanTelemetryRecord;
}

export type EventCallback = (eventName: string, data: any) => void;

export class IngestionService {
  private emitEvent: EventCallback | null = null;
  private lakehouseSink: LakehouseSinkService | null = null;
  private autonomyThreshold = 0.90;

  constructor(
    private readonly hotCache: HotRuleCacheService,
    private readonly validator: ValidatorService,
    private readonly quarantine: QuarantineService,
    private readonly healer: HealerService,
    private readonly greenMetrics: GreenMetricsService,
    private readonly warehouse: WarehouseRepository
  ) {}

  public setEventCallback(cb: EventCallback): void {
    this.emitEvent = cb;
  }

  public setLakehouseSink(sink: LakehouseSinkService): void {
    this.lakehouseSink = sink;
  }

  public setAutonomyThreshold(threshold: number): void {
    this.autonomyThreshold = threshold;
  }

  public getAutonomyThreshold(): number {
    return this.autonomyThreshold;
  }

  /**
   * 5-Stage Autonomous Loop Ingestion Controller (Real PostgreSQL Engine)
   */
  public async processIncomingStream(
    connector: string,
    payload: Record<string, any>
  ): Promise<IngestionResult> {
    const startTime = performance.now();

    // STAGE 1: Check In-Memory Hot-Rule Cache (<0.1ms)
    const signature = this.hotCache.computeSignature(connector, payload);
    const cachedRule = this.hotCache.getRule(signature);

    let workingPayload = payload;
    let cachedRuleApplied: string | null = null;

    if (cachedRule) {
      workingPayload = this.hotCache.applyDeterministicTransform(payload, cachedRule);
      cachedRuleApplied = cachedRule.id;
    }

    // STAGE 1: In-Memory Schema Gate & Boundary Validation
    const validation = this.validator.validateTelemetry(workingPayload);

    if (validation.isValid && validation.cleanRecord) {
      // FAST-PATH STREAM: Healthy row committed directly to PostgreSQL Warehouse
      const clean = await this.warehouse.insertCleanRecord(validation.cleanRecord);
      if (this.lakehouseSink) {
        this.lakehouseSink.enqueueRecord(clean).catch(() => {});
      }
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

      if (this.emitEvent) {
        this.emitEvent('stream:packet', {
          id: clean.id,
          status: 'FAST_PATH_OK',
          latencyMs,
          telemetry: clean,
          cachedRuleApplied,
        });
      }

      return {
        status: 'FAST_PATH_OK',
        recordId: clean.id,
        cachedRuleApplied,
        latencyMs,
        cleanRecord: clean,
      };
    }

    // STAGE 2: Micro-Quarantine Dead-Letter Isolation (Zero-Downtime)
    const quarantineEntry = await this.quarantine.addRecord({
      source_connector: connector,
      raw_payload: payload,
      anomaly_type: 'SCHEMA_DRIFT',
      error_message: validation.errors.join('; '),
      status: 'ISOLATED',
    });

    if (this.emitEvent) {
      this.emitEvent('anomaly:quarantined', {
        quarantineId: quarantineEntry.id,
        connectorId: connector,
        anomalyType: quarantineEntry.anomaly_type,
        rawPayload: payload,
        errorMessage: quarantineEntry.error_message,
        timestamp: quarantineEntry.quarantined_at,
      });
    }

    // STAGE 3 & 4: Hybrid Diagnostic Engine & Dual-Mode Autonomous Healer (Tier-1 + Tier-2 LLM via Circuit Breaker)
    const simulateDelayMs = payload._simulate_slow_llm ? 3500 : undefined;
    const diagnosis = await this.healer.diagnoseAndHeal(
      payload,
      validation.errors,
      this.autonomyThreshold,
      { connector, simulateDelayMs }
    );
    quarantineEntry.anomaly_type = diagnosis.anomalyType;

    // STAGE 4: Confidence Gate Evaluation
    if (!diagnosis.requiresHitl && diagnosis.confidence >= this.autonomyThreshold) {
      // Auto-deploy to PostgreSQL Warehouse
      const healedRecord = await this.warehouse.insertCleanRecord({
        ...diagnosis.patchedPayload,
        is_healed: true,
        _healed_meta: diagnosis.healedMeta,
      });

      if (this.lakehouseSink) {
        this.lakehouseSink.enqueueRecord(healedRecord).catch(() => {});
      }

      // Register new rule into Hot-Rule Cache & PostgreSQL registry
      const newRule: HealingRule = {
        id: diagnosis.healedMeta.rule_id || randomUUID(),
        source_signature: signature,
        anomaly_category: diagnosis.anomalyType,
        rule_definition: diagnosis.ruleDefinition,
        confidence_score: diagnosis.confidence,
        times_triggered: 1,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      await this.hotCache.registerRule(newRule);

      // Update DLQ status in PostgreSQL
      await this.quarantine.updateStatus(
        quarantineEntry.id,
        'AUTO_HEALED',
        diagnosis.patchedPayload,
        newRule.id,
        diagnosis.confidence
      );

      // STAGE 5: Green Compute Ledger Update
      const greenEvent = await this.greenMetrics.recordAvoidedBackfill(1, 1000, 'ETL');
      const totals = await this.greenMetrics.getTotals();
      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

      if (this.emitEvent) {
        this.emitEvent('healer:diagnosed', {
          quarantineId: quarantineEntry.id,
          patchedPayload: diagnosis.patchedPayload,
          ruleDefinition: diagnosis.ruleDefinition,
          confidence: diagnosis.confidence,
          healedMeta: diagnosis.healedMeta,
        });

        this.emitEvent('rule:cached', {
          ruleId: newRule.id,
          sourceSignature: newRule.source_signature,
          category: newRule.anomaly_category,
          confidence: newRule.confidence_score,
          timesTriggered: 1,
        });

        this.emitEvent('green:updated', {
          avoidedRows: greenEvent.avoided_backfill_rows,
          cpuMsSaved: greenEvent.cpu_ms_saved,
          energyWhSaved: greenEvent.energy_wh_saved,
          co2GramsSaved: greenEvent.co2_grams_saved,
          totals,
        });
      }

      return {
        status: 'AUTO_HEALED',
        recordId: healedRecord.id,
        quarantineId: quarantineEntry.id,
        latencyMs,
        quarantineRecord: quarantineEntry,
        cleanRecord: healedRecord,
      };
    } else {
      // Route to Human-in-the-Loop (HITL) Queue & Multi-Channel Mobile Webhooks
      await this.quarantine.updateStatus(
        quarantineEntry.id,
        'PENDING_HITL',
        diagnosis.patchedPayload,
        undefined,
        diagnosis.confidence
      );

      try {
        const governance = NocGovernanceService.getInstance();
        await governance.queueHitlApproval({
          id: quarantineEntry.id,
          deviceId: (payload.device_id || payload.deviceId || 'UNKNOWN_DEVICE') as string,
          sourceConnector: connector,
          anomalyType: diagnosis.anomalyType,
          rawPayload: payload,
          proposedPayload: diagnosis.patchedPayload,
          confidenceScore: diagnosis.confidence,
          appliedMethod: diagnosis.healedMeta?.method || 'AUTONOMOUS_DIAGNOSTIC_REPAIR',
          reasoning: diagnosis.healedMeta?.explanation || 'Confidence falls below autonomous threshold; queued for NOC HITL review.',
          suggestedPatchSql: `UPDATE raw_staging_payloads SET processed = true WHERE row_id = '${quarantineEntry.id}';`
        });
      } catch (err: any) {
        console.warn('[IngestionService] Failed to queue HITL approval:', err.message);
      }

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

      if (this.emitEvent) {
        this.emitEvent('healer:diagnosed', {
          quarantineId: quarantineEntry.id,
          patchedPayload: diagnosis.patchedPayload,
          ruleDefinition: diagnosis.ruleDefinition,
          confidence: diagnosis.confidence,
          requiresHitl: true,
        });
      }

      return {
        status: 'PENDING_HITL',
        quarantineId: quarantineEntry.id,
        latencyMs,
        quarantineRecord: quarantineEntry,
      };
    }
  }
}
