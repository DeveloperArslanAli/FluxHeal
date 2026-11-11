# FluxHeal (AuraFlow) — Component Architecture (CA)

> **Document Version:** v1.0 — System Engineering & Architectural Blueprint  
> **Product Architecture:** Full-Stack Reactive Micro-Engine (NestJS Monolith + React 19 Canvas UI + PostgreSQL 16)  
> **Target Release:** Clean-Tech Hackathon 2026 & Enterprise Mission Control  

---

## 1. High-Level Architectural Decomposition

FluxHeal is architected into three decoupled layers: **The High-Velocity Ingestion & Cache Layer**, **The Autonomous Healer & Storage Engine**, and **The 60 FPS Mission Control Presentation Layer**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                FLUXHEAL SYSTEM TOPOLOGY                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  [ IoT Gateways / APIs ] ──► [ Ingestion Service ]                                     │
│                                      │                                                 │
│                                      ▼                                                 │
│                        [ HotRuleCache (<0.5ms) ] ──(Hit)─────────────────────────┐     │
│                                      │ (Miss)                                    │     │
│                                      ▼                                           │     │
│                        [ Schema & Boundary Gate ]                                │     │
│                             │                  │                                 │     │
│              (Valid 99.9%)  │                  │ (Anomalous 0.1%)                │     │
│                             ▼                  ▼                                 │     │
│      ┌─────────────────────────────┐   ┌──────────────────────────────┐          │     │
│      │ clean_telemetry_warehouse   │   │ quarantine_dlq (Dead Letter) │          │     │
│      └─────────────────────────────┘   └──────────────┬───────────────┘          │     │
│                     ▲                                 │                          │     │
│                     │                                 ▼                          │     │
│                     │                 [ Diagnostic & AI Engine ]                 │     │
│                     │                 (Tier-1 Rules + Tier-2 LLM)                │     │
│                     │                                 │                          │     │
│                     │                                 ▼                          │     │
│                     │                 [ Dual-Mode Autonomous Healer ]            │     │
│                     │                     │                     │                │     │
│                     │ (Upsert Healed Row) │                     │ (Compile Rule) │     │
│                     └─────────────────────┘                     ▼                │     │
│                                                [ Cache to HotRuleCache ] ◄───────┘     │
│                                                                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  REAL-TIME WEBSOCKET TRANSPORT (Socket.io Gateway)                                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  [ React 19 UI ] ──► [ CanvasTopology (60fps) ] | [ LiveDiff ] | [ ChaosFaultDock ]    │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. End-to-End Execution Sequence Diagrams

### 2.1 Sequence A: Fast-Path Stream Ingestion (<1ms Execution)
Shows how 99.9% of telemetry flows uninterrupted with sub-millisecond overhead.

```mermaid
sequenceDiagram
    autonumber
    actor IoT as IoT Sensor / Gateway
    participant Ingest as IngestionService
    participant Cache as HotRuleCacheService
    participant Gate as ValidatorService
    participant DB as WarehouseRepository (PostgreSQL)
    participant WS as PipelineGateway (WebSocket)

    IoT->>Ingest: POST /api/v1/ingest/:connector (JSON Payload)
    Ingest->>Cache: computeSignature(connector, payload)
    Cache-->>Ingest: Cached Rule Found (<0.5ms)
    alt Rule Exists
        Ingest->>Cache: applyDeterministicTransform(payload, rule)
        Cache-->>Ingest: Transformed Payload
    else No Rule
        Ingest->>Gate: validateTelemetry(payload)
        Gate-->>Ingest: Validation OK (1.1ms)
    end
    Ingest->>DB: INSERT INTO clean_telemetry_warehouse
    DB-->>Ingest: Record Committed (UUID)
    Ingest->>WS: emitFastPathPacket(cleanRecord)
    WS-->>IoT: 200 OK (status: FAST_PATH_OK)
```

---

### 2.2 Sequence B: Dead-Letter Micro-Quarantine & Autonomous Healing Loop
Illustrates zero-downtime isolation of broken records followed by AI synthesis and hot caching.

```mermaid
sequenceDiagram
    autonumber
    actor IoT as Corrupted Sensor Stream
    participant Ingest as IngestionService
    participant Gate as ValidatorService
    participant Events as EventEmitter2
    participant DLQ as QuarantineService
    participant Healer as HealerService (Rule + LLM)
    participant Cache as HotRuleCacheService
    participant DB as clean_telemetry_warehouse
    participant UI as Mission Control UI

    IoT->>Ingest: Stream Defective Payload ("64.8 kW", active_pwr_kw)
    Ingest->>Gate: validateTelemetry()
    Gate-->>Ingest: Invalid (Schema Drift & Contaminated Unit)
    Ingest->>Events: emit('pipeline.anomaly.detected', payload)
    Ingest-->>IoT: 202 Accepted (QUARANTINED_FOR_HEALING)
    Note over Ingest,IoT: Main ingestion thread unblocked immediately

    Events->>DLQ: handleAnomalyDetected()
    DLQ->>DLQ: INSERT INTO quarantine_dlq (status: ISOLATED)
    DLQ->>UI: WS: anomaly:quarantined

    DLQ->>Healer: diagnoseAndRepair(quarantineRecord)
    Healer->>Healer: Tier-1 Levenshtein & Regex Parse
    opt Low Confidence Heuristic
        Healer->>Healer: Tier-2 Structured LLM Call (anonymized sample)
    end
    Healer-->>DLQ: Synthesized Rule & Patched Payload (Confidence: 0.98)

    DLQ->>DB: INSERT INTO clean_telemetry_warehouse (is_healed=TRUE, _healed_meta)
    DLQ->>Cache: registerCompiledRule(signature, rule)
    DLQ->>UI: WS: healer:diagnosed & rule:cached
    DLQ->>UI: WS: green:updated (+1 Row, +Wh Saved, +gCO2e Saved)
```

---

### 2.3 Sequence C: Transactional ELT SQL Savepoint Patching
Details how database engine errors during batch aggregation are intercepted and corrected in-transaction.

```mermaid
sequenceDiagram
    autonumber
    participant Job as Scheduled ELT Batch Job
    participant ELT as EltWarehouseService
    participant PG as PostgreSQL Engine
    participant Healer as HealerService (SQL AST Agent)
    participant Ledger as GreenMetricsService

    Job->>ELT: executeAndHealEltQuery(batchId, brokenSql)
    ELT->>PG: BEGIN TRANSACTION
    ELT->>PG: SAVEPOINT elt_execution
    ELT->>PG: EXECUTE brokenSql (SELECT emissions / power_consumed)
    PG-->>ELT: ERROR: SQLSTATE 22012 (division_by_zero)
    
    ELT->>PG: ROLLBACK TO SAVEPOINT elt_execution
    ELT->>ELT: introspectStagingSchema()
    ELT->>Healer: patchSqlQuery(brokenSql, '22012', schemaContext)
    Healer-->>ELT: Patched SQL: "emissions / NULLIF(power_consumed, 0)"
    
    ELT->>PG: SAVEPOINT elt_healed_retry
    ELT->>PG: EXECUTE patchedSql
    PG-->>ELT: Query Succeeded (50,000 rows processed)
    ELT->>PG: COMMIT TRANSACTION
    
    ELT->>Ledger: recordAvoidedBackfill(50,000 rows)
    Ledger-->>Job: ELT Completed with Autonomous Savepoint Patch
```

---

## 3. Backend Module Hierarchy & Responsibilities

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND NESTJS MONOLITH                                    │
├─────────────────────┬──────────────────────────────────────────────────────────────────┤
│ Module Name         │ Key Responsibilities & Component Classes                         │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ IngestionModule     │ - IngestionController: Handles REST /api/v1/ingest               │
│                     │ - IngestionService: Manages fast-path routing and signature hash │
│                     │ - StreamGateway: Ingests WebSocket raw frames                    │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ ValidatorModule     │ - ValidatorService: In-memory schema and boundary gate checks    │
│                     │ - HotRuleCacheService: Map<string, CompiledRule> execution (<1ms)│
│                     │ - TimeSeriesWindowService: In-memory circular buffer for EMA     │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ QuarantineModule    │ - QuarantineService: PostgreSQL DLQ persistence and recovery     │
│                     │ - AnomalyEventListener: @OnEvent handler decoupled from thread   │
│                     │ - HitlController: Approvals and reject workflows                 │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ HealerModule        │ - HealerService: Tier-1 heuristics + Tier-2 LLM orchestration    │
│                     │ - SchemaDriftResolver: Levenshtein + semantic key remap          │
│                     │ - UnitNormalizer: Regex string extractor and type caster         │
│                     │ - SqlAstPatcher: Rewrites broken SQL queries on Savepoint        │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ EltWarehouseModule  │ - EltWarehouseService: Staging table and Savepoint runner        │
│                     │ - WarehouseRepository: TypeORM / pg-node clean table manager     │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ GreenMetricsModule  │ - GreenMetricsService: Avoided CPU hours & gCO2e calculator      │
│                     │ - GreenLedgerRepository: Persists green_compute_ledger events    │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ ChaosSimulatorModule│ - ChaosSimulatorService: 4 fault scenarios generator             │
│                     │ - ChaosController: POST /api/v1/chaos/inject handler             │
├─────────────────────┼──────────────────────────────────────────────────────────────────┤
│ GatewayModule       │ - PipelineGateway: Socket.io gateway broadcasting to React UI    │
└─────────────────────┴──────────────────────────────────────────────────────────────────┘
```

---

## 4. Front-End Component Decomposition & State Tree

```
<App>
 └── <TelemetryProvider> (WebSocket Context & State Machine)
      └── <ShellLayout> (Obsidian #0B0F19 Base)
           ├── <TopStatusRibbon>
           │    ├── <BrandIndicator />
           │    ├── <ConnectorDropdown />
           │    ├── <GreenComputeRibbon /> (Avoided Rows, CPU-Hrs, gCO2e)
           │    ├── <AutonomySlider />
           │    └── <WebSocketHeartbeat />
           │
           ├── <MainWorkspaceGrid>
           │    ├── <TopologyCanvasSection>
           │    │    ├── <HTML5NodeTopologyCanvas /> (60 FPS Animated Particles)
           │    │    └── <CanvasOverlayMetrics />
           │    │
           │    ├── <InspectionSplitRow>
           │    │    ├── <LiveDiffInspector>
           │    │    │    ├── <RawQuarantinePayloadPane />
           │    │    │    ├── <SynthesisTransformArrow />
           │    │    │    └── <HealedTargetPayloadPane />
           │    │    │
           │    │    └── <EventStreamLedger>
           │    │         ├── <ThroughputMiniChart />
           │    │         └── <LiveAuditLogList />
           │    │
           │    └── <ChaosFaultDock> (Bottom Floating Deck)
           │         ├── <ChaosTriggerButton fault="SCHEMA_DRIFT" />
           │         ├── <ChaosTriggerButton fault="SENSOR_OUTLIER" />
           │         ├── <ChaosTriggerButton fault="DIRTY_UNITS" />
           │         ├── <ChaosTriggerButton fault="BREAK_SQL" />
           │         └── <StreamRateSlider />
           │
           ├── <RulesRegistryDrawer /> (Rollback Manager)
           └── <HitlNotificationCard /> (Confidence-Gated Action Toast)
```

---

## 5. Fault Tolerance & Memory Protection

1. **In-Memory Buffer Caps:** The `TimeSeriesWindowService` bounds circular buffers to at most 20 floating-point numbers per `device_id`. Memory consumption is mathematically capped at:
   $$\text{Memory} \approx N_{\text{devices}} \times 20 \times 8\text{ bytes} \approx 160\text{KB per 1,000 devices}$$
2. **LLM Circuit Breaker:** If external LLM calls fail or exceed a 3000ms timeout, the engine trips an internal circuit breaker, falling back completely to Tier-1 deterministic heuristics without pipeline disruption.
3. **Savepoint Isolation:** Staging ELT SQL errors roll back strictly to `SAVEPOINT elt_execution`, preventing PostgreSQL transaction poisoning (`current transaction is aborted, commands ignored until end of transaction block`).
