import { useEffect, useRef, useState } from 'react';
import './index.css';

export default function App() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    // Connect to Python FastAPI Backend
    const ws = new WebSocket('ws://localhost:8000/ws');
    
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    
    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      setData(parsed);
    };

    return () => ws.close();
  }, []);

  // HTML5 Canvas Native Rendering Engine
  useEffect(() => {
    if (!data || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear background
    ctx.fillStyle = '#0D1117'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const marginX = 120;
    const marginY = 120;
    const spacingX = 180;
    const spacingY = 180;
    
    // Calculate node coordinates
    const positions = {};
    if (data.intersections) {
        data.intersections.forEach(inter => {
            const x = marginX + inter.c * spacingX;
            const y = marginY + inter.r * spacingY;
            positions[inter.id] = {x, y};
        });
    }

    const rows = data.config?.rows || 3;
    const cols = data.config?.cols || 3;
    
    // Draw robust road lines manually since python network doesn't map full geometry to JSON yet
    for (let r=0; r<rows; r++) {
        const y = marginY + r * spacingY;
        ctx.beginPath();
        // Extending boundaries
        ctx.moveTo(marginX - (spacingX*0.6), y);
        ctx.lineTo(marginX + ((cols-1) * spacingX) + (spacingX*0.6), y);
        
        ctx.lineWidth = 40;
        ctx.strokeStyle = '#1E293B';
        ctx.stroke();
        
        // Draw dashed lines
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#334155';
        ctx.setLineDash([15, 15]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    for (let c=0; c<cols; c++) {
        const x = marginX + c * spacingX;
        ctx.beginPath();
        ctx.moveTo(x, marginY - (spacingY*0.6));
        ctx.lineTo(x, marginY + ((rows-1) * spacingY) + (spacingY*0.6));
        
        ctx.lineWidth = 40;
        ctx.strokeStyle = '#1E293B';
        ctx.stroke();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#334155';
        ctx.setLineDash([15, 15]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Draw Glowing Neon Intersections
    if (data.intersections) {
        data.intersections.forEach(inter => {
            const p = positions[inter.id];
            
            ctx.fillStyle = '#0F172A';
            ctx.fillRect(p.x - 20, p.y - 20, 40, 40);
            
            const drawGlow = (lx, ly, color) => {
                const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, 18);
                gradient.addColorStop(0, color);
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(lx, ly, 18, 0, 2 * Math.PI);
                ctx.fill();
            };
            
            if (inter.is_yellow) {
                drawGlow(p.x, p.y, 'rgba(234, 179, 8, 1)');
            } else {
                const nsColor = inter.green_dirs.includes("NS") ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
                const ewColor = inter.green_dirs.includes("EW") ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
                
                drawGlow(p.x, p.y - 25, nsColor);
                drawGlow(p.x, p.y + 25, nsColor);
                drawGlow(p.x - 25, p.y, ewColor);
                drawGlow(p.x + 25, p.y, ewColor);
            }
        });
    }

    // Draw Cars via Vector Interpolation
    if (data.vehicles) {
        ctx.fillStyle = '#38BDF8';
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 12; // Neon glow effect
        
        data.vehicles.forEach(v => {
            const progress = v.pos / v.length;
            let cx = 0, cy = 0;
            
            if (v.from && v.to) {
                const p1 = positions[v.from];
                const p2 = positions[v.to];
                if (p1 && p2) {
                    cx = p1.x + (p2.x - p1.x) * progress;
                    cy = p1.y + (p2.y - p1.y) * progress;
                }
            } 
            
            if (cx !== 0 || cy !== 0) {
              ctx.beginPath();
              ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
              ctx.fill();
            }
        });
        ctx.shadowBlur = 0; 
    }
  }, [data]);

  const metrics = data?.metrics || {};

  return (
    <div className="w-screen h-screen bg-[#0D1117] overflow-hidden flex font-sans">
      <div className="flex-1 relative flex items-center justify-center">
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={800} 
          className="rounded-lg shadow-2xl"
        />
        
        <div className="absolute top-6 left-6 flex items-center gap-3 bg-slate-800/60 px-4 py-2 border border-slate-700/50 rounded-full backdrop-blur-md shadow-lg">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_12px_#22c55e]' : 'bg-red-500 shadow-[0_0_12px_#ef4444]'}`}></div>
            <span className="text-slate-200 text-sm font-semibold tracking-wider">{connected ? 'PyTorch Server Active' : 'Waiting for OptiFlow Core...'}</span>
        </div>
      </div>
      
      {/* Cyberpunk HUD Dashboard */}
      <div className="w-80 bg-slate-900/90 backdrop-blur-xl border-l border-sky-500/20 p-8 flex flex-col shadow-[-20px_0_50px_rgba(56,189,248,0.05)] z-10">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600 mb-8 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(56,189,248,0.3)]">
          OptiFlow<br/><span className="text-sm text-slate-400 font-medium">Neural Dashboard</span>
        </h1>
        
        <div className="space-y-5 flex-1 mt-6">
          <Metric title="Training Episode" value={metrics.episode !== undefined ? metrics.episode : '--'} />
          <Metric title="Global Clock" value={metrics.step !== undefined ? metrics.step : '--'} />
          <Metric title="Vehicles Monitored" value={metrics.active_vehicles !== undefined ? metrics.active_vehicles : '--'} />
          <Metric title="Gridlock Queue" value={metrics.total_queued !== undefined ? metrics.total_queued : '--'} />
          <Metric title="Average Wait Time" value={metrics.total_waiting_time !== undefined ? metrics.total_waiting_time : '--'} />
        </div>

        <div className="mt-auto border-t border-slate-800 pt-6">
            <p className="text-xs text-slate-500 font-medium tracking-widest uppercase">Powered by FastApi + React</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value }) {
    return (
        <div className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-xl transition-all duration-300 hover:bg-slate-800/50 hover:border-sky-500/30">
            <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{title}</h3>
            <p className="text-3xl font-light font-mono text-slate-100">{value}</p>
        </div>
    );
}
