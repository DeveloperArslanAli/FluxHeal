import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { TopBar } from './components/TopBar.js';
import { TopologyCanvas, CanvasPulseTrigger } from './components/TopologyCanvas.js';
import { LiveDiffInspector } from './components/LiveDiffInspector.js';
import { EventLedger, LedgerItem } from './components/EventLedger.js';
import { ChaosDock } from './components/ChaosDock.js';
import { RulesDrawer } from './components/RulesDrawer.js';
import { LakehouseDrawer } from './components/LakehouseDrawer.js';
import { NocGovernanceDrawer } from './components/NocGovernanceDrawer.js';
import { HitlModal } from './components/HitlModal.js';
import {
  AnomalyCategory,
  GreenLedgerTotals,
  HealingRule,
  CircuitBreakerStats,
  GridCarbonStatus,
  LakehouseSystemOverview,
  NocRole,
} from './types/index.js';

export const App: React.FC = () => {
  const [socketConnected, setSocketConnected] = useState(false);
  const [connector, setConnector] = useState('solar-grid-01');
  const [autonomy, setAutonomy] = useState(0.90);
  const [circuitBreakerStats, setCircuitBreakerStats] = useState<CircuitBreakerStats | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [gridCarbon, setGridCarbon] = useState<GridCarbonStatus | null>(null);
  const [lakehouseOverview, setLakehouseOverview] = useState<LakehouseSystemOverview | null>(null);
  const [isAutoStreaming, setIsAutoStreaming] = useState(false);
  const [isInjecting, setIsInjecting] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isLakehouseOpen, setIsLakehouseOpen] = useState(false);
  const [isNocDrawerOpen, setIsNocDrawerOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<NocRole>('NOC_SUPER_ADMIN');
  const [pendingHitlCount, setPendingHitlCount] = useState(0);

  // Pure dynamic counters - ZERO hardcoding
  const [fastPathCount, setFastPathCount] = useState(0);
  const [quarantineCount, setQuarantineCount] = useState(0);
  const [healedCount, setHealedCount] = useState(0);
  const [cachedRules, setCachedRules] = useState<HealingRule[]>([]);
  const [pulseTrigger, setPulseTrigger] = useState<CanvasPulseTrigger | null>(null);

  // Dynamic green totals
  const [greenTotals, setGreenTotals] = useState<GreenLedgerTotals>({
    total_rows_avoided: 0,
    total_cpu_hours_saved: 0,
    total_energy_wh_saved: 0,
    total_co2_grams_saved: 0,
  });

  // Live Diff Inspector State
  const [rawPayload, setRawPayload] = useState<Record<string, any> | null>(null);
  const [healedPayload, setHealedPayload] = useState<Record<string, any> | null>(null);
  const [anomalyType, setAnomalyType] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [ruleDefinition, setRuleDefinition] = useState<any | null>(null);
  const [healedMeta, setHealedMeta] = useState<any | null>(null);

  // Event Ledger
  const [logs, setLogs] = useState<LedgerItem[]>([]);

  // HITL State
  const [hitlQuarantineId, setHitlQuarantineId] = useState<string | null>(null);
  const [hitlPayload, setHitlPayload] = useState<Record<string, any> | null>(null);
  const [hitlConfidence, setHitlConfidence] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const streamIntervalRef = useRef<any>(null);

  // Bootstrap dynamic state from real SQLite database
  useEffect(() => {
    fetch('http://localhost:4000/api/v1/dashboard/bootstrap')
      .then((res) => res.json())
      .then((data) => {
        if (data.cluster_status) {
          if (data.cluster_status.fast_path_count !== undefined) setFastPathCount(data.cluster_status.fast_path_count);
          if (data.cluster_status.healed_count !== undefined) setHealedCount(data.cluster_status.healed_count);
          if (data.cluster_status.quarantine_count !== undefined) setQuarantineCount(data.cluster_status.quarantine_count);
          if (data.cluster_status.circuit_breaker) setCircuitBreakerStats(data.cluster_status.circuit_breaker);
          if (data.cluster_status.ai_model) setAiModel(data.cluster_status.ai_model);
        }
        if (data.green_ledger_totals) setGreenTotals(data.green_ledger_totals);
        if (data.active_rules) setCachedRules(data.active_rules);
        if (data.grid_carbon) setGridCarbon(data.grid_carbon);
        if (data.lakehouse_overview) setLakehouseOverview(data.lakehouse_overview);
      })
      .catch(() => {
        console.log('[System] Waiting for backend to connect...');
      });

    // Initialize Socket.io
    const socket = io('http://localhost:4000', {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('circuit_breaker:state_change', (stats: CircuitBreakerStats) => {
      setCircuitBreakerStats(stats);
      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: stats.state === 'CLOSED' ? 'FAST_PATH' : 'QUARANTINE',
          title: `Circuit Breaker: ${stats.state}`,
          detail: `Timeouts: ${stats.totalTimeouts} | Failures: ${stats.failures} | Total Calls: ${stats.totalCalls}`,
          latencyMs: 0.1,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Real-Time Grid Carbon Intensity Updates (Phase 7)
    socket.on('grid:intensity_update', (status: GridCarbonStatus) => {
      setGridCarbon(status);
    });

    socket.on('carbon:batch_deferred', (data: any) => {
      if (data.status) setGridCarbon(data.status);
      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: 'QUARANTINE',
          title: `ELT Batch Deferred: ${data.batch?.recordCount} rows`,
          detail: `Grid carbon intensity (${data.batch?.peakIntensityGco2} gCO₂/kWh) exceeds threshold. Queued for clean solar window.`,
          latencyMs: 0.1,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    socket.on('carbon:batch_executed', (data: any) => {
      if (data.status) setGridCarbon(data.status);
      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: 'FAST_PATH',
          title: `Green Window Execution: ${data.totalRowsProcessed} rows`,
          detail: `Executed during clean grid window! Saved ${data.carbonGramsSaved} gCO₂e Scope 3 emissions.`,
          latencyMs: 1.2,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Real-Time Lakehouse Columnar Compaction Events (Phase 8)
    socket.on('lakehouse:flush_complete', (data: any) => {
      if (data.overview) setLakehouseOverview(data.overview);
      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: 'FAST_PATH',
          title: `Lakehouse Parquet Chunk: ${data.manifest?.recordCount || 0} rows`,
          detail: `Columnar compressed at ${data.manifest?.compressionRatio || 4.2}x ratio to ${data.manifest?.fileUri?.split('/').pop()}`,
          latencyMs: 0.8,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Enterprise NOC Governance & Mobile HITL Events (Phase 9)
    socket.on('hitl:new_pending', (item: any) => {
      setPendingHitlCount((prev) => prev + 1);
      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: 'QUARANTINE',
          title: `NOC HITL Alert: ${item.deviceId}`,
          detail: `${item.anomalyType} (Confidence: ${(item.confidenceScore * 100).toFixed(1)}%). Dispatched to Slack, Teams, & Telegram.`,
          latencyMs: 1.2,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    socket.on('hitl:resolved', (item: any) => {
      setPendingHitlCount((prev) => Math.max(0, prev - 1));
      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: item.status === 'APPROVED' ? 'HEALED' : 'QUARANTINE',
          title: `HITL Resolved: ${item.deviceId}`,
          detail: `Marked as ${item.status} by ${item.reviewedBy || 'Operator'} (${item.reviewerRole || 'NOC'}).`,
          latencyMs: 0.5,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Real-Time Stream: Packet (Fast Path)
    socket.on('stream:packet', (data: any) => {
      setFastPathCount((prev) => prev + 1);
      setPulseTrigger({ id: data.id, type: 'FAST_PATH', timestamp: Date.now() });

      setLogs((prev) => [
        {
          id: data.id || Math.random().toString(),
          type: 'FAST_PATH',
          title: `Telemetry Record: ${data.telemetry?.device_id || 'SOLAR-INV'}`,
          detail: `Power: ${data.telemetry?.power_kw}kW | Temp: ${data.telemetry?.temperature_c}°C ${data.cachedRuleApplied ? '(Hot-Rule Cache Hit <1ms)' : ''}`,
          latencyMs: data.latencyMs || 0.45,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Real-Time Anomaly Quarantined
    socket.on('anomaly:quarantined', (data: any) => {
      setQuarantineCount((prev) => prev + 1);
      setPulseTrigger({ id: data.quarantineId, type: 'ANOMALOUS_HEAL', timestamp: Date.now() });

      setRawPayload(data.rawPayload);
      setAnomalyType(data.anomalyType);
      setErrorMessage(data.errorMessage);
      setHealedPayload(null);
      setConfidence(null);

      setLogs((prev) => [
        {
          id: data.quarantineId,
          type: 'QUARANTINE',
          title: `Defective Row Quarantined: ${data.anomalyType}`,
          detail: data.errorMessage,
          latencyMs: 1.12,
          timestamp: data.timestamp || new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Real-Time Healer Diagnosed
    socket.on('healer:diagnosed', (data: any) => {
      setHealedCount((prev) => prev + 1);
      setHealedPayload(data.patchedPayload);
      setConfidence(data.confidence);
      setRuleDefinition(data.ruleDefinition);
      setHealedMeta(data.healedMeta);

      if (data.requiresHitl) {
        setHitlQuarantineId(data.quarantineId);
        setHitlPayload(data.patchedPayload);
        setHitlConfidence(data.confidence);
      }

      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: 'HEALED',
          title: `Autonomous Patch Synthesized (${(data.confidence * 100).toFixed(0)}% Confidence)`,
          detail: `Idempotent merge committed to warehouse.`,
          latencyMs: 0.84,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Real-Time Rule Cached
    socket.on('rule:cached', (data: any) => {
      setCachedRules((prev) => {
        if (prev.some((r) => r.id === data.ruleId)) return prev;
        return [data, ...prev];
      });
      setLogs((prev) => [
        {
          id: Math.random().toString(),
          type: 'RULE_CACHED',
          title: `Hot-Rule Cache Hydrated: ${data.category}`,
          detail: `Future matches will execute deterministically in <1ms without LLM.`,
          latencyMs: 0.12,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 40),
      ]);
    });

    // Real-Time Green Ledger Updated
    socket.on('green:updated', (data: any) => {
      if (data.totals) {
        setGreenTotals(data.totals);
      }
    });

    socket.on('rule:reverted', (data: any) => {
      setCachedRules((prev) => prev.filter((r) => r.id !== data.ruleId));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Handle Autonomy Change
  const handleAutonomyChange = async (val: number) => {
    setAutonomy(val);
    try {
      await fetch('http://localhost:4000/api/v1/settings/autonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: val }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Inject Chaos Fault
  const handleInjectFault = async (faultType: AnomalyCategory) => {
    setIsInjecting(true);
    try {
      await fetch('http://localhost:4000/api/v1/chaos/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fault_type: faultType, connector }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsInjecting(false), 500);
    }
  };

  // Toggle Auto Stream
  const handleToggleAutoStream = () => {
    if (isAutoStreaming) {
      clearInterval(streamIntervalRef.current);
      setIsAutoStreaming(false);
    } else {
      setIsAutoStreaming(true);
      streamIntervalRef.current = setInterval(async () => {
        try {
          const sample = {
            device_id: `SOLAR-INV-${Math.floor(Math.random() * 20) + 1}`,
            timestamp: new Date().toISOString(),
            power_kw: Math.round((40 + Math.random() * 25) * 10) / 10,
            voltage_v: Math.round((225 + Math.random() * 10) * 10) / 10,
            temperature_c: Math.round((28 + Math.random() * 8) * 10) / 10,
          };
          await fetch(`http://localhost:4000/api/v1/ingest/${connector}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sample),
          });
        } catch (e) {
          console.error(e);
        }
      }, 700);
    }
  };

  // Revert Rule
  const handleRevertRule = async (ruleId: string) => {
    try {
      await fetch(`http://localhost:4000/api/v1/rules/${ruleId}/revert`, {
        method: 'POST',
      });
      setCachedRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (e) {
      console.error(e);
    }
  };

  // HITL Approve
  const handleHitlApprove = async (id: string) => {
    try {
      await fetch(`http://localhost:4000/api/v1/quarantine/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      });
      setHitlQuarantineId(null);
    } catch (e) {
      console.error(e);
    }
  };

  // HITL Reject
  const handleHitlReject = async (id: string) => {
    try {
      await fetch(`http://localhost:4000/api/v1/quarantine/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT' }),
      });
      setHitlQuarantineId(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Carbon Deferral Toggle (Phase 7)
  const handleToggleDeferral = async () => {
    if (!gridCarbon) return;
    try {
      const res = await fetch('http://localhost:4000/api/v1/carbon/deferral-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !gridCarbon.deferralActive }),
      });
      const updated = await res.json();
      setGridCarbon(updated);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-slate-50 flex flex-col font-sans">
      {/* Top Bar with Dynamic Carbon & Health Ribbon */}
      <TopBar
        totals={greenTotals}
        autonomy={autonomy}
        onAutonomyChange={handleAutonomyChange}
        connector={connector}
        onConnectorChange={setConnector}
        isConnected={socketConnected}
        onOpenRules={() => setIsRulesOpen(true)}
        onOpenLakehouse={() => setIsLakehouseOpen(true)}
        onOpenNocGovernance={() => setIsNocDrawerOpen(true)}
        activeRole={activeRole}
        onRoleChange={setActiveRole}
        pendingHitlCount={pendingHitlCount}
        hotRuleCount={cachedRules.length}
        circuitBreakerStats={circuitBreakerStats}
        aiModel={aiModel}
        gridCarbon={gridCarbon}
        onToggleDeferral={handleToggleDeferral}
      />

      {/* Main Mission Control Canvas & Panels */}
      <main className="flex-1 p-4 lg:p-6 flex flex-col gap-5 max-w-[1720px] mx-auto w-full">
        {/* Row 1: Real-Time 5-Stage Autonomous Loop Canvas */}
        <section>
          <TopologyCanvas
            fastPathCount={fastPathCount}
            quarantineCount={quarantineCount}
            healedCount={healedCount}
            cachedRuleCount={cachedRules.length}
            pulseTrigger={pulseTrigger}
          />
        </section>

        {/* Row 2: Live Side-by-Side Diff & Real-Time Stream Ledger */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[380px]">
          <div className="lg:col-span-7">
            <LiveDiffInspector
              rawPayload={rawPayload}
              healedPayload={healedPayload}
              anomalyType={anomalyType}
              errorMessage={errorMessage}
              confidence={confidence}
              ruleDefinition={ruleDefinition}
              healedMeta={healedMeta}
            />
          </div>

          <div className="lg:col-span-5">
            <EventLedger logs={logs} />
          </div>
        </section>

        {/* Row 3: Bottom Chaos Fault Injection Dock */}
        <section>
          <ChaosDock
            onInjectFault={handleInjectFault}
            isAutoStreaming={isAutoStreaming}
            onToggleAutoStream={handleToggleAutoStream}
            isInjecting={isInjecting}
            circuitBreakerStats={circuitBreakerStats}
          />
        </section>
      </main>

      {/* Governance Rules Registry Drawer */}
      <RulesDrawer
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
        rules={cachedRules}
        onRevertRule={handleRevertRule}
      />

      {/* Multi-Cloud Lakehouse & Sinks Drawer (Phase 8) */}
      <LakehouseDrawer
        isOpen={isLakehouseOpen}
        onClose={() => setIsLakehouseOpen(false)}
        overview={lakehouseOverview}
        onRefresh={() => {
          fetch('http://localhost:4000/api/v1/lakehouse/stats')
            .then((r) => r.json())
            .then((d) => setLakehouseOverview(d))
            .catch(() => {});
        }}
      />

      {/* Enterprise NOC Governance & Mobile HITL Drawer (Phase 9) */}
      <NocGovernanceDrawer
        isOpen={isNocDrawerOpen}
        onClose={() => setIsNocDrawerOpen(false)}
        activeRole={activeRole}
        onRoleChange={setActiveRole}
        pendingHitlCount={pendingHitlCount}
      />

      {/* Confidence-Gated Human-in-the-Loop Action Card */}
      <HitlModal
        quarantineId={hitlQuarantineId}
        patchedPayload={hitlPayload}
        confidence={hitlConfidence}
        onApprove={handleHitlApprove}
        onReject={handleHitlReject}
      />
    </div>
  );
};
