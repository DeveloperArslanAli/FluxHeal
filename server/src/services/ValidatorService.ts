import { CleanTelemetryRecord } from '../types/index.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  cleanRecord?: Partial<CleanTelemetryRecord>;
}

export class ValidatorService {
  /**
   * Validates structural integrity, required fields, data types, and physical boundaries.
   */
  public validateTelemetry(payload: Record<string, any>): ValidationResult {
    const errors: string[] = [];

    // 1. Check required device_id
    if (!payload.device_id || typeof payload.device_id !== 'string') {
      errors.push('Missing or invalid required field: device_id (string)');
    }

    // 2. Check timestamp / metric_timestamp
    const rawTs = payload.metric_timestamp || payload.timestamp || payload.ts;
    let validTimestamp: string | null = null;
    if (!rawTs) {
      errors.push('Missing required timestamp field (expected metric_timestamp or timestamp)');
    } else {
      const parsedDate = new Date(rawTs);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Invalid timestamp format: "${rawTs}"`);
      } else {
        validTimestamp = parsedDate.toISOString();
      }
    }

    // 3. Check power_kw (must be a valid number, not string with 'kW' or undefined)
    const rawPower = payload.power_kw ?? payload.power;
    let validPower: number | null = null;
    if (rawPower === undefined || rawPower === null) {
      if ('output_kilowatts' in payload || 'active_power_kw' in payload || 'active_pwr_kw' in payload) {
        errors.push(`Schema Drift: Unrecognized power key present without required 'power_kw'`);
      } else {
        errors.push("Missing required field: 'power_kw'");
      }
    } else if (typeof rawPower === 'string') {
      errors.push(`Type Mismatch: power_kw received string contaminated unit "${rawPower}"`);
    } else if (typeof rawPower === 'number') {
      if (isNaN(rawPower) || rawPower < 0) {
        errors.push(`Physical Boundary Violation: power_kw cannot be negative or NaN (${rawPower})`);
      } else {
        validPower = rawPower;
      }
    }

    // 4. Physical Clean-Tech boundaries
    if (payload.temperature_c !== undefined && payload.temperature_c !== null) {
      if (typeof payload.temperature_c === 'string') {
        errors.push(`Type Mismatch: temperature_c received string "${payload.temperature_c}"`);
      } else if (payload.temperature_c < -50.0 || payload.temperature_c > 85.0) {
        errors.push(`Sensor Outlier: temperature_c (${payload.temperature_c}°C) exceeds physical boundaries (-50°C to 85°C)`);
      }
    }

    if (payload.voltage_v !== undefined && payload.voltage_v !== null) {
      if (typeof payload.voltage_v === 'string') {
        errors.push(`Type Mismatch: voltage_v received string "${payload.voltage_v}"`);
      } else if (payload.voltage_v < 80.0 || payload.voltage_v > 500.0) {
        errors.push(`Sensor Outlier: voltage_v (${payload.voltage_v}V) outside normal operating range (80V - 500V)`);
      }
    }

    if (payload.moisture_pct !== undefined && payload.moisture_pct !== null) {
      if (typeof payload.moisture_pct === 'string') {
        errors.push(`Type Mismatch: moisture_pct received string "${payload.moisture_pct}"`);
      } else if (payload.moisture_pct < 0.0 || payload.moisture_pct > 100.0) {
        errors.push(`Sensor Outlier: moisture_pct (${payload.moisture_pct}%) exceeds boundary (0% - 100%)`);
      }
    }

    const isValid = errors.length === 0 && validPower !== null && validTimestamp !== null;

    if (isValid) {
      return {
        isValid: true,
        errors: [],
        cleanRecord: {
          device_id: payload.device_id,
          metric_timestamp: validTimestamp!,
          power_kw: validPower!,
          voltage_v: payload.voltage_v ?? 230.0,
          temperature_c: payload.temperature_c ?? 25.0,
          moisture_pct: payload.moisture_pct ?? 45.0,
          frequency_hz: payload.frequency_hz ?? payload.grid_freq ?? 50.0,
          is_healed: false,
          _healed_meta: null,
          ingested_at: new Date().toISOString(),
        },
      };
    }

    return {
      isValid: false,
      errors,
    };
  }
}
