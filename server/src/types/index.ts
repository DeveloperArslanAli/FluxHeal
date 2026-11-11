export type AnomalyCategory = 
  | 'SCHEMA_DRIFT'
  | 'SENSOR_OUTLIER'
  | 'TYPE_MISMATCH'
  | 'ELT_SQL_ERROR'
  | 'API_RATE_LIMIT';

export type QuarantineStatus = 
  | 'ISOLATED'
  | 'DIAGNOSING'
  | 'AUTO_HEALED'
  | 'PENDING_HITL'
  | 'REVERTED';

export interface HealedMeta {
  is_healed: boolean;
  anomalies_fixed: string[];
  rule_id?: string;
  raw_value: Record<string, any>;
  confidence: number;
  healed_at: string;
  compute_saved_ms: number;
  method?: string;
  explanation?: string;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalTimeouts: number;
  totalTrips: number;
  timeoutMs: number;
  lastFailure: string | null;
  lastStateChange: string;
}

export interface GridCarbonStatus {
  region: string;
  currentIntensityGco2: number;
  status: 'CLEAN_WINDOW' | 'PEAK_DIRTY';
  solarSurplus: boolean;
  updatedAt: string;
  deferralActive: boolean;
  thresholdGco2: number;
  deferredBatchCount: number;
  totalDeferredRows: number;
}

export interface DeferredEltBatch {
  batchId: string;
  enqueuedAt: string;
  recordCount: number;
  sourceConnector: string;
  estimatedEnergyKwh: number;
  peakIntensityGco2: number;
}

export interface MqttMessage {
  topic: string;
  payload: Record<string, any>;
  qos: 0 | 1 | 2;
  receivedAt: string;
}

export type LakehouseSinkType = 'APACHE_ICEBERG' | 'CLICKHOUSE' | 'SNOWFLAKE' | 'DELTA_LAKE';

export interface LakehouseSinkStats {
  sinkType: LakehouseSinkType;
  status: 'ACTIVE' | 'SYNCING' | 'PAUSED';
  totalRecordsExported: number;
  rawBytesUncompressed: number;
  compressedBytes: number;
  compressionRatio: number;
  lastFlushAt: string | null;
  destinationBucket: string;
}

export interface LakehouseExportManifest {
  exportId: string;
  generatedAt: string;
  partitionDate: string;
  recordCount: number;
  format: 'PARQUET' | 'JSON_EACH_ROW';
  sinks: LakehouseSinkType[];
  fileUri: string;
  compressionRatio: number;
  provenanceSummary: {
    totalClean: number;
    totalHealed: number;
    methodsUsed: string[];
  };
}

export interface LakehouseSystemOverview {
  totalRecordsExported: number;
  rawBytesUncompressed: number;
  compressedBytes: number;
  overallCompressionRatio: number;
  activeSinkCount: number;
  sinks: LakehouseSinkStats[];
  recentManifests: LakehouseExportManifest[];
}

export interface CleanTelemetryRecord {
  id: string;
  device_id: string;
  metric_timestamp: string;
  power_kw: number;
  voltage_v?: number;
  temperature_c?: number;
  moisture_pct?: number;
  frequency_hz?: number;
  is_healed: boolean;
  _healed_meta?: HealedMeta | null;
  ingested_at: string;
}

export interface QuarantineRecord {
  id: string;
  source_connector: string;
  raw_payload: Record<string, any>;
  healed_payload?: Record<string, any> | null;
  anomaly_type: AnomalyCategory;
  error_message: string;
  status: QuarantineStatus;
  confidence_score?: number | null;
  applied_rule_id?: string | null;
  quarantined_at: string;
  resolved_at?: string | null;
}

export interface RuleDefinition {
  type: AnomalyCategory;
  field_mappings?: Record<string, string>;
  regex_strip?: Record<string, string>;
  date_format?: string;
  imputation_field?: string;
  imputation_method?: string;
}

export interface HealingRule {
  id: string;
  source_signature: string;
  anomaly_category: AnomalyCategory;
  rule_definition: RuleDefinition;
  sql_patch_template?: string | null;
  confidence_score: number;
  times_triggered: number;
  is_active: boolean;
  created_at: string;
}

export interface GreenLedgerEvent {
  id: string;
  event_id: string;
  pipeline_mode: 'ETL' | 'ELT';
  total_batch_rows: number;
  quarantined_rows: number;
  avoided_backfill_rows: number;
  cpu_ms_saved: number;
  energy_wh_saved: number;
  co2_grams_saved: number;
  recorded_at: string;
}

export interface GreenLedgerTotals {
  total_rows_avoided: number;
  total_cpu_hours_saved: number;
  total_energy_wh_saved: number;
  total_co2_grams_saved: number;
}

// ==========================================
// PHASE 9: ENTERPRISE NOC GOVERNANCE & HITL
// ==========================================

export type NocRole = 
  | 'NOC_SUPER_ADMIN'
  | 'DATA_ENGINEER'
  | 'ESG_ANALYST'
  | 'FIELD_TECHNICIAN'
  | 'READONLY_AUDITOR';

export type NocPermission =
  | 'hitl:approve'
  | 'hitl:reject'
  | 'chaos:inject'
  | 'rules:rollback'
  | 'lakehouse:flush'
  | 'carbon:override'
  | 'governance:audit_view'
  | 'drift:remediate';

export interface HitlQueueItem {
  id: string; // matches quarantine_dlq id
  deviceId: string;
  sourceConnector: string;
  anomalyType: AnomalyCategory;
  rawPayload: Record<string, any>;
  proposedPayload: Record<string, any>;
  confidenceScore: number;
  appliedMethod: string;
  reasoning: string;
  suggestedPatchSql?: string;
  queuedAt: string;
  status: 'PENDING_HITL' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewerRole?: NocRole;
  reviewedAt?: string;
  decisionNotes?: string;
}

export type WebhookChannel = 'SLACK' | 'TEAMS' | 'TELEGRAM';

export interface OutboundWebhookDispatch {
  dispatchId: string;
  channel: WebhookChannel;
  hitlId: string;
  dispatchedAt: string;
  status: 'DISPATCHED' | 'SIMULATED' | 'FAILED';
  targetUrl: string;
  payloadSummary: string;
  formattedBody: Record<string, any>;
}

export interface SchemaFieldStats {
  fieldName: string;
  dataType: string;
  presenceRate: number; // 0.0 - 1.0
  entropyScore: number; // 0.0 - 1.0
  status: 'CANONICAL' | 'MUTATING' | 'EMERGING' | 'DEPRECATED';
  mutationCandidate?: string;
}

export interface SchemaDriftForecast {
  evaluatedAt: string;
  samplePayloadCount: number;
  overallDriftProbability: number; // 0.0 - 1.0
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedHoursToBreakage: number;
  activeFields: SchemaFieldStats[];
  detectedDrifts: Array<{
    field: string;
    targetCanonical: string;
    confidence: number;
    mutationPattern: string;
    suggestedTransformSql: string;
  }>;
  recommendedRulePatch?: RuleDefinition;
}

export interface NocAuditLogEntry {
  id: string;
  actorId: string;
  actorRole: NocRole;
  actionType: string;
  targetEntity: string;
  entityId: string;
  payloadSnapshot?: Record<string, any> | null;
  metadata?: Record<string, any>;
  ipAddress: string;
  recordedAt: string;
}
