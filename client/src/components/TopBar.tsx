import React from 'react';
import { Leaf, Activity, Sliders, ShieldCheck, Database, Cpu, SunMedium, Layers, ShieldAlert, Smartphone } from 'lucide-react';
import { GreenLedgerTotals, CircuitBreakerStats, GridCarbonStatus, NocRole } from '../types/index.js';

interface TopBarProps {
  totals: GreenLedgerTotals;
  autonomy: number;
  onAutonomyChange: (val: number) => void;
  connector: string;
  onConnectorChange: (c: string) => void;
  isConnected: boolean;
  onOpenRules: () => void;
  onOpenLakehouse?: () => void;
  onOpenNocGovernance?: () => void;
  activeRole?: NocRole;
  onRoleChange?: (r: NocRole) => void;
  pendingHitlCount?: number;
  hotRuleCount: number;
  circuitBreakerStats?: CircuitBreakerStats | null;
  aiModel?: string | null;
  gridCarbon?: GridCarbonStatus | null;
  onToggleDeferral?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  totals,
  autonomy,
  onAutonomyChange,
  connector,
  onConnectorChange,
  isConnected,
  onOpenRules,
  onOpenLakehouse,
  onOpenNocGovernance,
  activeRole = 'NOC_SUPER_ADMIN',
  onRoleChange,
  pendingHitlCount = 0,
  hotRuleCount,
  circuitBreakerStats,
  aiModel,
  gridCarbon,
  onToggleDeferral,
}) => {
  return (
    <header className="h-16 border-b border-surface bg-obsidian/90 backdrop-blur-md px-6 flex items-center justify-between z-30 sticky top-0">
      {/* Brand & Connector */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-surface border border-emerald-flux/30 flex items-center justify-center relative shadow-glow-emerald">
            <Leaf className="w-5 h-5 text-emerald-flux" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-flux animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-wide text-slate-50">FluxHeal</span>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-surface border border-emerald-flux/30 text-emerald-flux">
                v1.0 MVP
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">Clean-Tech Self-Healing Pipeline</div>
          </div>
        </div>

        <div className="h-6 w-px bg-surface" />

        {/* Connector Select */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Connector:</span>
          <select
            value={connector}
            onChange={(e) => onConnectorChange(e.target.value)}
            className="bg-surface border border-surface text-xs text-slate-50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-intel font-mono cursor-pointer"
          >
            <option value="solar-grid-01">☀️ solar-grid-01 (Inverter Telemetry)</option>
            <option value="agri-moist-fleet">🌱 agri-moist-fleet (Soil & Climate)</option>
            <option value="ev-chargers-west">⚡ ev-chargers-west (Grid Demand)</option>
          </select>
        </div>
      </div>

      {/* Environmental & Carbon Ribbon */}
      <div className="hidden lg:flex items-center gap-6 bg-surface/50 border border-surface rounded-xl px-5 py-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Avoided Backfill</span>
          <span className="text-sm font-mono font-bold text-emerald-flux tabular-nums">
            {totals.total_rows_avoided.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">rows</span>
          </span>
        </div>

        <div className="h-6 w-px bg-surface" />

        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Cloud CPU Saved</span>
          <span className="text-sm font-mono font-bold text-emerald-flux tabular-nums">
            {totals.total_cpu_hours_saved.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">CPU-hrs</span>
          </span>
        </div>

        <div className="h-6 w-px bg-surface" />

        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Leaf className="w-3 h-3 text-emerald-flux" /> Prevented CO₂
          </span>
          <span className="text-sm font-mono font-bold text-emerald-flux tabular-nums">
            {totals.total_co2_grams_saved.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">gCO₂e</span>
          </span>
        </div>

        {/* Regional Grid Carbon Intensity (Phase 7) */}
        {gridCarbon && (
          <>
            <div className="h-6 w-px bg-surface" />
            <div
              className="flex flex-col cursor-pointer hover:opacity-80 transition-opacity"
              onClick={onToggleDeferral}
              title="Click to toggle carbon-aware ELT batch deferral"
            >
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <SunMedium className="w-3 h-3 text-cyan-intel" /> Grid ({gridCarbon.region.split('-')[0]})
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-sm font-mono font-bold tabular-nums ${
                    gridCarbon.status === 'CLEAN_WINDOW' ? 'text-emerald-flux' : 'text-amber-400'
                  }`}
                >
                  {gridCarbon.currentIntensityGco2} <span className="text-[10px] font-normal text-slate-400">gCO₂/kWh</span>
                </span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                    gridCarbon.status === 'CLEAN_WINDOW'
                      ? 'bg-emerald-flux/20 text-emerald-flux border border-emerald-flux/30'
                      : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                  }`}
                >
                  {gridCarbon.status === 'CLEAN_WINDOW' ? 'CLEAN' : `DEFER (${gridCarbon.deferredBatchCount})`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Autonomy Mode & Health */}
      <div className="flex items-center gap-4">
        {/* Hot-Rules Registry Quick Button */}
        <button
          onClick={onOpenRules}
          className="flex items-center gap-2 bg-surface hover:bg-surface/80 border border-surface px-3 py-1.5 rounded-lg text-xs font-mono text-slate-50 transition-colors"
        >
          <Database className="w-3.5 h-3.5 text-cyan-intel" />
          <span>Rules Cache</span>
          <span className="bg-cyan-intel/20 text-cyan-intel font-bold text-[10px] px-1.5 py-0.2 rounded">
            {hotRuleCount}
          </span>
        </button>

        {/* Lakehouse Sinks Button (Phase 8) */}
        {onOpenLakehouse && (
          <button
            onClick={onOpenLakehouse}
            className="flex items-center gap-2 bg-surface hover:bg-surface/80 border border-surface px-3 py-1.5 rounded-lg text-xs font-mono text-slate-50 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-flux" />
            <span>Lakehouse</span>
            <span className="bg-emerald-flux/20 text-emerald-flux font-bold text-[10px] px-1.5 py-0.2 rounded border border-emerald-flux/30">
              4 Sinks
            </span>
          </button>
        )}

        {/* NOC Governance & Mobile HITL Button (Phase 9) */}
        {onOpenNocGovernance && (
          <button
            onClick={onOpenNocGovernance}
            className="flex items-center gap-2 bg-surface hover:bg-surface/80 border border-surface px-3 py-1.5 rounded-lg text-xs font-mono text-slate-50 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-intel" />
            <span>NOC & HITL</span>
            <span className={`font-bold text-[10px] px-1.5 py-0.2 rounded border ${
              pendingHitlCount > 0 
                ? 'bg-amber-400/20 text-amber-300 border-amber-400/30 animate-pulse' 
                : 'bg-cyan-intel/20 text-cyan-intel border-cyan-intel/30'
            }`}>
              {pendingHitlCount > 0 ? `HITL: ${pendingHitlCount}` : activeRole.replace('NOC_', '')}
            </span>
          </button>
        )}

        {/* Autonomy Slider */}
        <div className="flex items-center gap-2 bg-surface/50 border border-surface px-3 py-1 rounded-lg">
          <Sliders className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-400">Autonomy:</span>
          <span className="text-xs font-mono font-bold text-cyan-intel">
            {autonomy >= 0.9 ? 'Balanced (90%)' : autonomy >= 0.8 ? 'Aggressive (80%)' : 'Strict (HITL)'}
          </span>
          <input
            type="range"
            min="0.70"
            max="0.99"
            step="0.05"
            value={autonomy}
            onChange={(e) => onAutonomyChange(parseFloat(e.target.value))}
            className="w-16 accent-cyan-intel cursor-pointer"
          />
        </div>

        {/* Circuit Breaker Badge */}
        {circuitBreakerStats && (
          <div className="flex items-center gap-2 bg-surface/50 border border-surface px-2.5 py-1.5 rounded-lg">
            <span
              className={`w-2 h-2 rounded-full ${
                circuitBreakerStats.state === 'CLOSED'
                  ? 'bg-emerald-flux shadow-glow-emerald'
                  : circuitBreakerStats.state === 'HALF_OPEN'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-500 animate-ping'
              }`}
            />
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-slate-400 uppercase leading-none">Circuit Breaker</span>
              <span
                className={`text-[10px] font-mono font-bold leading-none ${
                  circuitBreakerStats.state === 'CLOSED' ? 'text-emerald-flux' : 'text-red-400'
                }`}
              >
                {circuitBreakerStats.state} ({circuitBreakerStats.timeoutMs}ms)
              </span>
            </div>
          </div>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-2 bg-surface/40 border border-surface px-3 py-1.5 rounded-lg">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-flux shadow-glow-emerald' : 'bg-red-500'}`} />
          <span className="text-[11px] font-mono text-slate-400">
            {isConnected ? '<1ms PING' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </header>
  );
};
