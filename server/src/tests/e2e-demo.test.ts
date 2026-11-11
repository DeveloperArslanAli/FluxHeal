import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app, hotCache } from '../index.js';
import { PgDatabase } from '../db/pg-client.js';

describe('Phase 5: PostgreSQL 16 & TimescaleDB Full-Stack E2E Demo Integration', () => {
  const PORT = 4055;
  let testServer: http.Server;
  const baseUrl = `http://localhost:${PORT}/api/v1`;
  const pgDb = PgDatabase.getInstance();

  beforeAll(async () => {
    await pgDb.initSchema();
    await pgDb.resetAllTables();
    hotCache.clear();

    testServer = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  afterAll(async () => {
    await new Promise((resolve) => testServer.close(resolve));
  });

  it('E2E-1: Dashboard Bootstrap API returns valid PostgreSQL cluster status', async () => {
    const res = await fetch(`${baseUrl}/dashboard/bootstrap`);
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.cluster_status).toBeDefined();
    expect(data.cluster_status.backend).toBe('ONLINE');
    expect(data.cluster_status.database_engine).toContain('PostgreSQL');
    expect(data.cluster_status.fast_path_count).toBeDefined();
  });

  it('E2E-2: High-Velocity Batch Ingestion of 50 clean records into PostgreSQL', async () => {
    const batch = Array.from({ length: 50 }, (_, i) => ({
      device_id: `SOLAR-INV-${(i % 10) + 1}`,
      timestamp: new Date().toISOString(),
      power_kw: 40.0 + (i % 20),
      voltage_v: 230.0,
      temperature_c: 25.0,
    }));

    const res = await fetch(`${baseUrl}/ingest/solar-grid-01`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.count).toBe(50);
    expect(data.results.every((r: any) => r.status === 'FAST_PATH_OK')).toBe(true);
  });

  it('E2E-3: Trigger Chaos Fault [SCHEMA_DRIFT] and verify self-healing roundtrip in PostgreSQL', async () => {
    const res = await fetch(`${baseUrl}/chaos/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fault_type: 'SCHEMA_DRIFT',
        connector: 'pg-e2e-drift-connector',
      }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.simulation.fault_type).toBe('SCHEMA_DRIFT');
    expect(data.result.status).toBe('AUTO_HEALED');
    expect(data.result.cleanRecord.power_kw).toBe(64.8);
    expect(data.result.cleanRecord.is_healed).toBe(true);
    expect(data.result.cleanRecord._healed_meta.confidence).toBeGreaterThanOrEqual(0.90);
  });

  it('E2E-4: Trigger Chaos Fault [SENSOR_OUTLIER] and verify EMA imputation', async () => {
    const res = await fetch(`${baseUrl}/chaos/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fault_type: 'SENSOR_OUTLIER',
        connector: 'agri-moist-fleet',
      }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.simulation.fault_type).toBe('SENSOR_OUTLIER');
    expect(data.result.status).toBe('AUTO_HEALED');
    expect(data.result.cleanRecord.temperature_c).toBeGreaterThan(-50);
    expect(data.result.cleanRecord._healed_meta.method).toBe('EMA_IMPUTATION');
  });

  it('E2E-5: Trigger Chaos Fault [DIRTY_UNITS] and verify regex stripping', async () => {
    const res = await fetch(`${baseUrl}/chaos/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fault_type: 'TYPE_MISMATCH',
        connector: 'solar-grid-01',
      }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.result.status).toBe('AUTO_HEALED');
    expect(data.result.cleanRecord.power_kw).toBe(64.8);
    expect(typeof data.result.cleanRecord.power_kw).toBe('number');
  });

  it('E2E-6: Trigger Chaos Fault [ELT_SQL_ERROR] and verify real PostgreSQL SAVEPOINT NULLIF patch', async () => {
    const res = await fetch(`${baseUrl}/chaos/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fault_type: 'ELT_SQL_ERROR',
        connector: 'elt-warehouse-runner',
      }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe('FAULT_HEALED_SAVEPOINT');
    expect(data.patch.patchedSql).toContain('NULLIF(power_consumed, 0)');
    expect(data.greenEvent.avoided_backfill_rows).toBeGreaterThan(0);
  });

  it('E2E-7: Governance Rule Rollback evicts rule from memory and PostgreSQL database', async () => {
    const bootstrapRes: any = await fetch(`${baseUrl}/dashboard/bootstrap`).then((r) => r.json());
    const rules = bootstrapRes.active_rules;
    expect(rules.length).toBeGreaterThan(0);

    const ruleToRevert = rules[0];
    const revertRes = await fetch(`${baseUrl}/rules/${ruleToRevert.id}/revert`, {
      method: 'POST',
    });

    expect(revertRes.status).toBe(200);
    const revertData: any = await revertRes.json();
    expect(revertData.status).toBe('RULE_REVERTED');
    expect(revertData.evicted_from_cache).toBe(true);
  });
});
