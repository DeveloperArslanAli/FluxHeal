import React from 'react';
import { Activity, ShieldCheck, Zap } from 'lucide-react';

export interface LedgerItem {
  id: string;
  type: 'FAST_PATH' | 'QUARANTINE' | 'HEALED' | 'RULE_CACHED';
  title: string;
  detail: string;
  latencyMs: number;
  timestamp: string;
}

interface EventLedgerProps {
  logs: LedgerItem[];
}

export const EventLedger: React.FC<EventLedgerProps> = ({ logs }) => {
  return (
    <div className="h-full flex flex-col bg-surface/30 border border-surface rounded-2xl overflow-hidden backdrop-blur-md">
      <div className="h-11 px-4 border-b border-surface flex items-center justify-between bg-surface/40">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-flux" />
          <span className="text-xs font-semibold text-slate-50 tracking-wide">Real-Time Ingestion & Healing Ledger</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">SUB-SECOND EVENT STREAM</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
            Awaiting streaming events...
          </div>
        ) : (
          logs.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-xl bg-obsidian/60 border border-surface/80 flex items-center justify-between hover:border-cyan-intel/40 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {item.type === 'FAST_PATH' && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-flux/15 text-[10px] text-emerald-flux font-bold border border-emerald-flux/30">
                    FAST_PATH
                  </span>
                )}
                {item.type === 'HEALED' && (
                  <span className="px-1.5 py-0.5 rounded bg-cyan-intel/15 text-[10px] text-cyan-intel font-bold border border-cyan-intel/30">
                    AI_HEALED
                  </span>
                )}
                {item.type === 'QUARANTINE' && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[10px] text-amber-400 font-bold border border-amber-500/30">
                    QUARANTINE
                  </span>
                )}
                {item.type === 'RULE_CACHED' && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-[10px] text-purple-400 font-bold border border-purple-500/30">
                    RULE_CACHED
                  </span>
                )}

                <div>
                  <div className="text-slate-200 font-semibold text-xs">{item.title}</div>
                  <div className="text-[11px] text-slate-400">{item.detail}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-emerald-flux tabular-nums font-semibold">
                  {item.latencyMs.toFixed(2)}ms
                </div>
                <div className="text-[10px] text-slate-500">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
