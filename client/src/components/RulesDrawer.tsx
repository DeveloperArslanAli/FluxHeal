import React from 'react';
import { X, RotateCcw, Database, ShieldAlert } from 'lucide-react';
import { HealingRule } from '../types/index.js';

interface RulesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rules: HealingRule[];
  onRevertRule: (ruleId: string) => void;
}

export const RulesDrawer: React.FC<RulesDrawerProps> = ({
  isOpen,
  onClose,
  rules,
  onRevertRule,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-obsidian/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl h-full bg-surface border-l border-surface flex flex-col p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-intel/20 border border-cyan-intel/40 flex items-center justify-center">
              <Database className="w-5 h-5 text-cyan-intel" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-50">Hot-Rule Registry & Governance</h3>
              <p className="text-xs text-slate-400">In-memory compiled transformation rules executing in &lt;1ms</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface/80 hover:bg-surface border border-surface flex items-center justify-center text-slate-400 hover:text-slate-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rules List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 font-mono text-xs">
          {rules.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-center">
              <ShieldAlert className="w-8 h-8 text-slate-500 mb-2" />
              <div>No active rules cached yet.</div>
              <div className="text-[11px] text-slate-500 mt-1">
                Trigger a Schema Drift fault to observe automatic compilation and registration.
              </div>
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 rounded-xl bg-obsidian/70 border border-surface/80 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-intel/15 border border-cyan-intel/30 text-[10px] text-cyan-intel font-bold">
                      {rule.anomaly_category}
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">
                      sig: {rule.source_signature}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-emerald-flux font-bold">
                      {(rule.confidence_score * 100).toFixed(0)}% Conf
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {rule.times_triggered} hits
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-surface/40 text-[11px] text-slate-300 overflow-x-auto">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(rule.rule_definition, null, 2)}
                  </pre>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">
                    Compiled: {new Date(rule.created_at).toLocaleTimeString()}
                  </span>

                  <button
                    onClick={() => onRevertRule(rule.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Revert Rule & Restore Data</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
