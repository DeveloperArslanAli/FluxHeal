import React, { useRef, useEffect } from 'react';
import { Radio, ShieldAlert, Cpu, Wrench, Database } from 'lucide-react';

export interface CanvasPulseTrigger {
  id: string;
  type: 'FAST_PATH' | 'ANOMALOUS_HEAL';
  timestamp: number;
}

interface Particle {
  id: number;
  progress: number;
  speed: number;
  pathType: 'FAST_PATH' | 'ANOMALOUS_HEAL';
  color: string;
}

interface TopologyCanvasProps {
  fastPathCount: number;
  quarantineCount: number;
  healedCount: number;
  cachedRuleCount: number;
  pulseTrigger?: CanvasPulseTrigger | null;
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  fastPathCount,
  quarantineCount,
  healedCount,
  cachedRuleCount,
  pulseTrigger,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const nextParticleId = useRef(1);

  // React to REAL incoming WebSocket event pulse
  useEffect(() => {
    if (!pulseTrigger) return;

    if (pulseTrigger.type === 'FAST_PATH') {
      particlesRef.current.push({
        id: nextParticleId.current++,
        progress: 0,
        speed: 0.015,
        pathType: 'FAST_PATH',
        color: '#10B981', // Emerald
      });
    } else {
      particlesRef.current.push({
        id: nextParticleId.current++,
        progress: 0,
        speed: 0.009,
        pathType: 'ANOMALOUS_HEAL',
        color: '#06B6D4', // Cyan
      });
    }
  }, [pulseTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 1000;
      canvas.height = canvas.parentElement?.clientHeight || 300;
    };
    resize();
    window.addEventListener('resize', resize);

    // Animation Loop (60 FPS)
    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Node Coordinates
      const node1 = { x: width * 0.12, y: height * 0.35 }; // Ingestion
      const node2 = { x: width * 0.32, y: height * 0.75 }; // Quarantine
      const node3 = { x: width * 0.52, y: height * 0.75 }; // Diagnostic
      const node4 = { x: width * 0.72, y: height * 0.75 }; // Healer
      const node5 = { x: width * 0.88, y: height * 0.35 }; // Warehouse

      // 1. Draw Paths
      // Fast-Path (Upper Arc)
      ctx.beginPath();
      ctx.moveTo(node1.x, node1.y);
      ctx.bezierCurveTo(
        width * 0.35, height * 0.12,
        width * 0.65, height * 0.12,
        node5.x, node5.y
      );
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Lower Anomalous Loop Path
      ctx.beginPath();
      ctx.moveTo(node1.x, node1.y);
      ctx.lineTo(node2.x, node2.y);
      ctx.lineTo(node3.x, node3.y);
      ctx.lineTo(node4.x, node4.y);
      ctx.lineTo(node5.x, node5.y);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Hot-Rule Cache Loopback Line (Healer -> Ingestion)
      ctx.beginPath();
      ctx.moveTo(node4.x, node4.y);
      ctx.bezierCurveTo(
        width * 0.52, height * 0.95,
        width * 0.22, height * 0.95,
        node1.x, node1.y
      );
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Animate and Draw REAL Active Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.progress += p.speed;

        if (p.progress >= 1.0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        let px = 0;
        let py = 0;

        if (p.pathType === 'FAST_PATH') {
          // Bezier interpolation for upper arc
          const t = p.progress;
          const cp1x = width * 0.35;
          const cp1y = height * 0.12;
          const cp2x = width * 0.65;
          const cp2y = height * 0.12;

          px = Math.pow(1 - t, 3) * node1.x +
               3 * Math.pow(1 - t, 2) * t * cp1x +
               3 * (1 - t) * Math.pow(t, 2) * cp2x +
               Math.pow(t, 3) * node5.x;

          py = Math.pow(1 - t, 3) * node1.y +
               3 * Math.pow(1 - t, 2) * t * cp1y +
               3 * (1 - t) * Math.pow(t, 2) * cp2y +
               Math.pow(t, 3) * node5.y;
        } else {
          // 4-segment linear interpolation through DLQ -> Diagnostic -> Healer -> Warehouse
          const t = p.progress;
          if (t < 0.25) {
            const segT = t / 0.25;
            px = node1.x + (node2.x - node1.x) * segT;
            py = node1.y + (node2.y - node1.y) * segT;
          } else if (t < 0.50) {
            const segT = (t - 0.25) / 0.25;
            px = node2.x + (node3.x - node2.x) * segT;
            py = node2.y + (node3.y - node2.y) * segT;
          } else if (t < 0.75) {
            const segT = (t - 0.50) / 0.25;
            px = node3.x + (node4.x - node3.x) * segT;
            py = node3.y + (node4.y - node3.y) * segT;
          } else {
            const segT = (t - 0.75) / 0.25;
            px = node4.x + (node5.x - node4.x) * segT;
            py = node4.y + (node5.y - node4.y) * segT;
          }
        }

        // Draw particle with glow
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw Path Labels
      ctx.font = '10px "JetBrains Mono"';
      ctx.fillStyle = '#10B981';
      ctx.textAlign = 'center';
      ctx.fillText('FAST-PATH STREAM (REAL-TIME)', width * 0.5, height * 0.16);

      ctx.fillStyle = '#06B6D4';
      ctx.fillText('HOT-RULE CACHE (<1MS RE-USE)', width * 0.38, height * 0.94);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="relative w-full h-[320px] bg-surface/40 border border-surface rounded-2xl overflow-hidden backdrop-blur-md flex flex-col justify-between p-4">
      {/* Background HTML5 Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* HTML Node UI Overlays positioned on the canvas */}
      <div className="relative z-10 flex justify-between h-full pointer-events-none">
        {/* Node 1: Ingestion & Validator */}
        <div className="flex flex-col items-center justify-start mt-6 w-44">
          <div className="w-12 h-12 rounded-xl bg-surface border-2 border-emerald-flux/60 shadow-glow-emerald flex items-center justify-center pointer-events-auto">
            <Radio className="w-6 h-6 text-emerald-flux animate-pulse" />
          </div>
          <span className="text-xs font-semibold mt-2 text-slate-50">1. Ingestion Gate</span>
          <span className="text-[10px] font-mono text-slate-400">Validator & Hot-Cache</span>
          <span className="mt-1 px-2 py-0.5 rounded-full bg-emerald-flux/15 text-[10px] font-mono font-bold text-emerald-flux border border-emerald-flux/30">
            {fastPathCount} pkts
          </span>
        </div>

        {/* Node 2: Micro-Quarantine */}
        <div className="flex flex-col items-center justify-end mb-2 w-40">
          <div className="w-11 h-11 rounded-xl bg-surface border border-cyan-intel/60 shadow-glow-cyan flex items-center justify-center pointer-events-auto">
            <ShieldAlert className="w-5 h-5 text-cyan-intel" />
          </div>
          <span className="text-xs font-semibold mt-1.5 text-slate-50">2. Quarantine DLQ</span>
          <span className="text-[10px] font-mono text-slate-400">Zero-Downtime</span>
          <span className="mt-1 px-2 py-0.5 rounded-full bg-cyan-intel/15 text-[10px] font-mono font-bold text-cyan-intel border border-cyan-intel/30">
            {quarantineCount} isolated
          </span>
        </div>

        {/* Node 3: Diagnostic Engine */}
        <div className="flex flex-col items-center justify-end mb-2 w-40">
          <div className="w-11 h-11 rounded-xl bg-surface border border-cyan-intel/60 shadow-glow-cyan flex items-center justify-center pointer-events-auto">
            <Cpu className="w-5 h-5 text-cyan-intel animate-spin" style={{ animationDuration: '8s' }} />
          </div>
          <span className="text-xs font-semibold mt-1.5 text-slate-50">3. AI Diagnostic</span>
          <span className="text-[10px] font-mono text-slate-400">Rule + LLM Engine</span>
          <span className="mt-1 px-2 py-0.5 rounded-full bg-cyan-intel/15 text-[10px] font-mono font-bold text-cyan-intel border border-cyan-intel/30">
            Tier-1 + Tier-2
          </span>
        </div>

        {/* Node 4: Dual-Mode Healer */}
        <div className="flex flex-col items-center justify-end mb-2 w-40">
          <div className="w-11 h-11 rounded-xl bg-surface border border-emerald-flux/60 shadow-glow-emerald flex items-center justify-center pointer-events-auto">
            <Wrench className="w-5 h-5 text-emerald-flux" />
          </div>
          <span className="text-xs font-semibold mt-1.5 text-slate-50">4. Dual Healer</span>
          <span className="text-[10px] font-mono text-slate-400">ETL / ELT Savepoint</span>
          <span className="mt-1 px-2 py-0.5 rounded-full bg-emerald-flux/15 text-[10px] font-mono font-bold text-emerald-flux border border-emerald-flux/30">
            {healedCount} healed
          </span>
        </div>

        {/* Node 5: Warehouse & Hot Cache */}
        <div className="flex flex-col items-center justify-start mt-6 w-44">
          <div className="w-12 h-12 rounded-xl bg-surface border-2 border-emerald-flux/60 shadow-glow-emerald flex items-center justify-center pointer-events-auto">
            <Database className="w-6 h-6 text-emerald-flux" />
          </div>
          <span className="text-xs font-semibold mt-2 text-slate-50">5. Clean Warehouse</span>
          <span className="text-[10px] font-mono text-slate-400">SQLite / PostgreSQL</span>
          <span className="mt-1 px-2 py-0.5 rounded-full bg-emerald-flux/15 text-[10px] font-mono font-bold text-emerald-flux border border-emerald-flux/30">
            {cachedRuleCount} active rules
          </span>
        </div>
      </div>
    </div>
  );
};
