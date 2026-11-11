import React from 'react';
import { Zap, Flame, Type, Database, Play, Pause, Sparkles, ShieldAlert } from 'lucide-react';
import { AnomalyCategory, CircuitBreakerStats } from '../types/index.js';

interface ChaosDockProps {
  onInjectFault: (type: AnomalyCategory) => void;
  isAutoStreaming: boolean;
  onToggleAutoStream: () => void;
  isInjecting: boolean;
  circuitBreakerStats?: CircuitBreakerStats | null;
}

export const ChaosDock: React.FC<ChaosDockProps> = ({
  onInjectFault,
  isAutoStreaming,
  onToggleAutoStream,
  isInjecting,
  circuitBreakerStats,
}) => {
  return (
    <div className="bg-surface/60 border border-surface rounded-2xl p-4 backdrop-blur-md">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-intel/15 border border-cyan-intel/40 flex items-center justify-center">
            <Zap className="w-4 h-4 text-cyan-intel" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-50 uppercase tracking-wider">Chaos Fault Injection Studio</h4>
            <p className="text-[11px] text-slate-400">Trigger live real-time anomalies to observe autonomous healing & circuit breaker</p>
          </div>
        </div>

        {/* 6 Chaos Injector Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 w-full lg:w-auto">
          {/* 1. Schema Drift (Tier-1) */}
          <button
            onClick={() => onInjectFault('SCHEMA_DRIFT')}
            disabled={isInjecting}
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-surface hover:border-cyan-intel/60 text-slate-50 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-cyan-intel shrink-0" />
            <div className="text-left overflow-hidden">
              <div className="truncate">Schema Drift</div>
              <div className="text-[9px] font-mono text-slate-400 truncate">Tier-1 Heuristic</div>
            </div>
          </button>

          {/* 2. Sensor -9999 Spike */}
          <button
            onClick={() => onInjectFault('SENSOR_OUTLIER')}
            disabled={isInjecting}
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-surface hover:border-cyan-intel/60 text-slate-50 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="text-left overflow-hidden">
              <div className="truncate">Sensor Spike</div>
              <div className="text-[9px] font-mono text-slate-400 truncate">-9999°C EMA</div>
            </div>
          </button>

          {/* 3. Dirty Units */}
          <button
            onClick={() => onInjectFault('TYPE_MISMATCH')}
            disabled={isInjecting}
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-surface hover:border-cyan-intel/60 text-slate-50 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            <Type className="w-3.5 h-3.5 text-emerald-flux shrink-0" />
            <div className="text-left overflow-hidden">
              <div className="truncate">Dirty Units</div>
              <div className="text-[9px] font-mono text-slate-400 truncate">"64.8 kW" regex</div>
            </div>
          </button>

          {/* 4. Break ELT SQL */}
          <button
            onClick={() => onInjectFault('ELT_SQL_ERROR')}
            disabled={isInjecting}
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-surface hover:border-cyan-intel/60 text-slate-50 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            <Database className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <div className="text-left overflow-hidden">
              <div className="truncate">Break ELT SQL</div>
              <div className="text-[9px] font-mono text-slate-400 truncate">Savepoint NULLIF</div>
            </div>
          </button>

          {/* 5. Semantic Drift (Tier-2 LLM) */}
          <button
            onClick={() => onInjectFault('SEMANTIC_DRIFT' as any)}
            disabled={isInjecting}
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-cyan-intel/50 hover:border-cyan-intel text-slate-50 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shadow-glow-cyan"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-intel shrink-0 animate-pulse" />
            <div className="text-left overflow-hidden">
              <div className="truncate text-cyan-intel">Semantic Drift</div>
              <div className="text-[9px] font-mono text-slate-300 truncate">Tier-2 LLM Agent</div>
            </div>
          </button>

          {/* 6. LLM Timeout (Circuit Breaker) */}
          <button
            onClick={() => onInjectFault('CIRCUIT_BREAKER_TIMEOUT' as any)}
            disabled={isInjecting}
            className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-amber-500/50 hover:border-amber-400 text-slate-50 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="text-left overflow-hidden">
              <div className="truncate text-amber-300">LLM Timeout</div>
              <div className="text-[9px] font-mono text-slate-400 truncate">3000ms Breaker</div>
            </div>
          </button>
        </div>

        {/* Continuous Stream Generator */}
        <button
          onClick={onToggleAutoStream}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
            isAutoStreaming
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-emerald-flux text-obsidian hover:bg-emerald-400'
          }`}
        >
          {isAutoStreaming ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Stream</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Stream Live IoT</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
