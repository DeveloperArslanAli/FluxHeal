# FluxHeal (AuraFlow) — Technical Requirements Document (TRD) & API Contracts

> **Document Version:** v2.0 — Engineering Implementation Specification  
> **Backend Architecture:** NestJS (Node.js, TypeScript) Modular Monolith  
> **Database Architecture:** PostgreSQL 16 (Relational + JSONB Hybrid Engine with pgcrypto)  
> **Real-Time Layer:** NestJS `@WebSocketGateway` (Socket.io) + `EventEmitter2`  

---

## 1. System Architecture & Module Boundaries

The backend is built as a high-throughput, modular NestJS architecture that decouples fast-path streaming ingestion from asynchronous fault quarantine, AI diagnosis, and transactional SQL patching.

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── interfaces/         # Shared TypeScript contracts (Telemetry, Rule, Anomaly)
│   ├── filters/            # PgExceptionFilter (Intercepts Postgres SQL error codes)
│   └── interceptors/       # BenchmarkInterceptor (Sub-millisecond latency timer)
└── modules/
    ├── ingestion/          # Fast-path REST & WebSocket stream receivers
    ├── validator/          # In-memory Schema Gate + Hot-Rule Cache (<1ms)
    ├── quarantine/         # Dead-Letter Queue (DLQ) manager & PostgreSQL persistence
    ├── healer/             # Tier-1 Deterministic Imputer + Tier-2 LLM Diagnostic Agent
    ├── elt-warehouse/      # Raw JSONB staging, SQL runner & SAVEPOINT Dry-Run Engine
    ├── green-metrics/      # Cloud CPU, kWh & Carbon (gCO2e) savings calculator
    ├── chaos-simulator/    # One-click fault injector for live evaluation
    └── gateway/            # WebSocketGateway pushing 60 FPS state to UI
```

---

## 2. In-Memory Accelerators

### 2.1 `HotRuleCacheService` (`@Injectable()` Singleton)
- **Lifecycle:** Hydrates active rules from `healing_rules_registry` on `OnModuleInit()`.
- **Storage:** Internal `Map<string, CompiledHealingRule>` keyed by structural signature hash `source_signature`.
- **Execution Overhead:** Applies cached schema key re-mappings and regex unit strippers in $<0.5\text{ms}$ in-memory before validation is invoked.

### 2.2 `TimeSeriesWindowService` (`@Injectable()` Singleton)
- **Structure:** In-memory circular buffer (`Map<string, number[]>`) holding the last 20 valid numeric readings per `device_id`.
- **Functionality:** Imputes missing (`null`), corrupted (`NaN`), or boundary-violating outlier sensor readings (`-9999°C`) using Exponential Moving Average (EMA) in microseconds without making database calls.

---

## 3. PostgreSQL Database Schema & Storage Engine (DDL)

```sql
-- Enable cryptographic UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS FOR STRICT STATE MANAGEMENT
CREATE TYPE anomaly_category AS ENUM (
    'SCHEMA_DRIFT',
    'SENSOR_OUTLIER',
    'TYPE_MISMATCH',
    'ELT_SQL_ERROR',
    'API_RATE_LIMIT'
);

CREATE TYPE quarantine_status AS ENUM (
    'ISOLATED',
    'DIAGNOSING',
    'AUTO_HEALED',
    'PENDING_HITL',
    'REVERTED'
);

-- 2. TARGET PRODUCTION TELEMETRY WAREHOUSE
CREATE TABLE clean_telemetry_warehouse (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(64) NOT NULL,
    metric_timestamp TIMESTAMPTZ NOT NULL,
    power_kw DOUBLE PRECISION NOT NULL,
    voltage_v DOUBLE PRECISION,
    temperature_c DOUBLE PRECISION,
    moisture_pct DOUBLE PRECISION,
    is_healed BOOLEAN DEFAULT FALSE,
    _healed_meta JSONB DEFAULT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_warehouse_device_ts ON clean_telemetry_warehouse (device_id, metric_timestamp DESC);
CREATE INDEX idx_warehouse_healed_meta ON clean_telemetry_warehouse USING GIN (_healed_meta);

-- 3. RAW ELT STAGING TABLE
CREATE TABLE raw_staging_payloads (
    batch_id UUID NOT NULL,
    row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_connector VARCHAR(64) NOT NULL,
    raw_payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_staging_batch ON raw_staging_payloads (batch_id, processed);

-- 4. QUARANTINE DEAD-LETTER QUEUE (DLQ)
CREATE TABLE quarantine_dlq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_connector VARCHAR(64) NOT NULL,
    raw_payload JSONB NOT NULL,
    healed_payload JSONB DEFAULT NULL,
    anomaly_type anomaly_category NOT NULL,
    error_message TEXT NOT NULL,
    status quarantine_status DEFAULT 'ISOLATED',
    confidence_score NUMERIC(4,3),
    applied_rule_id UUID,
    quarantined_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_quarantine_status ON quarantine_dlq (status, quarantined_at DESC);

-- 5. AUTONOMOUS HEALING RULES REGISTRY
CREATE TABLE healing_rules_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_signature VARCHAR(255) UNIQUE NOT NULL,
    anomaly_category anomaly_category NOT NULL,
    rule_definition JSONB NOT NULL,
    sql_patch_template TEXT DEFAULT NULL,
    confidence_score NUMERIC(4,3) NOT NULL,
    times_triggered INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_signature ON healing_rules_registry (source_signature) WHERE is_active = TRUE;

-- 6. GREEN COMPUTE & CARBON SAVINGS LEDGER
CREATE TABLE green_compute_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    pipeline_mode VARCHAR(10) NOT NULL, -- 'ETL' or 'ELT'
    total_batch_rows INTEGER NOT NULL,
    quarantined_rows INTEGER NOT NULL,
    avoided_backfill_rows INTEGER NOT NULL,
    cpu_ms_saved DOUBLE PRECISION NOT NULL,
    energy_wh_saved DOUBLE PRECISION NOT NULL,
    co2_grams_saved DOUBLE PRECISION NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_green_ledger_recorded ON green_compute_ledger (recorded_at DESC);
```

---

## 4. Transactional ELT SQL Savepoint Patching

When scheduled analytical queries fail on staging data (e.g., zero-value division), PostgreSQL transactional savepoints prevent entire pipeline aborts:

```typescript
@Injectable()
export class EltWarehouseService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly healerService: HealerService,
    private readonly greenMetricsService: GreenMetricsService,
  ) {}

  async executeAndHealEltQuery(batchId: string, brokenSql: string): Promise<EltExecutionResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Establish initial transaction savepoint
      await queryRunner.query('SAVEPOINT elt_execution');
      const result = await queryRunner.query(brokenSql, [batchId]);
      await queryRunner.commitTransaction();
      return { success: true, healed: false, data: result };
    } catch (pgError: any) {
      // 2. Intercept error and rollback to savepoint (preserving transaction state)
      await queryRunner.query('ROLLBACK TO SAVEPOINT elt_execution');

      // 3. Introspect staging table schema and diagnose error code
      const schemaContext = await this.introspectStagingSchema(queryRunner);
      const patchedPlan = await this.healerService.patchSqlQuery(
        brokenSql,
        pgError.code,      // e.g. '22012' (division_by_zero)
        pgError.message,
        schemaContext,
      );

      // 4. Retry with patched SQL inside verified savepoint
      await queryRunner.query('SAVEPOINT elt_healed_retry');
      const healedResult = await queryRunner.query(patchedPlan.patchedSql, [batchId]);
      await queryRunner.commitTransaction();

      // 5. Record avoided compute and emissions
      await this.greenMetricsService.recordAvoidedBackfill(batchId);
      return { success: true, healed: true, data: healedResult, patch: patchedPlan };
    } finally {
      await queryRunner.release();
    }
  }
}
```

---

## 5. Comprehensive REST API Contracts

### 5.1 Ingestion Endpoints
```http
POST /api/v1/ingest/:connector
Content-Type: application/json
```
**Request Body:**
```json
{
  "device_id": "SOLAR-INV-09",
  "ts": "02/11/2026 14:22:00",
  "output_kilowatts": "64.8 kW",
  "grid_freq": 50.1
}
```
**Response (200 OK — Fast Path):**
```json
{
  "status": "FAST_PATH_OK",
  "record_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "cached_rule_applied": null,
  "latency_ms": 0.42
}
```
**Response (202 Accepted — Quarantined for Healing):**
```json
{
  "status": "QUARANTINED_FOR_HEALING",
  "quarantine_id": "9a8f2c01-7b82-4c22-b582-771ef82a0b12",
  "anomaly_type": "SCHEMA_DRIFT",
  "errors": ["Missing required field: power_kw", "Unrecognized field: output_kilowatts"],
  "latency_ms": 1.15
}
```

---

### 5.2 Chaos Fault Simulation Endpoints
```http
POST /api/v1/chaos/inject
Content-Type: application/json
```
**Request Body:**
```json
{
  "fault_type": "SCHEMA_DRIFT", // 'SCHEMA_DRIFT' | 'SENSOR_OUTLIER' | 'TYPE_MISMATCH' | 'ELT_SQL_ERROR'
  "connector": "solar-grid-01"
}
```
**Response (200 OK):**
```json
{
  "status": "FAULT_INJECTED",
  "fault_type": "SCHEMA_DRIFT",
  "simulated_payload": {
    "device_id": "INV-12",
    "timestamp": "2026-11-03T01:20:00Z",
    "active_power_kw": 48.5
  },
  "expected_resolution": "Levenshtein + LLM Key Remap active_power_kw -> power_kw"
}
```

---

### 5.3 Dashboard Bootstrap Endpoint
```http
GET /api/v1/dashboard/bootstrap
```
**Response (200 OK):**
```json
{
  "cluster_status": {
    "database": "CONNECTED",
    "websocket": "HEALTHY",
    "hot_rule_count": 24
  },
  "green_ledger_totals": {
    "total_rows_avoided": 1420890,
    "total_cpu_hours_saved": 18.42,
    "total_energy_wh_saved": 265248.0,
    "total_co2_grams_saved": 7240.2
  },
  "recent_quarantine": [
    {
      "id": "9a8f2c01-7b82-4c22-b582-771ef82a0b12",
      "connector": "solar-grid-01",
      "anomaly_type": "SCHEMA_DRIFT",
      "status": "AUTO_HEALED",
      "confidence": 0.984,
      "quarantined_at": "2026-11-03T01:14:00Z"
    }
  ],
  "active_rules": [
    {
      "id": "rule_8f29c1",
      "signature": "sha256_solar_01_active_pwr",
      "category": "SCHEMA_DRIFT",
      "times_triggered": 4820,
      "confidence": 0.984
    }
  ]
}
```

---

### 5.4 Human-in-the-Loop (HITL) & Governance Endpoints
```http
POST /api/v1/quarantine/:id/approve
Content-Type: application/json
```
**Request Body:**
```json
{
  "action": "APPROVE_AND_CACHE" // or 'REJECT_DISCARD'
}
```

```http
POST /api/v1/rules/:id/revert
```
**Response (200 OK):**
```json
{
  "status": "RULE_REVERTED",
  "rule_id": "rule_8f29c1",
  "evicted_from_cache": true,
  "affected_rows_restored": 4820
}
```

---

## 6. Real-Time WebSocket Event Contract (`/stream`)

The UI connects via Socket.io at `ws://<host>:<port>/stream`.

```typescript
// Server -> Client Broadcast Events
export interface ServerToClientEvents {
  'stream:packet': (data: {
    id: string;
    status: 'FAST_PATH_OK';
    telemetry: {
      device_id: string;
      power_kw: number;
      timestamp: string;
    };
  }) => void;

  'anomaly:quarantined': (data: {
    quarantineId: string;
    connectorId: string;
    anomalyType: 'SCHEMA_DRIFT' | 'SENSOR_OUTLIER' | 'TYPE_MISMATCH' | 'ELT_SQL_ERROR';
    rawPayload: Record<string, any>;
    errorMessage: string;
  }) => void;

  'healer:diagnosed': (data: {
    quarantineId: string;
    patchedPayload: Record<string, any>;
    ruleDefinition: Record<string, any>;
    confidence: number;
    requiresHitl: boolean;
  }) => void;

  'rule:cached': (data: {
    ruleId: string;
    sourceSignature: string;
    category: string;
    confidence: number;
  }) => void;

  'green:updated': (data: {
    rowsAvoided: number;
    cpuHoursSaved: number;
    energyWhSaved: number;
    co2GramsSaved: number;
  }) => void;
}
```

---

## 7. AI Diagnostic Engine Prompting & Guardrails

To eliminate hallucinations and prevent data leakage:
1. **Never Send Bulk Rows:** Only schema headers, field types, validation error messages, and a single anonymized record sample are passed to the LLM.
2. **Strict JSON Schema Mode:** LLM calls enforce strict JSON outputs with type constraints.

### LLM System Prompt Schema
```json
{
  "task": "Diagnose incoming telemetry schema mismatch and synthesize key mapping",
  "expected_schema": {
    "device_id": "VARCHAR(64)",
    "timestamp": "TIMESTAMPTZ",
    "power_kw": "DOUBLE PRECISION",
    "voltage_v": "DOUBLE PRECISION"
  },
  "sample_defective_record": {
    "device_id": "SOLAR-INV-09",
    "ts": "02/11/2026 14:22:00",
    "output_kilowatts": "64.8 kW"
  },
  "output_format": {
    "anomaly_category": "SCHEMA_DRIFT | TYPE_MISMATCH",
    "transform_rules": [
      { "source_key": "string", "target_key": "string", "transform_function": "string" }
    ],
    "confidence_score": 0.98
  }
}
```
