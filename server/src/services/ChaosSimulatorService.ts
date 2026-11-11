import { AnomalyCategory } from '../types/index.js';

export interface ChaosFaultSimulation {
  fault_type: AnomalyCategory;
  connector: string;
  payload: Record<string, any>;
  description: string;
  expectedResolution: string;
}

export class ChaosSimulatorService {
  public generateFault(faultType: AnomalyCategory, connector = 'solar-grid-01'): ChaosFaultSimulation {
    const now = new Date().toISOString();

    switch (faultType) {
      case 'SCHEMA_DRIFT':
        return {
          fault_type: 'SCHEMA_DRIFT',
          connector,
          payload: {
            device_id: 'SOLAR-INV-09',
            ts: '02/11/2026 14:22:00',
            active_power_kw: 64.8,
            grid_freq: 50.1,
          },
          description: 'Firmware updated on solar inverter: power_kw renamed to active_power_kw and ts used instead of timestamp.',
          expectedResolution: 'Levenshtein + LLM key remapping active_power_kw -> power_kw, ts -> metric_timestamp in <1.5s, then cached in HotRuleCache (<1ms).',
        };

      case 'SENSOR_OUTLIER':
        return {
          fault_type: 'SENSOR_OUTLIER',
          connector: 'agri-moist-fleet',
          payload: {
            device_id: 'AGRI-MOIST-42',
            timestamp: now,
            power_kw: 14.2,
            temperature_c: -9999, // Out-of-bounds hardware spike
            moisture_pct: 38.5,
          },
          description: 'Hardware glitch or loose sensor wiring sending out-of-bounds -9999°C reading.',
          expectedResolution: 'Physical boundary check catches -9999°C; TimeSeriesWindowService calculates EMA from last 20 readings and imputes ~36.5°C.',
        };

      case 'TYPE_MISMATCH':
        return {
          fault_type: 'TYPE_MISMATCH',
          connector: 'solar-grid-01',
          payload: {
            device_id: 'SOLAR-INV-09',
            timestamp: now,
            power_kw: '64.8 kW', // String with unit attached
            voltage_v: '230.5 V',
            grid_freq: 50.0,
          },
          description: 'Multi-vendor gateway sending string units appended to numerical measurements.',
          expectedResolution: 'Dynamic regex parser strips unit suffixes (" kW", " V") and type-casts to IEEE-754 double precision floats.',
        };

      case 'ELT_SQL_ERROR':
        return {
          fault_type: 'ELT_SQL_ERROR',
          connector: 'elt-warehouse-runner',
          payload: {
            batch_id: 'batch_7a8f9c01',
            query: 'SELECT emissions / power_consumed FROM raw_staging_payloads WHERE batch_id = ?',
            simulated_error: 'division_by_zero (SQLSTATE 22012)',
            total_records: 50000,
          },
          description: 'Scheduled nightly ELT aggregation crashes at 99% completion due to single zero-value denominator.',
          expectedResolution: 'PostgreSQL SAVEPOINT rollback, SQL AST rewriting with NULLIF(power_consumed, 0), and commit without re-running 50k rows.',
        };

      case 'SEMANTIC_DRIFT' as any:
        return {
          fault_type: 'SCHEMA_DRIFT',
          connector: 'solar-farm-gemini',
          payload: {
            device_id: 'SOLAR-FARM-ALPHA',
            timestamp: now,
            photovoltaic_active_generation_kw: 142.8,
            substation_line_voltage: 480.0,
            ambient_thermometer_c: 29.4,
          },
          description: 'Novel multi-vendor inverter firmware sends unmapped semantic keys exceeding Levenshtein threshold.',
          expectedResolution: 'Tier-2 LLM Diagnostic Agent analyzes semantics with schema reflection and maps photovoltaic_active_generation_kw -> power_kw in JSON structured mode.',
        };

      case 'CIRCUIT_BREAKER_TIMEOUT' as any:
        return {
          fault_type: 'SCHEMA_DRIFT',
          connector: 'unstable-gateway',
          payload: {
            device_id: 'OFFSHORE-WIND-88',
            timestamp: now,
            unrecognized_telemetry_metric: 999.9,
            _simulate_slow_llm: true,
          },
          description: 'External AI API network latency exceeds 3000ms SLA during high load.',
          expectedResolution: '3000ms Circuit Breaker trips, halts external call, and falls back to deterministic micro-quarantine preservation.',
        };

      default:
        throw new Error(`Unsupported fault simulation type: ${faultType}`);
    }
  }
}
