import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { PgDatabase } from './db/pg-client.js';
import { HotRuleCacheService } from './services/HotRuleCacheService.js';
import { TimeSeriesWindowService } from './services/TimeSeriesWindowService.js';
import { ValidatorService } from './services/ValidatorService.js';
import { HealerService } from './services/HealerService.js';
import { GreenMetricsService } from './services/GreenMetricsService.js';
import { QuarantineService } from './services/QuarantineService.js';
import { WarehouseRepository } from './services/WarehouseRepository.js';
import { ChaosSimulatorService } from './services/ChaosSimulatorService.js';
import { IngestionService } from './services/IngestionService.js';
import { EltWarehouseService } from './services/EltWarehouseService.js';
import { CarbonAwareSchedulerService } from './services/CarbonAwareSchedulerService.js';
import { MqttBrokerAdapter } from './services/MqttBrokerAdapter.js';
import { LakehouseSinkService } from './services/LakehouseSinkService.js';
import { NocGovernanceService } from './services/NocGovernanceService.js';
import { AnomalyCategory, NocRole } from './types/index.js';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Initialize Core Services with Real PostgreSQL 16 & TimescaleDB Engine
const pgDb = PgDatabase.getInstance();
const hotCache = new HotRuleCacheService();
const timeSeries = new TimeSeriesWindowService();
const validator = new ValidatorService();
const healer = new HealerService(timeSeries);
const greenMetrics = new GreenMetricsService();
const quarantine = new QuarantineService();
const warehouse = new WarehouseRepository();
const chaosSimulator = new ChaosSimulatorService();
const eltWarehouse = new EltWarehouseService(healer, greenMetrics);

const ingestionService = new IngestionService(
  hotCache,
  validator,
  quarantine,
  healer,
  greenMetrics,
  warehouse
);

const carbonScheduler = new CarbonAwareSchedulerService(greenMetrics);
const mqttAdapter = new MqttBrokerAdapter(ingestionService);
const lakehouseSink = new LakehouseSinkService();
const nocGovernance = NocGovernanceService.getInstance();

// Connect Ingestion Service to Lakehouse Sink
ingestionService.setLakehouseSink(lakehouseSink);

// Connect Ingestion Service to WebSocket Gateway
ingestionService.setEventCallback((eventName: string, data: any) => {
  io.emit(eventName, data);
});

// Connect Lakehouse Sink events to WebSocket
lakehouseSink.setEventCallback((eventName: string, data: any) => {
  io.emit(eventName, data);
});

// Connect Carbon Aware Scheduler to WebSocket Gateway
carbonScheduler.setEventCallback((eventName: string, data: any) => {
  io.emit(eventName, data);
});

// Connect NOC Governance Service to WebSocket Gateway
nocGovernance.registerEventEmitter((eventName: string, data: any) => {
  io.emit(eventName, data);
});

// Connect Circuit Breaker state change notifications to WebSocket
healer.getCircuitBreaker().onStateChange((state, stats) => {
  io.emit('circuit_breaker:state_change', stats);
});

// Pre-seed historical readings for EMA in-memory buffer
for (let i = 0; i < 20; i++) {
  const variation = (Math.random() - 0.5) * 2;
  timeSeries.recordReading('AGRI-MOIST-42', 'temperature_c', 36.5 + variation);
  timeSeries.recordReading('SOLAR-INV-09', 'temperature_c', 42.0 + variation);
}

// ---------------- REST API CONTROLLERS ----------------

/**
 * REST: Ingest single telemetry object or bulk array batches
 */
app.post('/api/v1/ingest/:connector', async (req, res) => {
  try {
    const connector = req.params.connector || 'default-stream';
    const payload = req.body;

    if (Array.isArray(payload)) {
      const results = [];
      for (const item of payload) {
        const r = await ingestionService.processIncomingStream(connector, item);
        results.push(r);
      }
      return res.status(200).json({ count: results.length, results });
    }

    const result = await ingestionService.processIncomingStream(connector, payload);
    return res.status(result.status === 'FAST_PATH_OK' ? 200 : 202).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Trigger Chaos Fault Simulation
 */
app.post('/api/v1/chaos/inject', async (req, res) => {
  try {
    const faultType = (req.body.fault_type || 'SCHEMA_DRIFT') as AnomalyCategory;
    const connector = req.body.connector || 'solar-grid-01';

    const simulation = chaosSimulator.generateFault(faultType, connector);

    // If ELT SQL error, execute real transactional staging & PostgreSQL SAVEPOINT dry-run
    if (faultType === 'ELT_SQL_ERROR') {
      const batchId = `00000000-0000-0000-0000-${Date.now().toString().slice(-12)}`;
      await eltWarehouse.seedStagingBatch(batchId, 100);

      const eltResult = await eltWarehouse.executeAndHealEltQuery(
        batchId,
        'SELECT emissions / power_consumed as efficiency FROM raw_staging_payloads WHERE batch_id = $1;'
      );

      io.emit('anomaly:quarantined', {
        quarantineId: batchId,
        connectorId: 'elt-warehouse-runner',
        anomalyType: 'ELT_SQL_ERROR',
        rawPayload: simulation.payload,
        errorMessage: 'SQLSTATE 22012: Division by zero in aggregation column "power_consumed"',
        timestamp: new Date().toISOString(),
      });

      io.emit('healer:diagnosed', {
        quarantineId: batchId,
        patchedPayload: { patchedSql: eltResult.patchedSql },
        ruleDefinition: { type: 'ELT_SQL_ERROR', rule: eltResult.ruleApplied },
        confidence: 0.99,
        healedMeta: {
          is_healed: true,
          anomalies_fixed: ['SQL_AST_ZERO_DIVISOR_REWRITE'],
          confidence: 0.99,
          healed_at: new Date().toISOString(),
          compute_saved_ms: Math.round(eltResult.avoidedRows * 1.42),
        },
      });

      const currentTotals = await greenMetrics.getTotals();
      io.emit('green:updated', {
        avoidedRows: eltResult.avoidedRows,
        totals: currentTotals,
      });

      return res.status(200).json({
        status: 'FAULT_HEALED_SAVEPOINT',
        simulation,
        patch: {
          patchedSql: eltResult.patchedSql,
          rule: eltResult.ruleApplied,
        },
        greenEvent: {
          avoided_backfill_rows: eltResult.avoidedRows,
        },
      });
    }

    // Process fault through 5-stage loop
    const result = await ingestionService.processIncomingStream(simulation.connector, simulation.payload);

    return res.status(200).json({
      simulation,
      result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Real Dashboard Bootstrap Data dynamically read from PostgreSQL
 */
app.get('/api/v1/dashboard/bootstrap', async (req, res) => {
  try {
    const fastPathCount = await warehouse.getFastPathCount();
    const healedCount = await warehouse.getHealedCount();
    const quarantineCount = await quarantine.getCount();
    const activeRules = hotCache.getAllActiveRules();
    const greenTotals = await greenMetrics.getTotals();
    const recentQuarantine = await quarantine.getRecent(10);
    const recentWarehouse = await warehouse.getRecentRecords(10);

    return res.status(200).json({
      cluster_status: {
        backend: 'ONLINE',
        websocket: 'HEALTHY',
        database_engine: 'PostgreSQL 16 / TimescaleDB',
        hot_rule_count: activeRules.length,
        autonomy_threshold: ingestionService.getAutonomyThreshold(),
        fast_path_count: fastPathCount,
        healed_count: healedCount,
        quarantine_count: quarantineCount,
        circuit_breaker: healer.getCircuitBreaker().getStats(),
        ai_model: healer.getLlmDiagnostic().getModelName(),
      },
      green_ledger_totals: greenTotals,
      grid_carbon: carbonScheduler.getStatus(),
      mqtt_stats: mqttAdapter.getStats(),
      lakehouse_overview: lakehouseSink.getOverview(),
      recent_quarantine: recentQuarantine,
      active_rules: activeRules,
      recent_warehouse: recentWarehouse,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Human-in-the-Loop (HITL) Approve / Reject
 */
app.post('/api/v1/quarantine/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const record = await quarantine.getRecord(id);
    if (!record) {
      return res.status(404).json({ error: 'Quarantine record not found' });
    }

    if (action === 'APPROVE') {
      await quarantine.updateStatus(id, 'AUTO_HEALED');
      if (record.healed_payload) {
        await warehouse.insertCleanRecord({
          ...record.healed_payload,
          is_healed: true,
        });
      }
      return res.status(200).json({ status: 'APPROVED_AND_COMMITTED', record });
    } else {
      await quarantine.updateStatus(id, 'ISOLATED');
      return res.status(200).json({ status: 'REJECTED_RETAINED_IN_DLQ', record });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Governance Rule Rollback
 */
app.post('/api/v1/rules/:id/revert', async (req, res) => {
  try {
    const { id } = req.params;
    const evicted = await hotCache.evictRule(id);
    const revertedWarehouseRows = await warehouse.revertByRuleId(id);

    io.emit('rule:reverted', { ruleId: id });

    return res.status(200).json({
      status: 'RULE_REVERTED',
      ruleId: id,
      evicted_from_cache: evicted,
      warehouse_rows_reverted: revertedWarehouseRows,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Set Autonomy Threshold
 */
app.post('/api/v1/settings/autonomy', (req, res) => {
  const threshold = parseFloat(req.body.threshold);
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    return res.status(400).json({ error: 'Threshold must be between 0.0 and 1.0' });
  }
  ingestionService.setAutonomyThreshold(threshold);
  return res.status(200).json({ autonomy_threshold: threshold });
});

/**
 * REST: Circuit Breaker Inspection
 */
app.get('/api/v1/circuit-breaker', (req, res) => {
  return res.status(200).json({
    stats: healer.getCircuitBreaker().getStats(),
    ai_model: healer.getLlmDiagnostic().getModelName(),
    has_external_api_key: healer.getLlmDiagnostic().hasExternalApiKey(),
  });
});

/**
 * REST: Reset Circuit Breaker
 */
app.post('/api/v1/circuit-breaker/reset', (req, res) => {
  healer.getCircuitBreaker().reset();
  return res.status(200).json({
    status: 'CIRCUIT_BREAKER_RESET',
    stats: healer.getCircuitBreaker().getStats(),
  });
});

/**
 * REST: Carbon-Aware Grid Intensity & Deferral (Phase 7)
 */
app.get('/api/v1/carbon/grid-intensity', (req, res) => {
  return res.status(200).json(carbonScheduler.getStatus());
});

app.post('/api/v1/carbon/grid-intensity', (req, res) => {
  const intensity = parseFloat(req.body.intensityGco2);
  if (isNaN(intensity)) {
    return res.status(400).json({ error: 'intensityGco2 must be a valid number' });
  }
  const status = carbonScheduler.setGridIntensity(intensity);
  return res.status(200).json(status);
});

app.post('/api/v1/carbon/deferral-toggle', (req, res) => {
  const active = Boolean(req.body.active);
  const status = carbonScheduler.setDeferralActive(active);
  return res.status(200).json(status);
});

app.post('/api/v1/carbon/execute-deferred', async (req, res) => {
  try {
    const result = await carbonScheduler.flushDeferredBatches(async (batch) => {
      return await eltWarehouse.executeAndHealEltQuery(
        batch.batchId,
        'SELECT emissions / power_consumed as efficiency FROM raw_staging_payloads WHERE batch_id = $1;'
      );
    });

    const currentTotals = await greenMetrics.getTotals();
    io.emit('green:updated', {
      avoidedRows: result.totalRowsProcessed,
      totals: currentTotals,
    });

    return res.status(200).json({
      status: 'DEFERRED_BATCHES_EXECUTED_DURING_GREEN_WINDOW',
      ...result,
      green_ledger_totals: currentTotals,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Industrial IoT MQTT Message Publish Simulation (Phase 7)
 */
app.post('/api/v1/mqtt/publish', async (req, res) => {
  try {
    const { topic, payload, qos } = req.body;
    if (!topic || !payload) {
      return res.status(400).json({ error: 'Missing topic or payload' });
    }
    const result = await mqttAdapter.handleMessage(topic, payload, qos);
    return res.status(200).json({
      status: 'MQTT_DELIVERED',
      topic,
      result,
      mqtt_stats: mqttAdapter.getStats(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Multi-Cloud Lakehouse & Warehouse Sinks (Phase 8)
 */
app.get('/api/v1/lakehouse/stats', (req, res) => {
  return res.status(200).json(lakehouseSink.getOverview());
});

app.post('/api/v1/lakehouse/flush', async (req, res) => {
  try {
    const manifest = await lakehouseSink.flushBuffer();
    return res.status(200).json({
      status: 'LAKEHOUSE_BUFFER_FLUSHED',
      manifest,
      overview: lakehouseSink.getOverview(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/lakehouse/export', async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit || '1000', 10);
    const manifest = await lakehouseSink.exportWarehouseRange(limit);
    return res.status(200).json({
      status: 'LAKEHOUSE_WAREHOUSE_EXPORT_COMPLETE',
      manifest,
      overview: lakehouseSink.getOverview(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REST: Phase 9 Enterprise NOC Governance & Mobile HITL Endpoints
 */
// 1. Pending HITL Queue
app.get('/api/v1/governance/hitl/pending', (req, res) => {
  return res.status(200).json({
    count: nocGovernance.getPendingQueue().length,
    items: nocGovernance.getPendingQueue()
  });
});

// 2. HITL Approval with RBAC
app.post('/api/v1/governance/hitl/approve', async (req, res) => {
  try {
    const { hitlId, decisionNotes } = req.body;
    const actorId = (req.headers['x-user-id'] as string) || req.body.actorId || 'NOC_OPERATOR_LEAD';
    const actorRole = ((req.headers['x-user-role'] as string) || req.body.actorRole || 'DATA_ENGINEER') as NocRole;

    if (!hitlId) {
      return res.status(400).json({ error: 'Missing hitlId in request body' });
    }

    const result = await nocGovernance.resolveHitlApproval({
      hitlId,
      decision: 'APPROVED',
      actorId,
      actorRole,
      decisionNotes,
      ipAddress: req.ip
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.message.includes('Forbidden') ? 403 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
});

// 3. HITL Rejection with RBAC
app.post('/api/v1/governance/hitl/reject', async (req, res) => {
  try {
    const { hitlId, decisionNotes } = req.body;
    const actorId = (req.headers['x-user-id'] as string) || req.body.actorId || 'NOC_OPERATOR_LEAD';
    const actorRole = ((req.headers['x-user-role'] as string) || req.body.actorRole || 'DATA_ENGINEER') as NocRole;

    if (!hitlId) {
      return res.status(400).json({ error: 'Missing hitlId in request body' });
    }

    const result = await nocGovernance.resolveHitlApproval({
      hitlId,
      decision: 'REJECTED',
      actorId,
      actorRole,
      decisionNotes,
      ipAddress: req.ip
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.message.includes('Forbidden') ? 403 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
});

// 4. Simulate Mobile HITL Alert
app.post('/api/v1/governance/hitl/simulate-alert', async (req, res) => {
  try {
    const deviceId = req.body?.deviceId || 'CLEANTECH_GRID_STORAGE_9B';
    const alert = await nocGovernance.simulateHitlAlert(deviceId);
    return res.status(201).json({
      status: 'SIMULATED_HITL_ALERT_QUEUED',
      alert,
      webhooksDispatched: ['SLACK', 'TEAMS', 'TELEGRAM']
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Remote Mobile Webhook Receiver (Slack / Teams / Telegram callback)
app.post('/api/v1/governance/webhook/:channel', async (req, res) => {
  try {
    const channel = req.params.channel.toUpperCase();
    const body = req.body;
    let hitlId: string | undefined;
    let decision: 'APPROVED' | 'REJECTED' = 'APPROVED';
    let actorId = `REMOTE_${channel}_USER`;

    if (channel === 'SLACK') {
      const payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body;
      const action = payload.actions?.[0];
      if (action) {
        decision = action.action_id === 'fluxheal_hitl_reject' ? 'REJECTED' : 'APPROVED';
        hitlId = action.value?.replace(/^(approve_|reject_)/, '');
      }
      actorId = payload.user?.username || actorId;
    } else if (channel === 'TEAMS') {
      decision = body.action === 'reject' ? 'REJECTED' : 'APPROVED';
      hitlId = body.hitlId;
    } else if (channel === 'TELEGRAM') {
      const data = body.callback_query?.data || body.callback_data || '';
      const parts = data.split(':');
      if (parts.length >= 3) {
        decision = parts[1] === 'reject' ? 'REJECTED' : 'APPROVED';
        hitlId = parts[2];
      }
      actorId = body.callback_query?.from?.username || actorId;
    }

    if (!hitlId) {
      return res.status(400).json({ error: 'Could not extract hitlId from webhook payload' });
    }

    const result = await nocGovernance.resolveHitlApproval({
      hitlId,
      decision,
      actorId,
      actorRole: 'FIELD_TECHNICIAN',
      decisionNotes: `Mobile webhook resolution via ${channel} by ${actorId}`,
      ipAddress: req.ip
    });

    return res.status(200).json({ status: 'WEBHOOK_PROCESSED', result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. Predictive Schema Drift Forecaster
app.get('/api/v1/governance/drift-forecast', async (req, res) => {
  try {
    const forecast = await nocGovernance.computeDriftForecast();
    return res.status(200).json(forecast);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Immutable Audit Logs & Lineage
app.get('/api/v1/governance/audit-logs', async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const role = req.query.role as NocRole | undefined;
    const action = req.query.action as string | undefined;

    const logs = await nocGovernance.getAuditLogs({ limit, role, action });
    return res.status(200).json({
      count: logs.length,
      logs
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. RBAC Matrix & Role Definitions
app.get('/api/v1/governance/rbac/roles', (req, res) => {
  return res.status(200).json({
    roles: nocGovernance.getRolePermissions()
  });
});

// 9. Outbound Webhook Dispatch History
app.get('/api/v1/governance/webhooks/history', (req, res) => {
  return res.status(200).json({
    dispatches: nocGovernance.getOutboundDispatches()
  });
});

// ---------------- WEBSOCKET CONNECTION ----------------
io.on('connection', async (socket) => {
  const totals = await greenMetrics.getTotals();
  socket.emit('system:ready', {
    status: 'CONNECTED',
    engine: 'PostgreSQL 16 & TimescaleDB',
    autonomy: ingestionService.getAutonomyThreshold(),
    totals,
  });
});

const PORT = process.env.PORT || 4000;

// Only listen if not loaded by test runner
if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
  pgDb.initSchema()
    .then(() => hotCache.hydrateFromDatabase())
    .then(() => {
      server.listen(PORT, () => {
        console.log(`[FluxHeal Engine] Running on port ${PORT} with PostgreSQL 16 & TimescaleDB`);
      });
    })
    .catch((err) => {
      console.error('[FluxHeal Engine] Failed to initialize PostgreSQL:', err.message);
    });
}

export {
  app,
  server,
  ingestionService,
  hotCache,
  timeSeries,
  healer,
  greenMetrics,
  quarantine,
  warehouse,
  eltWarehouse,
  carbonScheduler,
  mqttAdapter,
  lakehouseSink,
  nocGovernance,
  pgDb,
};
