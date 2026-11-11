import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { HotRuleCacheService } from '../services/HotRuleCacheService.js';
import { TimeSeriesWindowService } from '../services/TimeSeriesWindowService.js';
import { ValidatorService } from '../services/ValidatorService.js';
import { HealerService } from '../services/HealerService.js';
import { GreenMetricsService } from '../services/GreenMetricsService.js';
import { QuarantineService } from '../services/QuarantineService.js';
import { WarehouseRepository } from '../services/WarehouseRepository.js';
import { IngestionService } from '../services/IngestionService.js';
import { PgDatabase } from '../db/pg-client.js';

describe('FluxHeal (AuraFlow) Core Autonomous Pipeline Test Suite (PostgreSQL 16 Engine)', () => {
  let hotCache: HotRuleCacheService;
  let timeSeries: TimeSeriesWindowService;
  let validator: ValidatorService;
  let healer: HealerService;
  let greenMetrics: GreenMetricsService;
  let quarantine: QuarantineService;
  let warehouse: WarehouseRepository;
  let ingestion: IngestionService;
  const pgDb = PgDatabase.getInstance();

  beforeAll(async () => {
    await pgDb.initSchema();
  });

  beforeEach(async () => {
    await pgDb.resetAllTables();

    hotCache = new HotRuleCacheService();
    timeSeries = new TimeSeriesWindowService();
    validator = new ValidatorService();
    healer = new HealerService(timeSeries);
    greenMetrics = new GreenMetricsService();
    quarantine = new QuarantineService();
    warehouse = new WarehouseRepository();

    ingestion = new IngestionService(
      hotCache,
      validator,
      quarantine,
      healer,
      greenMetrics,
      warehouse
    );

    // Pre-seed 20 sensor readings for device AGRI-MOIST-42 around 36.5°C
    for (let i = 0; i < 20; i++) {
      timeSeries.recordReading('AGRI-MOIST-42', 'temperature_c', 36.5);
    }
  });

  it('Scenario 1: Fast-Path Stream Ingestion (<2ms Overhead)', async () => {
    const validPayload = {
      device_id: 'SOLAR-INV-01',
      metric_timestamp: '2026-11-03T01:00:00.000Z',
      power_kw: 45.2,
      voltage_v: 230.0,
      temperature_c: 28.5,
    };

    const result = await ingestion.processIncomingStream('solar-grid-01', validPayload);

    expect(result.status).toBe('FAST_PATH_OK');
    expect(result.recordId).toBeDefined();
    expect(result.cleanRecord?.power_kw).toBe(45.2);
    expect(result.cleanRecord?.is_healed).toBe(false);

    const count = await warehouse.getCount();
    expect(count).toBe(1);
  });

  it('Scenario 2: Autonomous Schema Drift Healing and Hot-Rule Caching Loop', async () => {
    const driftPayload = {
      device_id: 'SOLAR-INV-09',
      ts: '2026-11-03T01:10:00.000Z',
      active_power_kw: 64.8,
      grid_freq: 50.1,
    };

    // First time: Cache miss -> Validator catches schema drift -> Healer fixes it -> Rule is cached
    const result1 = await ingestion.processIncomingStream('solar-grid-01', driftPayload);

    expect(result1.status).toBe('AUTO_HEALED');
    expect(result1.cleanRecord?.is_healed).toBe(true);
    expect(result1.cleanRecord?.power_kw).toBe(64.8);
    expect(result1.cleanRecord?.frequency_hz).toBe(50.1);
    expect(hotCache.getAllActiveRules().length).toBe(1);

    // Second time: Same signature arrives -> Hot-Rule Cache hits directly to Fast-Path!
    const result2 = await ingestion.processIncomingStream('solar-grid-01', {
      device_id: 'SOLAR-INV-10',
      ts: '2026-11-03T01:10:05.000Z',
      active_power_kw: 55.4,
      grid_freq: 50.0,
    });

    expect(result2.status).toBe('FAST_PATH_OK');
    expect(result2.cachedRuleApplied).toBeDefined();
    expect(result2.cleanRecord?.power_kw).toBe(55.4);
    expect(result2.latencyMs).toBeLessThan(25);
  });

  it('Scenario 3: Sensor Outlier Imputation via Exponential Moving Average (EMA)', async () => {
    const outlierPayload = {
      device_id: 'AGRI-MOIST-42',
      metric_timestamp: '2026-11-03T01:15:00.000Z',
      power_kw: 12.0,
      temperature_c: -9999,
    };

    const result = await ingestion.processIncomingStream('agri-fleet', outlierPayload);

    expect(result.status).toBe('AUTO_HEALED');
    expect(result.cleanRecord?.is_healed).toBe(true);
    expect(result.cleanRecord?.temperature_c).toBeCloseTo(36.5, 0);
    expect(result.cleanRecord?._healed_meta?.method).toBe('EMA_IMPUTATION');
    expect(result.cleanRecord?._healed_meta?.raw_value.temperature_c).toBe(-9999);
  });

  it('Scenario 4: Dirty Unit Contamination String Stripping', async () => {
    const dirtyUnitsPayload = {
      device_id: 'SOLAR-INV-09',
      metric_timestamp: '2026-11-03T01:20:00.000Z',
      power_kw: '64.8 kW',
      voltage_v: '230.5 V',
    };

    const result = await ingestion.processIncomingStream('solar-grid-01', dirtyUnitsPayload);

    expect(result.status).toBe('AUTO_HEALED');
    expect(result.cleanRecord?.power_kw).toBe(64.8);
    expect(result.cleanRecord?.voltage_v).toBe(230.5);
    expect(typeof result.cleanRecord?.power_kw).toBe('number');
  });

  it('Scenario 5: Transactional ELT SQL Savepoint Patcher', () => {
    const brokenQuery = 'SELECT emissions / power_consumed FROM raw_staging_payloads WHERE batch_id = $1';
    const patch = healer.patchSqlQuery(brokenQuery, '22012');

    expect(patch.patchedSql).toContain('NULLIF(power_consumed, 0)');
    expect(patch.rule).toBe('REWRITE_ZERO_DENOMINATOR_NULLIF');
  });

  it('Scenario 6: Governance Rule Rollback & Warehouse Restoration', async () => {
    const driftPayload = {
      device_id: 'SOLAR-INV-09',
      ts: '2026-11-03T01:10:00.000Z',
      active_power_kw: 64.8,
    };

    const result = await ingestion.processIncomingStream('solar-grid-01', driftPayload);
    const ruleId = result.cleanRecord?._healed_meta?.rule_id;
    expect(ruleId).toBeDefined();

    // Revert the rule
    const evicted = await hotCache.evictRule(ruleId!);
    expect(evicted).toBe(true);
    expect(hotCache.getAllActiveRules().length).toBe(0);

    const revertedCount = await warehouse.revertByRuleId(ruleId!);
    expect(revertedCount).toBe(1);
  });
});
