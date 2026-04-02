import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';

const DEFAULT_WS_URL = 'ws://localhost:8000/ws';
const WS_URL = import.meta.env.VITE_WS_URL || DEFAULT_WS_URL;

export default function App() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [socketError, setSocketError] = useState('');
  const [canvasSize, setCanvasSize] = useState(720);
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let disposed = false;
    let reconnectAttempts = 0;

    const connect = () => {
      if (disposed) return;

      setStatus(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        reconnectAttempts = 0;
        setStatus('connected');
        setSocketError('');
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
        } catch {
          setSocketError('Received non-JSON frame from backend.');
        }
      };

      ws.onerror = () => {
        setSocketError('WebSocket transport error. Retrying...');
      };

      ws.onclose = () => {
        if (disposed) {
          setStatus('disconnected');
          return;
        }

        reconnectAttempts += 1;
        setStatus('reconnecting');
        const delay = Math.min(500 * 2 ** (reconnectAttempts - 1), 5000);
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
    };
  }, []);

  useEffect(() => {
    const updateCanvasSize = () => {
      if (!canvasWrapRef.current) return;
      const rect = canvasWrapRef.current.getBoundingClientRect();
      const nextSize = Math.max(280, Math.floor(Math.min(rect.width, rect.height)));
      setCanvasSize(nextSize);
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    if (canvasWrapRef.current) observer.observe(canvasWrapRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !canvasRef.current || !canvasSize) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(canvasSize * dpr);
    canvas.height = Math.floor(canvasSize * dpr);
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rows = data.config?.rows || 3;
    const cols = data.config?.cols || 3;

    const pad = Math.round(canvasSize * 0.16);
    const width = canvasSize - pad * 2;
    const height = canvasSize - pad * 2;
    const spacingX = cols > 1 ? width / (cols - 1) : 0;
    const spacingY = rows > 1 ? height / (rows - 1) : 0;
    const roadThickness = Math.max(16, Math.floor(canvasSize * 0.045));

    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const positions = {};
    if (Array.isArray(data.intersections)) {
      data.intersections.forEach((inter) => {
        const x = pad + inter.c * spacingX;
        const y = pad + inter.r * spacingY;
        positions[inter.id] = { x, y };
      });
    }

    for (let r = 0; r < rows; r += 1) {
      const y = pad + r * spacingY;
      ctx.beginPath();
      ctx.moveTo(pad - spacingX * 0.6, y);
      ctx.lineTo(pad + width + spacingX * 0.6, y);
      ctx.lineWidth = roadThickness;
      ctx.strokeStyle = '#1E293B';
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([12, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let c = 0; c < cols; c += 1) {
      const x = pad + c * spacingX;
      ctx.beginPath();
      ctx.moveTo(x, pad - spacingY * 0.6);
      ctx.lineTo(x, pad + height + spacingY * 0.6);
      ctx.lineWidth = roadThickness;
      ctx.strokeStyle = '#1E293B';
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([12, 10]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (Array.isArray(data.intersections)) {
      data.intersections.forEach((inter) => {
        const p = positions[inter.id];
        if (!p) return;

        const lightOffset = Math.max(14, Math.floor(canvasSize * 0.03));
        const lightRadius = Math.max(8, Math.floor(canvasSize * 0.022));

        ctx.fillStyle = '#0F172A';
        ctx.fillRect(p.x - 20, p.y - 20, 40, 40);

        const drawGlow = (lx, ly, color) => {
          const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, lightRadius + 8);
          gradient.addColorStop(0, color);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(lx, ly, lightRadius + 8, 0, 2 * Math.PI);
          ctx.fill();
        };

        if (inter.is_yellow) {
          drawGlow(p.x, p.y, 'rgba(234, 179, 8, 1)');
        } else {
          const nsColor = inter.green_dirs.includes('NS')
            ? 'rgba(34, 197, 94, 0.9)'
            : 'rgba(239, 68, 68, 0.9)';
          const ewColor = inter.green_dirs.includes('EW')
            ? 'rgba(34, 197, 94, 0.9)'
            : 'rgba(239, 68, 68, 0.9)';

          drawGlow(p.x, p.y - lightOffset, nsColor);
          drawGlow(p.x, p.y + lightOffset, nsColor);
          drawGlow(p.x - lightOffset, p.y, ewColor);
          drawGlow(p.x + lightOffset, p.y, ewColor);
        }
      });
    }

    if (Array.isArray(data.vehicles)) {
      const vehicleRadius = Math.max(3, Math.floor(canvasSize * 0.008));
      ctx.fillStyle = '#38BDF8';
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 10;

      data.vehicles.forEach((v) => {
        if (!v.from || !v.to) return;

        const p1 = positions[v.from];
        const p2 = positions[v.to];
        if (!p1 || !p2) return;

        const progress = Math.max(0, Math.min(1, (v.pos || 0) / (v.length || 1)));
        const cx = p1.x + (p2.x - p1.x) * progress;
        const cy = p1.y + (p2.y - p1.y) * progress;

        ctx.beginPath();
        ctx.arc(cx, cy, vehicleRadius, 0, 2 * Math.PI);
        ctx.fill();
      });

      ctx.shadowBlur = 0;
    }
  }, [canvasSize, data]);

  const metrics = data?.metrics || {};
  const statusCopy = useMemo(() => {
    if (status === 'connected') return 'PyTorch Server Active';
    if (status === 'reconnecting') return 'Reconnecting to OptiFlow Core...';
    if (status === 'disconnected') return 'Connection Closed';
    return 'Connecting to OptiFlow Core...';
  }, [status]);

  return (
    <div className="w-screen h-screen bg-[#0D1117] overflow-hidden flex flex-col lg:flex-row font-sans">
      <div className="flex-1 relative flex items-center justify-center p-4 lg:p-6">
        <div ref={canvasWrapRef} className="w-full h-full flex items-center justify-center">
          <canvas ref={canvasRef} className="rounded-lg shadow-2xl max-w-full max-h-full" />
        </div>

        <div className="absolute top-4 left-4 lg:top-6 lg:left-6 flex items-center gap-3 bg-slate-800/60 px-4 py-2 border border-slate-700/50 rounded-full backdrop-blur-md shadow-lg">
          <div
            className={`w-3 h-3 rounded-full ${
              status === 'connected'
                ? 'bg-green-500 shadow-[0_0_12px_#22c55e]'
                : 'bg-red-500 shadow-[0_0_12px_#ef4444]'
            }`}
          ></div>
          <span className="text-slate-200 text-xs lg:text-sm font-semibold tracking-wider">{statusCopy}</span>
        </div>
      </div>

      <div className="w-full lg:w-80 bg-slate-900/90 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-sky-500/20 p-6 lg:p-8 flex flex-col shadow-[-20px_0_50px_rgba(56,189,248,0.05)] z-10">
        <h1 className="text-2xl lg:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600 mb-6 lg:mb-8 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(56,189,248,0.3)]">
          OptiFlow
          <br />
          <span className="text-sm text-slate-400 font-medium">Neural Dashboard</span>
        </h1>

        <div className="space-y-4 lg:space-y-5 flex-1">
          <Metric title="Training Episode" value={metrics.episode !== undefined ? metrics.episode : '--'} />
          <Metric title="Global Clock" value={metrics.step !== undefined ? metrics.step : '--'} />
          <Metric
            title="Vehicles Monitored"
            value={metrics.active_vehicles !== undefined ? metrics.active_vehicles : '--'}
          />
          <Metric title="Gridlock Queue" value={metrics.total_queued !== undefined ? metrics.total_queued : '--'} />
          <Metric
            title="Average Wait Time"
            value={metrics.total_waiting_time !== undefined ? metrics.total_waiting_time : '--'}
          />
        </div>

        <div className="mt-6 border-t border-slate-800 pt-5">
          <p className="text-xs text-slate-500 font-medium tracking-widest uppercase">Powered by FastAPI + React</p>
          {socketError ? <p className="text-xs text-rose-400 mt-2">{socketError}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-xl transition-all duration-300 hover:bg-slate-800/50 hover:border-sky-500/30">
      <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{title}</h3>
      <p className="text-2xl lg:text-3xl font-light font-mono text-slate-100">{value}</p>
    </div>
  );
}
