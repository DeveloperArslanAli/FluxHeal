import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Send, 
  UserCheck, 
  Lock, 
  Eye, 
  FileCode, 
  Sparkles,
  Smartphone,
  RefreshCw
} from 'lucide-react';
import { 
  HitlQueueItem, 
  NocRole, 
  OutboundWebhookDispatch, 
  SchemaDriftForecast, 
  NocAuditLogEntry 
} from '../types/index.js';

interface NocGovernanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeRole: NocRole;
  onRoleChange: (role: NocRole) => void;
  pendingHitlCount: number;
}

export const NocGovernanceDrawer: React.FC<NocGovernanceDrawerProps> = ({
  isOpen,
  onClose,
  activeRole,
  onRoleChange,
  pendingHitlCount,
}) => {
  const [activeTab, setActiveTab] = useState<'HITL' | 'DRIFT' | 'WEBHOOKS' | 'AUDIT'>('HITL');
  const [pendingItems, setPendingItems] = useState<HitlQueueItem[]>([]);
  const [forecast, setForecast] = useState<SchemaDriftForecast | null>(null);
  const [dispatches, setDispatches] = useState<OutboundWebhookDispatch[]>([]);
  const [auditLogs, setAuditLogs] = useState<NocAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const canApprove = ['NOC_SUPER_ADMIN', 'DATA_ENGINEER', 'FIELD_TECHNICIAN'].includes(activeRole);
  const canReject = ['NOC_SUPER_ADMIN', 'DATA_ENGINEER', 'FIELD_TECHNICIAN'].includes(activeRole);

  const fetchPendingQueue = async () => {
    try {
      const res = await fetch('/api/v1/governance/hitl/pending');
      if (res.ok) {
        const data = await res.json();
        setPendingItems(data.items || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchDriftForecast = async () => {
    try {
      const res = await fetch('/api/v1/governance/drift-forecast');
      if (res.ok) {
        const data = await res.json();
        setForecast(data);
      }
    } catch {
      // ignore
    }
  };

  const fetchDispatches = async () => {
    try {
      const res = await fetch('/api/v1/governance/webhooks/history');
      if (res.ok) {
        const data = await res.json();
        setDispatches(data.dispatches || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/v1/governance/audit-logs?limit=30');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchPendingQueue(),
      fetchDriftForecast(),
      fetchDispatches(),
      fetchAuditLogs()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshAll();
    }
  }, [isOpen]);

  const handleResolve = async (hitlId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      setLoading(true);
      const endpoint = decision === 'APPROVED' ? '/api/v1/governance/hitl/approve' : '/api/v1/governance/hitl/reject';
      const notes = decisionNotes[hitlId] || `Resolved as ${decision} via Mission Control NOC Drawer`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'NOC_MISSION_CONTROL_OPERATOR',
          'x-user-role': activeRole,
        },
        body: JSON.stringify({ hitlId, decisionNotes: notes }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to resolve item');
      }

      setActionMessage(`✓ Success: Item ${hitlId.slice(0, 8)}... marked as ${decision}.`);
      setTimeout(() => setActionMessage(null), 4000);
      await refreshAll();
    } catch (err: any) {
      setActionMessage(`❌ Error: ${err.message}`);
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateAlert = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/governance/hitl/simulate-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'GRID_STORAGE_PACK_' + Math.floor(Math.random() * 900 + 100) }),
      });
      if (res.ok) {
        setActionMessage('✓ Dispatched simulated clean-tech HITL alert to Slack, Teams, & Telegram!');
        setTimeout(() => setActionMessage(null), 4000);
        await refreshAll();
      }
    } catch (err: any) {
      setActionMessage(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateWebhookCallback = async (channel: 'SLACK' | 'TEAMS' | 'TELEGRAM', hitlId: string, action: 'approve' | 'reject') => {
    try {
      setLoading(true);
      let payload: any = {};
      if (channel === 'SLACK') {
        payload = {
          payload: JSON.stringify({
            user: { username: 'mobile_field_eng' },
            actions: [{ action_id: action === 'approve' ? 'fluxheal_hitl_approve' : 'fluxheal_hitl_reject', value: `${action}_${hitlId}` }]
          })
        };
      } else if (channel === 'TEAMS') {
        payload = { action, hitlId };
      } else {
        payload = { callback_data: `hitl:${action}:${hitlId}` };
      }

      const res = await fetch(`/api/v1/governance/webhook/${channel.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setActionMessage(`✓ Simulated mobile webhook callback received from ${channel}!`);
        setTimeout(() => setActionMessage(null), 4000);
        await refreshAll();
      }
    } catch (err: any) {
      setActionMessage(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-4xl bg-obsidian border-l border-surface flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-surface bg-surface/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-flux/10 border border-emerald-flux/30 flex items-center justify-center text-emerald-flux">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">Enterprise NOC Governance & HITL</h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-intel/20 border border-cyan-intel/30 text-cyan-intel">
                  Phase 9
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Confidence-gated triage, mobile webhooks, predictive drift forecasting, & RBAC lineage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Active Role Selector */}
            <div className="flex items-center gap-2 bg-surface/60 border border-surface px-3 py-1 rounded-lg">
              <UserCheck className="w-3.5 h-3.5 text-cyan-intel" />
              <span className="text-xs text-slate-400">Role:</span>
              <select
                value={activeRole}
                onChange={(e) => onRoleChange(e.target.value as NocRole)}
                className="bg-transparent text-xs font-mono font-bold text-cyan-intel focus:outline-none cursor-pointer"
              >
                <option value="NOC_SUPER_ADMIN" className="bg-obsidian text-slate-100">NOC_SUPER_ADMIN (Full)</option>
                <option value="DATA_ENGINEER" className="bg-obsidian text-slate-100">DATA_ENGINEER (Triage)</option>
                <option value="FIELD_TECHNICIAN" className="bg-obsidian text-slate-100">FIELD_TECHNICIAN (HITL)</option>
                <option value="ESG_ANALYST" className="bg-obsidian text-slate-100">ESG_ANALYST (Carbon)</option>
                <option value="READONLY_AUDITOR" className="bg-obsidian text-slate-100">READONLY_AUDITOR (View)</option>
              </select>
            </div>

            <button
              onClick={refreshAll}
              disabled={loading}
              className="p-1.5 rounded-lg bg-surface hover:bg-surface/80 border border-surface text-slate-300 hover:text-slate-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-surface hover:bg-surface/80 border border-surface text-slate-300 hover:text-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Action Banner */}
        {actionMessage && (
          <div className="px-6 py-2 bg-emerald-flux/10 border-b border-emerald-flux/20 text-xs font-mono text-emerald-flux flex items-center justify-between">
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="px-6 border-b border-surface bg-obsidian flex items-center justify-between">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('HITL')}
              className={`px-4 py-3 text-xs font-mono font-medium border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'HITL'
                  ? 'border-emerald-flux text-emerald-flux bg-emerald-flux/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Pending HITL Queue</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                pendingItems.length > 0 ? 'bg-amber-400/20 text-amber-300' : 'bg-surface text-slate-400'
              }`}>
                {pendingItems.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('DRIFT')}
              className={`px-4 py-3 text-xs font-mono font-medium border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'DRIFT'
                  ? 'border-cyan-intel text-cyan-intel bg-cyan-intel/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Predictive Schema Drift</span>
              {forecast?.detectedDrifts && forecast.detectedDrifts.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-cyan-intel/20 text-cyan-intel">
                  {forecast.detectedDrifts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('WEBHOOKS')}
              className={`px-4 py-3 text-xs font-mono font-medium border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'WEBHOOKS'
                  ? 'border-emerald-flux text-emerald-flux bg-emerald-flux/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Mobile Webhooks Log</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-surface text-slate-400">
                {dispatches.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`px-4 py-3 text-xs font-mono font-medium border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'AUDIT'
                  ? 'border-cyan-intel text-cyan-intel bg-cyan-intel/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Audit Lineage</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-surface text-slate-400">
                {auditLogs.length}
              </span>
            </button>
          </div>

          {activeTab === 'HITL' && (
            <button
              onClick={handleSimulateAlert}
              disabled={loading}
              className="flex items-center gap-1.5 bg-emerald-flux/10 hover:bg-emerald-flux/20 text-emerald-flux border border-emerald-flux/30 text-xs font-mono px-3 py-1.5 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simulate HITL Anomaly</span>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: HITL QUEUE */}
          {activeTab === 'HITL' && (
            <div className="space-y-4">
              {pendingItems.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-surface rounded-xl bg-surface/10 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-flux/10 border border-emerald-flux/30 mx-auto flex items-center justify-center text-emerald-flux">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200">Zero Anomalies in HITL Threshold</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    All incoming clean-tech telemetry is passing the autonomous confidence threshold (&ge; 90%).
                    Click "Simulate HITL Anomaly" above to test low-confidence triage and webhook routing.
                  </p>
                </div>
              ) : (
                pendingItems.map((item) => (
                  <div
                    key={item.id}
                    className="border border-surface rounded-xl bg-surface/20 p-5 space-y-4 hover:border-cyan-intel/40 transition-colors"
                  >
                    {/* Item Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                          {item.anomalyType}
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-100">{item.deviceId}</span>
                        <span className="text-xs text-slate-400 font-mono">({item.sourceConnector})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono">Confidence:</span>
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {(item.confidenceScore * 100).toFixed(1)}%
                        </span>
                        <div className="w-16 h-2 bg-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400"
                            style={{ width: `${item.confidenceScore * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Method & Reasoning */}
                    <div className="bg-obsidian/70 border border-surface rounded-lg p-3 text-xs font-mono space-y-1">
                      <div className="text-slate-300">
                        <span className="text-cyan-intel">Method:</span> {item.appliedMethod}
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">Reasoning:</span> {item.reasoning}
                      </div>
                    </div>

                    {/* Live Diff Preview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      <div className="bg-obsidian/90 border border-red-500/20 rounded-lg p-3 space-y-1">
                        <div className="text-[10px] text-red-400 uppercase font-semibold">Raw Broken Payload</div>
                        <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed">
                          {JSON.stringify(item.rawPayload, null, 2)}
                        </pre>
                      </div>

                      <div className="bg-obsidian/90 border border-emerald-500/20 rounded-lg p-3 space-y-1">
                        <div className="text-[10px] text-emerald-400 uppercase font-semibold">Proposed Patched Telemetry</div>
                        <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed">
                          {JSON.stringify(item.proposedPayload, null, 2)}
                        </pre>
                      </div>
                    </div>

                    {/* Operator Note & Action Buttons */}
                    <div className="pt-2 border-t border-surface/50 flex flex-col md:flex-row items-center justify-between gap-3">
                      <input
                        type="text"
                        placeholder="Operator triage justification notes..."
                        value={decisionNotes[item.id] || ''}
                        onChange={(e) => setDecisionNotes({ ...decisionNotes, [item.id]: e.target.value })}
                        className="w-full md:w-80 bg-obsidian border border-surface text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-intel font-mono"
                      />

                      <div className="flex items-center gap-2 self-end">
                        {/* Simulation Quick Callback */}
                        <button
                          onClick={() => handleSimulateWebhookCallback('SLACK', item.id, 'approve')}
                          disabled={loading}
                          className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface/80 border border-surface text-[11px] font-mono text-cyan-intel transition-colors"
                          title="Simulate remote Slack mobile approval"
                        >
                          📱 Slack Mobile
                        </button>

                        <button
                          onClick={() => handleResolve(item.id, 'REJECTED')}
                          disabled={!canReject || loading}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                            canReject
                              ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-surface/40 text-slate-500 border border-surface cursor-not-allowed'
                          }`}
                          title={!canReject ? `Role '${activeRole}' lacks 'hitl:reject'` : ''}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject to DLQ</span>
                        </button>

                        <button
                          onClick={() => handleResolve(item.id, 'APPROVED')}
                          disabled={!canApprove || loading}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                            canApprove
                              ? 'bg-emerald-flux/20 hover:bg-emerald-flux/30 text-emerald-flux border border-emerald-flux/40'
                              : 'bg-surface/40 text-slate-500 border border-surface cursor-not-allowed'
                          }`}
                          title={!canApprove ? `Role '${activeRole}' lacks 'hitl:approve'` : ''}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve & Ingest</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: PREDICTIVE SCHEMA DRIFT */}
          {activeTab === 'DRIFT' && forecast && (
            <div className="space-y-6">
              {/* Risk Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface/30 border border-surface rounded-xl p-4 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Drift Probability</span>
                  <div className="text-2xl font-mono font-bold text-cyan-intel">
                    {(forecast.overallDriftProbability * 100).toFixed(0)}%
                  </div>
                  <span className="text-[11px] text-slate-400">Statistical field entropy score</span>
                </div>

                <div className="bg-surface/30 border border-surface rounded-xl p-4 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Risk Level</span>
                  <div className={`text-2xl font-mono font-bold ${
                    forecast.riskLevel === 'CRITICAL' ? 'text-red-400' :
                    forecast.riskLevel === 'HIGH' ? 'text-amber-400' : 'text-emerald-flux'
                  }`}>
                    {forecast.riskLevel}
                  </div>
                  <span className="text-[11px] text-slate-400">Pre-deployment alert classification</span>
                </div>

                <div className="bg-surface/30 border border-surface rounded-xl p-4 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Time to Outage</span>
                  <div className="text-2xl font-mono font-bold text-slate-100">
                    ~{forecast.estimatedHoursToBreakage} hrs
                  </div>
                  <span className="text-[11px] text-slate-400">Estimated firmware mutation horizon</span>
                </div>
              </div>

              {/* Detected Drifts & Migration SQL */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  Detected Mutation Patterns & Pre-Deployment Transforms
                </h3>
                {forecast.detectedDrifts.map((drift, idx) => (
                  <div key={idx} className="bg-surface/20 border border-surface rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-300 font-bold">{drift.field}</span>
                        <span className="text-slate-500">&rarr;</span>
                        <span className="text-emerald-flux font-bold">{drift.targetCanonical}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">Confidence: {(drift.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs text-slate-400">{drift.mutationPattern}</p>
                    <div className="bg-obsidian border border-surface rounded-lg p-2.5 text-[11px] font-mono text-cyan-intel overflow-x-auto">
                      {drift.suggestedTransformSql}
                    </div>
                  </div>
                ))}
              </div>

              {/* Field Statistics Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  Telemetry Field Entropy & Presence Distribution
                </h3>
                <div className="border border-surface rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-surface/50 text-slate-400 border-b border-surface">
                      <tr>
                        <th className="py-2.5 px-4">Field Name</th>
                        <th className="py-2.5 px-4">Data Type</th>
                        <th className="py-2.5 px-4">Presence Rate</th>
                        <th className="py-2.5 px-4">Entropy</th>
                        <th className="py-2.5 px-4">Classification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface/40 text-slate-200">
                      {forecast.activeFields.map((f, i) => (
                        <tr key={i} className="hover:bg-surface/20">
                          <td className="py-2.5 px-4 font-bold text-slate-100">{f.fieldName}</td>
                          <td className="py-2.5 px-4 text-slate-400">{f.dataType}</td>
                          <td className="py-2.5 px-4 text-cyan-intel">{(f.presenceRate * 100).toFixed(0)}%</td>
                          <td className="py-2.5 px-4 text-slate-400">{f.entropyScore}</td>
                          <td className="py-2.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              f.status === 'CANONICAL' ? 'bg-emerald-flux/10 text-emerald-flux' :
                              f.status === 'MUTATING' ? 'bg-amber-400/20 text-amber-300' :
                              'bg-cyan-intel/20 text-cyan-intel'
                            }`}>
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: WEBHOOKS LOG */}
          {activeTab === 'WEBHOOKS' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Outbound alerts dispatched to Slack Block Kit, MS Teams Adaptive Cards, & Telegram.</span>
                <span className="font-mono text-cyan-intel">{dispatches.length} Total Dispatches</span>
              </div>

              {dispatches.map((d) => (
                <div key={d.dispatchId} className="bg-surface/20 border border-surface rounded-xl p-4 space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        d.channel === 'SLACK' ? 'bg-[#4A154B]/50 text-pink-300 border border-pink-400/30' :
                        d.channel === 'TEAMS' ? 'bg-[#5059C9]/50 text-indigo-300 border border-indigo-400/30' :
                        'bg-[#0088CC]/50 text-cyan-200 border border-cyan-400/30'
                      }`}>
                        {d.channel}
                      </span>
                      <span className="text-slate-200 font-bold">{d.payloadSummary}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {new Date(d.dispatchedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 truncate">
                    Target: {d.targetUrl}
                  </div>

                  <details className="cursor-pointer group">
                    <summary className="text-[11px] text-cyan-intel hover:underline select-none">
                      Inspect Formatted JSON Payload Body &rarr;
                    </summary>
                    <div className="mt-2 bg-obsidian border border-surface rounded-lg p-3 text-[11px] text-slate-300 overflow-x-auto max-h-48">
                      <pre>{JSON.stringify(d.formattedBody, null, 2)}</pre>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: AUDIT LINEAGE */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Cryptographic immutable audit ledger recorded in PostgreSQL <code className="text-cyan-intel">noc_audit_ledger</code>.
              </div>

              <div className="border border-surface rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-surface/50 text-slate-400 border-b border-surface">
                    <tr>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Actor ID</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Entity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface/40 text-slate-200">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface/20">
                        <td className="py-2 px-4 text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(log.recordedAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-4 font-bold text-slate-100">{log.actorId}</td>
                        <td className="py-2 px-4">
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-surface border border-surface text-cyan-intel font-semibold">
                            {log.actorRole}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-emerald-flux">{log.actionType}</td>
                        <td className="py-2 px-4 text-slate-400">{log.targetEntity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
