import React from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

interface LiveDiffInspectorProps {
  rawPayload: Record<string, any> | null;
  healedPayload: Record<string, any> | null;
  anomalyType: string | null;
  errorMessage: string | null;
  confidence: number | null;
  ruleDefinition: any | null;
  healedMeta: any | null;
}

export const LiveDiffInspector: React.FC<LiveDiffInspectorProps> = ({
  rawPayload,
  healedPayload,
  anomalyType,
  errorMessage,
  confidence,
  ruleDefinition,
  healedMeta,
}) => {
  if (!rawPayload && !healedPayload) {
    return (
      <div className="h-full min-h-[300px] flex flex-col items-center justify-center border border-surface bg-surface/30 rounded-2xl p-8 text-center">
        <Sparkles className="w-10 h-10 text-cyan-intel/40 mb-3 animate-pulse" />
        <h3 className="text-sm font-semibold text-slate-50">Live Diff & Healing Inspector</h3>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          Trigger a chaos fault from the dock below or stream incoming telemetry to watch autonomous row-level isolation and side-by-side repair.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface/30 border border-surface rounded-2xl overflow-hidden backdrop-blur-md">
      {/* Header Bar */}
      <div className="h-11 px-4 border-b border-surface flex items-center justify-between bg-surface/40">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-intel animate-ping" />
          <span className="text-xs font-semibold text-slate-50 tracking-wide">Autonomous Mutation & Diff Inspector</span>
          {anomalyType && (
            <span className="px-2 py-0.5 rounded bg-surface border border-cyan-intel/30 text-[10px] font-mono text-cyan-intel font-bold">
              {anomalyType}
            </span>
          )}
        </div>

        {confidence !== null && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">AI Confidence:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-flux/15 border border-emerald-flux/30 text-emerald-flux font-mono text-[11px] font-bold">
              {(confidence * 100).toFixed(1)}% AUTO-VERIFIED
            </span>
          </div>
        )}
      </div>

      {/* Side-by-Side Dual Pane */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-surface overflow-hidden">
        {/* Left Column: Broken Raw Quarantine */}
        <div className="p-4 flex flex-col overflow-hidden bg-obsidian/40">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span>1. Defective Quarantined Payload</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 uppercase">ISOLATED IN &lt;1MS</span>
          </div>

          {errorMessage && (
            <div className="mb-2 p-2 rounded-lg bg-red-950/30 border border-red-500/20 text-[11px] font-mono text-red-300">
              {errorMessage}
            </div>
          )}

          <div className="flex-1 overflow-auto rounded-lg bg-obsidian p-3 border border-surface/60 font-mono text-xs text-slate-300">
            <pre className="whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(rawPayload, null, 2)}
            </pre>
          </div>
        </div>

        {/* Right Column: Healed Target Record */}
        <div className="p-4 flex flex-col overflow-hidden bg-obsidian/40">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-flux">
              <CheckCircle2 className="w-4 h-4" />
              <span>2. Synthesized Healed Record (Warehouse Ready)</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-flux font-semibold uppercase">IDEMPOTENT MERGE</span>
          </div>

          {healedMeta && (
            <div className="mb-2 p-2 rounded-lg bg-emerald-flux/10 border border-emerald-flux/30 text-[11px] font-mono text-emerald-flux flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span>Fixes: {healedMeta.anomalies_fixed.join(', ')}</span>
                <span className="text-[10px] text-slate-400">{healedMeta.compute_saved_ms}ms CPU Saved</span>
              </div>
              {healedMeta.method && (
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-intel flex-wrap">
                  <span className="px-1.5 py-0.2 rounded bg-cyan-intel/20 font-semibold border border-cyan-intel/30">
                    {healedMeta.method}
                  </span>
                  {healedMeta.explanation && (
                    <span className="text-slate-300 font-sans italic">{healedMeta.explanation}</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-auto rounded-lg bg-obsidian p-3 border border-surface/60 font-mono text-xs text-emerald-300">
            <pre className="whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(healedPayload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
