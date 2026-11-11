import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';

interface HitlModalProps {
  quarantineId: string | null;
  patchedPayload: Record<string, any> | null;
  confidence: number | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const HitlModal: React.FC<HitlModalProps> = ({
  quarantineId,
  patchedPayload,
  confidence,
  onApprove,
  onReject,
}) => {
  if (!quarantineId || !patchedPayload) return null;

  return (
    <div className="fixed bottom-24 right-6 z-40 max-w-md w-full bg-surface border-2 border-amber-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-lg animate-in slide-in-from-bottom">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-50 uppercase tracking-wide">
              Human-in-the-Loop Review
            </h4>
            {confidence && (
              <span className="text-[10px] font-mono text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10">
                {(confidence * 100).toFixed(0)}% Conf
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Low-confidence diagnosis requires manual engineer verification before database commit.
          </p>

          <div className="my-2.5 p-2 rounded-lg bg-obsidian text-[11px] font-mono text-slate-300 max-h-24 overflow-y-auto">
            <pre className="whitespace-pre-wrap">{JSON.stringify(patchedPayload, null, 2)}</pre>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onApprove(quarantineId)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-flux text-obsidian text-xs font-bold hover:bg-emerald-400 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve & Commit</span>
            </button>

            <button
              onClick={() => onReject(quarantineId)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface/80 border border-surface text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
