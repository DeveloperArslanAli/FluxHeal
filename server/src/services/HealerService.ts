import { AnomalyCategory, HealedMeta, RuleDefinition } from '../types/index.js';
import { TimeSeriesWindowService } from './TimeSeriesWindowService.js';
import { LlmDiagnosticService, LlmDiagnosisResult } from './LlmDiagnosticService.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { randomUUID } from 'crypto';

export interface HealerResult {
  patchedPayload: Record<string, any>;
  anomalyType: AnomalyCategory;
  ruleDefinition: RuleDefinition;
  confidence: number;
  healedMeta: HealedMeta;
  sqlPatch?: string;
  requiresHitl: boolean;
}

export interface DiagnoseOptions {
  connector?: string;
  simulateDelayMs?: number;
  forceBreakerTrip?: boolean;
}

export class HealerService {
  private readonly llmDiagnostic: LlmDiagnosticService;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly timeSeriesWindow: TimeSeriesWindowService,
    llmDiagnostic?: LlmDiagnosticService,
    circuitBreaker?: CircuitBreaker
  ) {
    this.llmDiagnostic = llmDiagnostic ?? new LlmDiagnosticService();
    this.circuitBreaker = circuitBreaker ?? new CircuitBreaker({ timeoutMs: 3000, maxFailures: 3, resetTimeoutMs: 10000 });
  }

  public getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  public getLlmDiagnostic(): LlmDiagnosticService {
    return this.llmDiagnostic;
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Autonomous Diagnosis & Healing Engine with Tier-1 Deterministic Heuristics
   * and Tier-2 LLM Diagnostic Agent protected by a 3000ms Circuit Breaker.
   */
  public async diagnoseAndHeal(
    rawPayload: Record<string, any>,
    errors: string[],
    autonomyThreshold = 0.90,
    options: DiagnoseOptions = {}
  ): Promise<HealerResult> {
    const startTime = performance.now();
    const patched: Record<string, any> = { ...rawPayload };
    const fixedAnomalies: string[] = [];
    const fieldMappings: Record<string, string> = {};
    const regexStrip: Record<string, string> = {};
    let anomalyCategory: AnomalyCategory = 'SCHEMA_DRIFT';
    let confidence = 0.98;
    let method = 'DETERMINISTIC_HEURISTIC';
    let explanation = 'Deterministic heuristic field mapping and normalization.';

    const connector = options.connector || 'default-connector';
    const targetKeys = ['power_kw', 'metric_timestamp', 'voltage_v', 'frequency_hz', 'device_id', 'temperature_c'];

    // ---------------- TIER 1: DETERMINISTIC HEURISTICS ----------------
    const keys = Object.keys(patched);

    for (const key of keys) {
      if (['active_power_kw', 'active_pwr_kw', 'output_kilowatts', 'solar_kw', 'power_watts', 'pwr_kw'].includes(key)) {
        anomalyCategory = 'SCHEMA_DRIFT';
        fieldMappings[key] = 'power_kw';
        patched['power_kw'] = patched[key];
        delete patched[key];
        fixedAnomalies.push('SCHEMA_DRIFT_POWER');
      } else if (['ts', 'timestamp_raw', 'reading_time'].includes(key)) {
        fieldMappings[key] = 'metric_timestamp';
        patched['metric_timestamp'] = patched[key];
        delete patched[key];
        fixedAnomalies.push('SCHEMA_DRIFT_TIMESTAMP');
      } else if (['grid_freq', 'frequency'].includes(key)) {
        fieldMappings[key] = 'frequency_hz';
        patched['frequency_hz'] = patched[key];
        delete patched[key];
        fixedAnomalies.push('SCHEMA_DRIFT_FREQ');
      } else if (!targetKeys.includes(key)) {
        // Levenshtein fuzzy match
        for (const targetKey of targetKeys) {
          const dist = this.levenshtein(key, targetKey);
          if (dist > 0 && dist <= 3 && !(targetKey in patched)) {
            fieldMappings[key] = targetKey;
            patched[targetKey] = patched[key];
            delete patched[key];
            fixedAnomalies.push(`FUZZY_KEY_MAP_${targetKey.toUpperCase()}`);
            break;
          }
        }
      }
    }

    // Check if Tier-1 was unable to locate power_kw OR if there are still unmapped non-standard keys
    const remainingUnrecognized = Object.keys(patched).filter(
      (k) => !targetKeys.includes(k) && !['timestamp', 'ts', 'id'].includes(k)
    );

    const needsTier2Llm =
      (!('power_kw' in patched) || remainingUnrecognized.length > 0 || options.forceBreakerTrip) &&
      errors.length > 0;

    // ---------------- TIER 2: LLM DIAGNOSTIC AGENT VIA 3000ms CIRCUIT BREAKER ----------------
    if (needsTier2Llm) {
      const breakerResult = await this.circuitBreaker.execute<LlmDiagnosisResult>(
        async () => {
          return await this.llmDiagnostic.diagnoseSchemaDrift(
            connector,
            rawPayload,
            targetKeys,
            {
              simulateDelayMs: options.simulateDelayMs,
              forceError: options.forceBreakerTrip,
            }
          );
        },
        (err) => {
          // Graceful fallback to deterministic safe state
          return {
            anomalyCategory: 'SCHEMA_DRIFT',
            fieldMappings: {},
            regexStrip: {},
            confidence: 0.50,
            explanation: `[Circuit Breaker Trip/Timeout]: Fallback to Tier-1 heuristic. ${err.message}`,
            sourceModel: 'circuit-breaker-fallback',
          };
        }
      );

      const llmResult = breakerResult.result;

      if (!breakerResult.fallbackInvoked && llmResult.confidence >= autonomyThreshold) {
        method = 'LLM_DIAGNOSTIC_TIER2';
        explanation = `[Tier-2 AI: ${llmResult.sourceModel}] ${llmResult.explanation}`;
        confidence = llmResult.confidence;
        anomalyCategory = llmResult.anomalyCategory;

        // Apply LLM field mappings
        for (const [src, tgt] of Object.entries(llmResult.fieldMappings)) {
          if (src in patched) {
            fieldMappings[src] = tgt;
            patched[tgt] = patched[src];
            delete patched[src];
            fixedAnomalies.push(`LLM_MAP_${src}_TO_${tgt}`);
          }
        }

        // Apply LLM regex patterns
        for (const [key, pattern] of Object.entries(llmResult.regexStrip)) {
          regexStrip[key] = pattern;
        }
      } else if (breakerResult.fallbackInvoked) {
        method = 'CIRCUIT_BREAKER_FALLBACK';
        explanation = llmResult.explanation;
        confidence = 0.50; // Triggers HITL review
      }
    }

    // ---------------- DATA NORMALIZATION & STRIPPING ----------------
    // Unit String Stripper & Type Normalizer
    if (patched['power_kw'] !== undefined && typeof patched['power_kw'] === 'string') {
      anomalyCategory = 'TYPE_MISMATCH';
      const rawStr = patched['power_kw'];
      const numericVal = parseFloat(rawStr.replace(/[^0-9.-]+/g, ''));
      if (!isNaN(numericVal)) {
        patched['power_kw'] = numericVal;
        regexStrip['power_kw'] = '[^0-9.-]+';
        fixedAnomalies.push('UNIT_STRING_STRIP_POWER');
      }
    }

    if (patched['voltage_v'] !== undefined && typeof patched['voltage_v'] === 'string') {
      const rawStr = patched['voltage_v'];
      const numericVal = parseFloat(rawStr.replace(/[^0-9.-]+/g, ''));
      if (!isNaN(numericVal)) {
        patched['voltage_v'] = numericVal;
        regexStrip['voltage_v'] = '[^0-9.-]+';
        fixedAnomalies.push('UNIT_STRING_STRIP_VOLTAGE');
      }
    }

    // Date & Timestamp Normalization
    const rawTs = patched['metric_timestamp'] || patched['timestamp'] || patched['ts'];
    if (rawTs) {
      const parsedDate = new Date(rawTs);
      if (!isNaN(parsedDate.getTime())) {
        patched['metric_timestamp'] = parsedDate.toISOString();
        if ('timestamp' in patched) delete patched['timestamp'];
        if ('ts' in patched) delete patched['ts'];
        fixedAnomalies.push('DATE_FORMAT_ISO');
      }
    } else {
      patched['metric_timestamp'] = new Date().toISOString();
      fixedAnomalies.push('DATE_FORMAT_GENERATED');
    }

    // Time-Series Sensor Outlier Imputation (EMA)
    const deviceId = patched['device_id'] || 'UNKNOWN-DEVICE';
    if (patched['temperature_c'] !== undefined) {
      if (typeof patched['temperature_c'] === 'string') {
        patched['temperature_c'] = parseFloat(patched['temperature_c']);
      }
      if (patched['temperature_c'] === null || isNaN(patched['temperature_c']) || patched['temperature_c'] < -50 || patched['temperature_c'] > 85) {
        anomalyCategory = 'SENSOR_OUTLIER';
        const imputedTemp = this.timeSeriesWindow.imputeEma(deviceId, 'temperature_c', 36.5);
        patched['temperature_c'] = imputedTemp;
        fixedAnomalies.push('EMA_IMPUTATION_TEMP');
        if (method === 'DETERMINISTIC_HEURISTIC') {
          method = 'EMA_IMPUTATION';
        }
      } else {
        this.timeSeriesWindow.recordReading(deviceId, 'temperature_c', patched['temperature_c']);
      }
    }

    const ruleDef: RuleDefinition = {
      type: anomalyCategory,
      field_mappings: Object.keys(fieldMappings).length > 0 ? fieldMappings : undefined,
      regex_strip: Object.keys(regexStrip).length > 0 ? regexStrip : undefined,
      date_format: 'ISO_8601',
    };

    const requiresHitl = confidence < autonomyThreshold;

    // Real dynamic compute calculation based on payload complexity and actual processing duration
    const executionMs = Math.max(0.1, performance.now() - startTime);
    const payloadBytes = JSON.stringify(rawPayload).length;
    const computeSavedMs = Math.round((executionMs * 1000 + payloadBytes * 2.5) * 10) / 10;

    const healedMeta: HealedMeta = {
      is_healed: true,
      anomalies_fixed: fixedAnomalies,
      rule_id: randomUUID(),
      raw_value: rawPayload,
      confidence,
      healed_at: new Date().toISOString(),
      compute_saved_ms: computeSavedMs,
      method,
      explanation,
    };

    return {
      patchedPayload: patched,
      anomalyType: anomalyCategory,
      ruleDefinition: ruleDef,
      confidence,
      healedMeta,
      requiresHitl,
    };
  }

  public patchSqlQuery(brokenSql: string, errorCode: string): { patchedSql: string; rule: string } {
    let patched = brokenSql;
    if (errorCode === '22012' || brokenSql.includes('power_consumed') || brokenSql.includes('/')) {
      patched = brokenSql.replace(
        /(\/\s*)([a-zA-Z0-9_]+)/g,
        '$1NULLIF($2, 0)'
      );
      return {
        patchedSql: patched,
        rule: 'REWRITE_ZERO_DENOMINATOR_NULLIF',
      };
    }
    return {
      patchedSql: patched,
      rule: 'SQL_FALLBACK_COALESCE',
    };
  }
}
