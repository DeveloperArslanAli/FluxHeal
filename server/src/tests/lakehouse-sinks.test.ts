import { describe, it, expect, beforeEach } from 'vitest';
import { LakehouseSinkService } from '../services/LakehouseSinkService.js';
import { CleanTelemetryRecord } from '../types/index.js';

describe('Phase 8: Multi-Cloud Lakehouse & Warehouse Sinks', () => {
  let lakehouseService: LakehouseSinkService;

  beforeEach(() => {
    lakehouseService = new LakehouseSinkService();
  });

  describe('1. LakehouseSinkService Buffering & Columnar Compaction', () => {
    it('initializes default active sinks (Iceberg, ClickHouse, Snowflake, Delta Lake)', () => {
      const overview = lakehouseService.getOverview();
      expect(overview.activeSinkCount).toBe(4);
      expect(overview.sinks.map((s) => s.sinkType)).toEqual([
        'APACHE_ICEBERG',
        'CLICKHOUSE',
        'SNOWFLAKE',
        'DELTA_LAKE',
      ]);
    });

    it('buffers incoming clean records in memory', async () => {
      const record: CleanTelemetryRecord = {
        id: 'rec-001',
        device_id: 'SOLAR-LAKE-01',
        metric_timestamp: new Date().toISOString(),
        power_kw: 48.5,
        voltage_v: 230.0,
        temperature_c: 25.0,
        is_healed: false,
        ingested_at: new Date().toISOString(),
      };

      const manifest = await lakehouseService.enqueueRecord(record);
      // Threshold is 200, so 1 record remains buffered
      expect(manifest).toBeNull();
      expect(lakehouseService.getBufferSize()).toBe(1);
    });

    it('manually flushes buffered records into columnar Parquet/Iceberg manifest', async () => {
      const records: CleanTelemetryRecord[] = [
        {
          id: 'rec-1',
          device_id: 'SOLAR-01',
          metric_timestamp: '2026-11-06T00:00:00Z',
          power_kw: 60.0,
          is_healed: false,
          ingested_at: '2026-11-06T00:00:00Z',
        },
        {
          id: 'rec-2',
          device_id: 'SOLAR-02',
          metric_timestamp: '2026-11-06T00:00:00Z',
          power_kw: 75.0,
          is_healed: true,
          _healed_meta: {
            is_healed: true,
            anomalies_fixed: ['SCHEMA_DRIFT_POWER'],
            confidence: 0.98,
            healed_at: '2026-11-06T00:00:00Z',
            compute_saved_ms: 12.5,
            method: 'LLM_DIAGNOSTIC_TIER2',
            raw_value: { active_power_kw: 75.0 },
          },
          ingested_at: '2026-11-06T00:00:00Z',
        },
      ];

      await lakehouseService.enqueueBatch(records);
      expect(lakehouseService.getBufferSize()).toBe(2);

      const manifest = await lakehouseService.flushBuffer();
      expect(manifest).not.toBeNull();
      expect(manifest?.recordCount).toBe(2);
      expect(manifest?.format).toBe('PARQUET');
      expect(manifest?.sinks).toContain('APACHE_ICEBERG');
      expect(manifest?.sinks).toContain('CLICKHOUSE');
      expect(manifest?.compressionRatio).toBeGreaterThan(4.0);
      expect(manifest?.provenanceSummary.totalClean).toBe(1);
      expect(manifest?.provenanceSummary.totalHealed).toBe(1);
      expect(manifest?.provenanceSummary.methodsUsed).toContain('LLM_DIAGNOSTIC_TIER2');

      // Buffer emptied
      expect(lakehouseService.getBufferSize()).toBe(0);

      const overview = lakehouseService.getOverview();
      expect(overview.totalRecordsExported).toBe(2);
      expect(overview.rawBytesUncompressed).toBeGreaterThan(0);
      expect(overview.compressedBytes).toBeGreaterThan(0);
      expect(overview.recentManifests.length).toBe(1);
    });

    it('returns null when flushing an empty buffer', async () => {
      const manifest = await lakehouseService.flushBuffer();
      expect(manifest).toBeNull();
    });
  });

  describe('2. Lakehouse Warehouse Range Snapshot Export', () => {
    it('creates an on-demand snapshot export from PostgreSQL warehouse', async () => {
      const manifest = await lakehouseService.exportWarehouseRange(50);

      expect(manifest).toBeDefined();
      expect(manifest.exportId).toBeDefined();
      expect(manifest.format).toBe('PARQUET');
      expect(manifest.fileUri).toContain('s3://fluxheal-lakehouse-prod/iceberg/');
      expect(manifest.compressionRatio).toBeGreaterThan(4.0);
      expect(manifest.sinks.length).toBe(4);
    });
  });
});
