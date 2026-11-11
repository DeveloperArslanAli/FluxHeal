import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../services/CircuitBreaker.js';
import { LlmDiagnosticService } from '../services/LlmDiagnosticService.js';
import { HealerService } from '../services/HealerService.js';
import { TimeSeriesWindowService } from '../services/TimeSeriesWindowService.js';

describe('Phase 6: External LLM Diagnostic Agent & Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;
  let llmService: LlmDiagnosticService;
  let timeSeries: TimeSeriesWindowService;
  let healer: HealerService;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({ timeoutMs: 150, maxFailures: 2, resetTimeoutMs: 300 });
    llmService = new LlmDiagnosticService();
    timeSeries = new TimeSeriesWindowService();
    healer = new HealerService(timeSeries, llmService, circuitBreaker);
  });

  describe('1. CircuitBreaker Unit Mechanics', () => {
    it('executes successfully and stays in CLOSED state', async () => {
      const { result, fallbackInvoked, executionMs } = await circuitBreaker.execute(
        async () => 'OK',
        () => 'FALLBACK'
      );

      expect(result).toBe('OK');
      expect(fallbackInvoked).toBe(false);
      expect(executionMs).toBeGreaterThanOrEqual(0);

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failures).toBe(0);
      expect(stats.totalCalls).toBe(1);
    });

    it('triggers fallback and records timeout when action exceeds timeout threshold', async () => {
      const { result, fallbackInvoked } = await circuitBreaker.execute(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 250)); // Exceeds 150ms timeout
          return 'SLOW_RESULT';
        },
        (err) => `FALLBACK_${err.message.includes('Timeout') ? 'TIMEOUT' : 'ERROR'}`
      );

      expect(result).toBe('FALLBACK_TIMEOUT');
      expect(fallbackInvoked).toBe(true);

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.totalTimeouts).toBe(1);
      expect(stats.state).toBe('CLOSED'); // Only 1 failure, max is 2
    });

    it('trips to OPEN state after maxFailures and immediately fast-fails', async () => {
      // 1st failure
      await circuitBreaker.execute(
        async () => { throw new Error('Error 1'); },
        () => 'F1'
      );
      expect(circuitBreaker.getStats().state).toBe('CLOSED');

      // 2nd failure -> trips breaker to OPEN
      await circuitBreaker.execute(
        async () => { throw new Error('Error 2'); },
        () => 'F2'
      );
      const openStats = circuitBreaker.getStats();
      expect(openStats.state).toBe('OPEN');
      expect(openStats.totalTrips).toBe(1);

      // Fast-fail: subsequent call immediately falls back without calling action
      let actionCalled = false;
      const { result, fallbackInvoked } = await circuitBreaker.execute(
        async () => {
          actionCalled = true;
          return 'ACTION';
        },
        () => 'FAST_FAIL_FALLBACK'
      );

      expect(actionCalled).toBe(false);
      expect(result).toBe('FAST_FAIL_FALLBACK');
      expect(fallbackInvoked).toBe(true);
    });

    it('resets back to CLOSED on manual reset()', () => {
      circuitBreaker.forceState('OPEN');
      expect(circuitBreaker.getStats().state).toBe('OPEN');

      circuitBreaker.reset();
      expect(circuitBreaker.getStats().state).toBe('CLOSED');
      expect(circuitBreaker.getStats().failures).toBe(0);
    });
  });

  describe('2. LlmDiagnosticService Semantic Reflection Engine', () => {
    it('analyzes complex solar clean-tech schema drift and extracts semantic mappings', async () => {
      const rawPayload = {
        device_id: 'SOLAR-FARM-ALPHA',
        timestamp: '2026-11-06T00:00:00Z',
        photovoltaic_active_generation_kw: 142.8,
        substation_line_voltage: 480.0,
      };

      const diagnosis = await llmService.diagnoseSchemaDrift(
        'solar-farm-gemini',
        rawPayload,
        ['device_id', 'metric_timestamp', 'power_kw', 'voltage_v', 'temperature_c', 'frequency_hz']
      );

      expect(diagnosis.anomalyCategory).toBe('SCHEMA_DRIFT');
      expect(diagnosis.fieldMappings['photovoltaic_active_generation_kw']).toBe('power_kw');
      expect(diagnosis.fieldMappings['substation_line_voltage']).toBe('voltage_v');
      expect(diagnosis.confidence).toBeGreaterThanOrEqual(0.90);
      expect(diagnosis.explanation).toContain('power_kw');
    });

    it('detects dirty string units and synthesizes regex strip pattern', async () => {
      const rawPayload = {
        device_id: 'SOLAR-01',
        solar_output: '85.4 kW',
      };

      const diagnosis = await llmService.diagnoseSchemaDrift(
        'dirty-connector',
        rawPayload,
        ['device_id', 'power_kw']
      );

      expect(diagnosis.regexStrip['solar_output']).toBe('[^0-9.-]+');
    });
  });

  describe('3. HealerService Tier-2 LLM & Circuit Breaker Integration', () => {
    it('invokes Tier-2 LLM diagnostic when schema drift exceeds Levenshtein distance', async () => {
      const unmappedPayload = {
        device_id: 'SOLAR-FARM-ALPHA',
        ts: '2026-11-06T00:00:00Z',
        photovoltaic_active_generation_kw: 142.8, // Distance from "power_kw" is 26 > 3
      };

      const result = await healer.diagnoseAndHeal(
        unmappedPayload,
        ['Missing required field: power_kw'],
        0.90,
        { connector: 'solar-farm-gemini' }
      );

      expect(result.confidence).toBeGreaterThanOrEqual(0.90);
      expect(result.healedMeta.method).toBe('LLM_DIAGNOSTIC_TIER2');
      expect(result.patchedPayload.power_kw).toBe(142.8);
      expect(result.requiresHitl).toBe(false);
      expect(result.healedMeta.explanation).toBeDefined();
    });

    it('falls back gracefully to Tier-1 heuristic when circuit breaker trips on timeout', async () => {
      const unmappedPayload = {
        device_id: 'OFFSHORE-WIND-88',
        ts: '2026-11-06T00:00:00Z',
        unrecognized_complex_metric: 888.8,
      };

      // Force simulated delay > circuitBreaker timeoutMs (150ms)
      const result = await healer.diagnoseAndHeal(
        unmappedPayload,
        ['Missing required field: power_kw'],
        0.90,
        {
          connector: 'slow-network-connector',
          simulateDelayMs: 250,
        }
      );

      expect(result.healedMeta.method).toBe('CIRCUIT_BREAKER_FALLBACK');
      expect(result.confidence).toBe(0.50);
      expect(result.requiresHitl).toBe(true); // Low confidence routes to HITL
      expect(result.healedMeta.explanation).toContain('Circuit Breaker');
    });
  });
});
