import { describe, it, expect, beforeEach } from 'vitest';
import { CarbonAwareSchedulerService } from '../services/CarbonAwareSchedulerService.js';
import { MqttBrokerAdapter } from '../services/MqttBrokerAdapter.js';
import { GreenMetricsService } from '../services/GreenMetricsService.js';
import { IngestionService } from '../services/IngestionService.js';
import { HotRuleCacheService } from '../services/HotRuleCacheService.js';
import { ValidatorService } from '../services/ValidatorService.js';
import { QuarantineService } from '../services/QuarantineService.js';
import { HealerService } from '../services/HealerService.js';
import { WarehouseRepository } from '../services/WarehouseRepository.js';
import { TimeSeriesWindowService } from '../services/TimeSeriesWindowService.js';

describe('Phase 7: Enterprise IoT Message Queues & Carbon-Aware Deferral', () => {
  let greenMetrics: GreenMetricsService;
  let carbonScheduler: CarbonAwareSchedulerService;
  let mqttAdapter: MqttBrokerAdapter;
  let ingestionService: IngestionService;

  beforeEach(() => {
    greenMetrics = new GreenMetricsService();
    carbonScheduler = new CarbonAwareSchedulerService(greenMetrics, {
      region: 'CAISO-CALIFORNIA',
      thresholdGco2: 300,
      initialIntensityGco2: 450, // Peak dirty grid
      deferralActive: true,
    });

    const hotCache = new HotRuleCacheService();
    const validator = new ValidatorService();
    const quarantine = new QuarantineService();
    const timeSeries = new TimeSeriesWindowService();
    const healer = new HealerService(timeSeries);
    const warehouse = new WarehouseRepository();

    ingestionService = new IngestionService(
      hotCache,
      validator,
      quarantine,
      healer,
      greenMetrics,
      warehouse
    );

    mqttAdapter = new MqttBrokerAdapter(ingestionService);
  });

  describe('1. MqttBrokerAdapter Industrial IoT Ingestion', () => {
    it('parses topic pattern and routes valid telemetry into fast path', async () => {
      const topic = 'fluxheal/solar-grid-01/telemetry';
      const payload = {
        device_id: 'SOLAR-INV-MQTT-01',
        timestamp: new Date().toISOString(),
        power_kw: 52.4,
        voltage_v: 240.0,
      };

      const result = await mqttAdapter.handleMessage(topic, JSON.stringify(payload), 1);
      expect(result.status).toBe('FAST_PATH_OK');
      expect(result.cleanRecord.device_id).toBe('SOLAR-INV-MQTT-01');

      const stats = mqttAdapter.getStats();
      expect(stats.totalMessagesReceived).toBe(1);
      expect(stats.totalBytesIngested).toBeGreaterThan(0);
    });

    it('extracts connector from nested industrial wildcard topic', async () => {
      const topic = 'industrial/iot/agri-moist-fleet/substation-01';
      const payload = {
        device_id: 'AGRI-SOIL-MQTT-99',
        timestamp: new Date().toISOString(),
        power_kw: 12.0,
        temperature_c: 24.5,
      };

      const result = await mqttAdapter.handleMessage(topic, payload);
      expect(result.status).toBe('FAST_PATH_OK');
      expect(result.cleanRecord.device_id).toBe('AGRI-SOIL-MQTT-99');
    });

    it('handles buffer input and defective schema through micro-quarantine healer', async () => {
      const topic = 'fluxheal/solar-grid-01/telemetry';
      // Defective payload with active_power_kw
      const buffer = Buffer.from(
        JSON.stringify({
          device_id: 'MQTT-DEFECT-01',
          active_power_kw: 48.0,
          ts: '2026-11-06T00:00:00Z',
        })
      );

      const result = await mqttAdapter.handleMessage(topic, buffer);
      expect(['AUTO_HEALED', 'QUARANTINED', 'FAST_PATH_OK']).toContain(result.status);
    });
  });

  describe('2. CarbonAwareSchedulerService Grid Intensity & Batch Deferral', () => {
    it('evaluates grid intensity and flags dirty peak window', () => {
      const status = carbonScheduler.getStatus();
      expect(status.status).toBe('PEAK_DIRTY');
      expect(status.currentIntensityGco2).toBe(450);
      expect(carbonScheduler.shouldDefer()).toBe(true);
    });

    it('enqueues analytical ELT batch during peak dirty carbon window', () => {
      const batch = carbonScheduler.enqueueBatch('batch-test-001', 5000, 'elt-warehouse-runner');
      expect(batch.batchId).toBe('batch-test-001');
      expect(batch.recordCount).toBe(5000);
      expect(batch.peakIntensityGco2).toBe(450);

      const status = carbonScheduler.getStatus();
      expect(status.deferredBatchCount).toBe(1);
      expect(status.totalDeferredRows).toBe(5000);
    });

    it('transitions to clean window on solar surplus and flushes deferred batches', async () => {
      // 1. Enqueue 2 batches during peak
      carbonScheduler.enqueueBatch('batch-1', 2000);
      carbonScheduler.enqueueBatch('batch-2', 3000);
      expect(carbonScheduler.getStatus().deferredBatchCount).toBe(2);

      // 2. Grid drops into solar surplus (clean window ~ 150 gCO2/kWh)
      carbonScheduler.setGridIntensity(150);
      const cleanStatus = carbonScheduler.getStatus();
      expect(cleanStatus.status).toBe('CLEAN_WINDOW');
      expect(cleanStatus.solarSurplus).toBe(true);
      expect(carbonScheduler.shouldDefer()).toBe(false);

      // 3. Flush batches through executor
      let executedBatches = 0;
      const flushResult = await carbonScheduler.flushDeferredBatches(async (batch) => {
        executedBatches++;
        return { success: true, batchId: batch.batchId };
      });

      expect(flushResult.executedCount).toBe(2);
      expect(flushResult.totalRowsProcessed).toBe(5000);
      expect(flushResult.carbonGramsSaved).toBeGreaterThan(0);
      expect(executedBatches).toBe(2);

      // Queue is now empty
      expect(carbonScheduler.getStatus().deferredBatchCount).toBe(0);
    });

    it('respects manual operator deferral toggle', () => {
      expect(carbonScheduler.shouldDefer()).toBe(true);

      // Operator disables carbon deferral
      carbonScheduler.setDeferralActive(false);
      expect(carbonScheduler.shouldDefer()).toBe(false);

      // Operator re-enables
      carbonScheduler.setDeferralActive(true);
      expect(carbonScheduler.shouldDefer()).toBe(true);
    });
  });
});
