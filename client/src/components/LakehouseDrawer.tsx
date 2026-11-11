import React, { useState } from 'react';
import { X, Layers, Database, ArrowDownToLine, RefreshCw, CheckCircle2, ShieldCheck, HardDrive } from 'lucide-react';
import { LakehouseSystemOverview, LakehouseExportManifest } from '../types/index.js';

interface LakehouseDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  overview: LakehouseSystemOverview | null;
  onRefresh: () => void;
}

export const LakehouseDrawer: React.FC<LakehouseDrawerProps> = ({
  isOpen,
  onClose,
  overview,
  onRefresh,
}) => {
  const [isFlushing, setIsFlushing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFlush = async () => {
    setIsFlushing(true);
    setActionMessage(null);
    try {
      const res = await fetch('http://localhost:4000/api/v1/lakehouse/flush', { method: 'POST' });
      const data = await res.json();
      setActionMessage(`Buffer Flushed: ${data.manifest?.recordCount || 0} records committed to Parquet.`);
      onRefresh();
    } catch {
      setActionMessage('Failed to trigger lakehouse flush.');
    } finally {
      setIsFlushing(false);
    }
  };

  const handleExportSnapshot = async () => {
    setIsExporting(true);
    setActionMessage(null);
    try {
      const res = await fetch('http://localhost:4000/api/v1/lakehouse/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500 }),
      });
      const data = await res.json();
      setActionMessage(`Warehouse Snapshot Exported: ${data.manifest?.recordCount || 0} records partitioned into Iceberg.`);
      onRefresh();
    } catch {
      setActionMessage('Failed to export warehouse snapshot.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-obsidian border-l border-surface flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="h-16 px-6 border-b border-surface flex items-center justify-between bg-surface/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface border border-cyan-intel/40 flex items-center justify-center">
              <Layers className="w-5 h-5 text-cyan-intel" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-50 uppercase tracking-wider">
                Multi-Cloud Lakehouse & Warehouse Sinks
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Apache Iceberg, ClickHouse, Snowflake, & Delta Lake Compaction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface hover:bg-surface/80 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Storage Compression Banner */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-surface/40 border border-surface">
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">Exported Records</div>
              <div className="text-lg font-mono font-bold text-slate-50 tabular-nums">
                {overview?.totalRecordsExported.toLocaleString() || 0}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">Columnar Compaction</div>
              <div className="text-lg font-mono font-bold text-emerald-flux tabular-nums">
                {overview?.overallCompressionRatio.toFixed(2) || '4.25'}x
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">Compressed Footprint</div>
              <div className="text-lg font-mono font-bold text-cyan-intel tabular-nums">
                {Math.round((overview?.compressedBytes || 0) / 1024)} KB
              </div>
            </div>
          </div>

          {/* Action notification */}
          {actionMessage && (
            <div className="p-3 rounded-lg bg-cyan-intel/10 border border-cyan-intel/30 text-xs font-mono text-cyan-intel flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{actionMessage}</span>
            </div>
          )}

          {/* Active Sinks List */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Configured Lakehouse Sinks ({overview?.sinks.length || 0})
            </h4>
            <div className="space-y-2.5">
              {overview?.sinks.map((sink) => (
                <div
                  key={sink.sinkType}
                  className="p-3.5 rounded-xl bg-surface/40 border border-surface flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-obsidian border border-surface flex items-center justify-center shrink-0">
                      <Database className="w-4 h-4 text-emerald-flux" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-50 font-mono">{sink.sinkType}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-flux/20 text-emerald-flux border border-emerald-flux/30">
                          {sink.status}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-sm">
                        {sink.destinationBucket}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-slate-200">
                      {sink.totalRecordsExported.toLocaleString()} rows
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">{sink.compressionRatio}x zstd</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Manifests */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Recent Parquet & Iceberg Manifests ({overview?.recentManifests.length || 0})
            </h4>
            {overview?.recentManifests.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-surface rounded-xl text-xs text-slate-400">
                No chunks exported yet. Click "Trigger Compaction Flush" or stream live telemetry.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {overview?.recentManifests.map((manifest) => (
                  <div
                    key={manifest.exportId}
                    className="p-3 rounded-lg bg-obsidian border border-surface/70 font-mono text-xs flex items-center justify-between gap-4"
                  >
                    <div className="overflow-hidden">
                      <div className="text-slate-200 font-semibold truncate flex items-center gap-2">
                        <HardDrive className="w-3.5 h-3.5 text-cyan-intel shrink-0" />
                        <span className="truncate">{manifest.fileUri.split('/').pop()}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {manifest.recordCount} rows | Partition: {manifest.partitionDate} | Clean: {manifest.provenanceSummary.totalClean} / Healed: {manifest.provenanceSummary.totalHealed}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-intel/20 text-cyan-intel font-bold">
                        {manifest.compressionRatio.toFixed(1)}x Parquet
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-surface bg-surface/20 flex items-center gap-3">
          <button
            onClick={handleFlush}
            disabled={isFlushing}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-cyan-intel hover:bg-cyan-intel/90 text-obsidian text-xs font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
            <span>{isFlushing ? 'Compacting...' : 'Trigger Compaction Flush'}</span>
          </button>

          <button
            onClick={handleExportSnapshot}
            disabled={isExporting}
            className="flex items-center gap-2 py-2 px-4 rounded-xl bg-surface hover:bg-surface/80 border border-surface text-slate-50 text-xs font-semibold transition-all disabled:opacity-50"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-flux" />
            <span>{isExporting ? 'Exporting...' : 'Export Snapshot'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
