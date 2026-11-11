import { AnomalyCategory } from '../types/index.js';

export interface LlmDiagnosisResult {
  anomalyCategory: AnomalyCategory;
  fieldMappings: Record<string, string>;
  regexStrip: Record<string, string>;
  confidence: number;
  explanation: string;
  sourceModel: string;
}

export interface LlmDiagnosticOptions {
  simulateDelayMs?: number;
  forceError?: boolean;
}

export class LlmDiagnosticService {
  private apiKey: string | null;
  private modelName: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || null;
    this.modelName = this.apiKey ? 'gemini-2.5-flash' : 'clean-tech-semantic-reflection-engine';
  }

  public getModelName(): string {
    return this.modelName;
  }

  public hasExternalApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Diagnostic prompt template with dynamic schema reflection
   */
  private buildPrompt(
    connector: string,
    rawPayload: Record<string, any>,
    targetSchema: string[],
    unrecognizedKeys: string[]
  ): string {
    return `
You are the FluxHeal Autonomous Clean-Tech Diagnostic AI Agent.
Analyze incoming corrupted IoT/ESG telemetry and produce structured JSON repair instructions.

TARGET WAREHOUSE SCHEMA:
${JSON.stringify(targetSchema, null, 2)}

CONNECTOR ID: ${connector}
UNRECOGNIZED FIELDS: ${JSON.stringify(unrecognizedKeys)}
RAW INCOMING PAYLOAD:
${JSON.stringify(rawPayload, null, 2)}

Respond ONLY with valid JSON conforming to this schema:
{
  "anomaly_category": "SCHEMA_DRIFT" | "TYPE_MISMATCH" | "SENSOR_OUTLIER",
  "field_mappings": { "<unrecognized_key>": "<target_schema_key>" },
  "regex_strip": { "<key>": "<regex_pattern_to_remove>" },
  "confidence": 0.95,
  "explanation": "Natural language technical reason for this semantic remapping"
}
`.trim();
  }

  /**
   * Diagnoses complex schema drift and unmapped telemetry via LLM or Semantic Reflection
   */
  public async diagnoseSchemaDrift(
    connector: string,
    rawPayload: Record<string, any>,
    targetSchema: string[] = ['device_id', 'metric_timestamp', 'power_kw', 'voltage_v', 'temperature_c', 'frequency_hz'],
    options: LlmDiagnosticOptions = {}
  ): Promise<LlmDiagnosisResult> {
    if (options.forceError) {
      throw new Error('[LlmDiagnosticService] Upstream AI provider returned 503 Service Unavailable');
    }

    if (options.simulateDelayMs && options.simulateDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.simulateDelayMs));
    }

    // Determine unrecognized keys
    const incomingKeys = Object.keys(rawPayload);
    const unrecognizedKeys = incomingKeys.filter(
      (k) => !targetSchema.includes(k) && !['timestamp', 'ts', 'id'].includes(k)
    );

    // If external GEMINI_API_KEY is available, call the Gemini API
    if (this.apiKey) {
      try {
        const prompt = this.buildPrompt(connector, rawPayload, targetSchema, unrecognizedKeys);
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            return {
              anomalyCategory: parsed.anomaly_category || 'SCHEMA_DRIFT',
              fieldMappings: parsed.field_mappings || {},
              regexStrip: parsed.regex_strip || {},
              confidence: parsed.confidence || 0.95,
              explanation: parsed.explanation || 'Remapped via Gemini 2.5 Flash Structured Mode',
              sourceModel: 'gemini-2.5-flash',
            };
          }
        }
      } catch (err: any) {
        console.warn('[LlmDiagnosticService] External API call failed, falling back to Semantic Engine:', err.message);
      }
    }

    // Semantic Reflection Engine (Clean-Tech / IoT Domain Inference)
    const fieldMappings: Record<string, string> = {};
    const regexStrip: Record<string, string> = {};
    const explanations: string[] = [];

    for (const key of unrecognizedKeys) {
      const lower = key.toLowerCase();

      // Power / generation semantics
      if (
        lower.includes('photovoltaic') ||
        lower.includes('solar_generation') ||
        lower.includes('feedin') ||
        lower.includes('active_power') ||
        lower.includes('generation_kw') ||
        lower.includes('p_ac') ||
        lower.includes('inverter_output')
      ) {
        fieldMappings[key] = 'power_kw';
        explanations.push(`Semantic synonym: '${key}' maps to standardized power_kw (Inverter AC active power).`);
      }
      // Voltage semantics
      else if (lower.includes('line_voltage') || lower.includes('vac') || lower.includes('vdc') || lower.includes('potential')) {
        fieldMappings[key] = 'voltage_v';
        explanations.push(`Semantic synonym: '${key}' maps to standardized voltage_v.`);
      }
      // Temperature semantics
      else if (lower.includes('thermometer') || lower.includes('celsius') || lower.includes('deg_c') || lower.includes('thermal')) {
        fieldMappings[key] = 'temperature_c';
        explanations.push(`Semantic synonym: '${key}' maps to standardized temperature_c.`);
      }
      // Frequency semantics
      else if (lower.includes('hertz') || lower.includes('grid_freq') || lower.includes('cycles_sec')) {
        fieldMappings[key] = 'frequency_hz';
        explanations.push(`Semantic synonym: '${key}' maps to standardized frequency_hz.`);
      }
      // Timestamp semantics
      else if (lower.includes('recorded_at') || lower.includes('event_time') || lower.includes('sample_time')) {
        fieldMappings[key] = 'metric_timestamp';
        explanations.push(`Semantic synonym: '${key}' maps to standardized metric_timestamp.`);
      }
    }

    // Check for dirty string units
    for (const [k, v] of Object.entries(rawPayload)) {
      if (typeof v === 'string' && /[0-9]+\s*(kw|w|v|hz|c|mw)/i.test(v)) {
        regexStrip[k] = '[^0-9.-]+';
        explanations.push(`Dirty unit string detected in '${k}'. Pattern '[^0-9.-]+' compiled for numeric normalization.`);
      }
    }

    const hasMappings = Object.keys(fieldMappings).length > 0;
    const explanation = explanations.length > 0
      ? explanations.join(' ')
      : `AI Diagnostic Agent analyzed payload with ${unrecognizedKeys.length} unmapped field(s).`;

    return {
      anomalyCategory: 'SCHEMA_DRIFT',
      fieldMappings,
      regexStrip,
      confidence: hasMappings ? 0.96 : 0.70,
      explanation,
      sourceModel: this.modelName,
    };
  }
}
