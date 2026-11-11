-- ============================================================================
-- FLUXHEAL (AURAFLOW) — PRODUCTION POSTGRESQL 16 & TIMESCALEDB DDL
-- Conforms to TRD v2.0 Architecture Specification
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Safe attempt to enable TimescaleDB if running on TimescaleDB image
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'TimescaleDB extension not available in this environment. Proceeding with standard PostgreSQL 16 relational engine.';
END $$;

-- 2. ENUM TYPES
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'anomaly_category') THEN
        CREATE TYPE anomaly_category AS ENUM (
            'SCHEMA_DRIFT',
            'SENSOR_OUTLIER',
            'TYPE_MISMATCH',
            'ELT_SQL_ERROR',
            'API_RATE_LIMIT'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quarantine_status') THEN
        CREATE TYPE quarantine_status AS ENUM (
            'ISOLATED',
            'DIAGNOSING',
            'AUTO_HEALED',
            'PENDING_HITL',
            'REVERTED'
        );
    END IF;
END $$;

-- 3. TARGET PRODUCTION TELEMETRY WAREHOUSE
CREATE TABLE IF NOT EXISTS clean_telemetry_warehouse (
    id UUID DEFAULT gen_random_uuid(),
    device_id VARCHAR(64) NOT NULL,
    metric_timestamp TIMESTAMPTZ NOT NULL,
    power_kw DOUBLE PRECISION NOT NULL,
    voltage_v DOUBLE PRECISION,
    temperature_c DOUBLE PRECISION,
    moisture_pct DOUBLE PRECISION,
    frequency_hz DOUBLE PRECISION,
    is_healed BOOLEAN DEFAULT FALSE,
    _healed_meta JSONB DEFAULT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, metric_timestamp)
);

-- Try to convert clean_telemetry_warehouse to TimescaleDB Hypertable if timescaledb is loaded
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('clean_telemetry_warehouse', 'metric_timestamp', if_not_exists => TRUE, migrate_data => TRUE);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping hypertable conversion; standard partitioned indexing will be utilized.';
END $$;

CREATE INDEX IF NOT EXISTS idx_warehouse_device_ts ON clean_telemetry_warehouse (device_id, metric_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_healed_meta ON clean_telemetry_warehouse USING GIN (_healed_meta);

-- 4. RAW ELT STAGING TABLE
CREATE TABLE IF NOT EXISTS raw_staging_payloads (
    batch_id UUID NOT NULL,
    row_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_connector VARCHAR(64) NOT NULL,
    emissions DOUBLE PRECISION NOT NULL,
    power_consumed DOUBLE PRECISION NOT NULL,
    raw_payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_staging_batch ON raw_staging_payloads (batch_id, processed);

-- 5. QUARANTINE DEAD-LETTER QUEUE (DLQ)
CREATE TABLE IF NOT EXISTS quarantine_dlq (
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

CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine_dlq (status, quarantined_at DESC);

-- 6. AUTONOMOUS HEALING RULES REGISTRY
CREATE TABLE IF NOT EXISTS healing_rules_registry (
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

CREATE INDEX IF NOT EXISTS idx_rules_signature ON healing_rules_registry (source_signature) WHERE is_active = TRUE;

-- 7. GREEN COMPUTE & CARBON SAVINGS LEDGER
CREATE TABLE IF NOT EXISTS green_compute_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    pipeline_mode VARCHAR(10) NOT NULL,
    total_batch_rows INTEGER NOT NULL,
    quarantined_rows INTEGER NOT NULL,
    avoided_backfill_rows INTEGER NOT NULL,
    cpu_ms_saved DOUBLE PRECISION NOT NULL,
    energy_wh_saved DOUBLE PRECISION NOT NULL,
    co2_grams_saved DOUBLE PRECISION NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_green_ledger_recorded ON green_compute_ledger (recorded_at DESC);

-- 8. ENTERPRISE NOC GOVERNANCE & AUDIT LEDGER
CREATE TABLE IF NOT EXISTS noc_audit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    target_entity VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    payload_snapshot JSONB DEFAULT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(45) DEFAULT '127.0.0.1',
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_noc_audit_actor ON noc_audit_ledger (actor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_noc_audit_action ON noc_audit_ledger (action_type, recorded_at DESC);
