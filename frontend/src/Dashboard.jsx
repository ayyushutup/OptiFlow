import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap, Tooltip } from 'react-leaflet';
import { Activity, Clock, Navigation, BarChart3, Radio, Database, AlertCircle, Cpu, Zap, Gauge, OctagonX, Map as MapIcon, Layers } from 'lucide-react';
import L from 'leaflet';
import './index.css';

// Fix for default Leaflet icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DEFAULT_WS_URL = 'ws://localhost:8000/ws';
const WS_URL = import.meta.env.VITE_WS_URL || DEFAULT_WS_URL;
const API_URL = 'http://localhost:8000';

const MUMBAI_CENTER = [19.0760, 72.8777];

/**
 * Force Leaflet to re-calculate container size after the initial layout stabilizes.
 */
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 450); // Using 450ms as verified in sanity test
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Heatmap color helper: 0 vehicles = dark, 1 = green, 2-3 = yellow, 4+ = red
function getEdgeCongestionColor(count) {
  if (!count || count === 0) return '#1e293b';
  if (count === 1) return '#22c55e';
  if (count === 2) return '#eab308';
  if (count === 3) return '#f97316';
  return '#ef4444';
}
function getEdgeCongestionWeight(count) {
  if (!count || count === 0) return 2;
  return Math.min(2 + count * 1.5, 8);
}
function getEdgeCongestionOpacity(count) {
  if (!count || count === 0) return 0.3;
  return Math.min(0.4 + count * 0.15, 1.0);
}

// MEMOIZED MAP COMPONENT - Ensures the core map doesn't re-render on telemetry ticks
const OptiMap = memo(({ mapData, children }) => {
  return (
    <MapContainer 
      center={MUMBAI_CENTER} 
      zoom={14} 
      minZoom={12}
      maxZoom={20}
      scrollWheelZoom={true}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors &copy; <a href='https://carto.com/attributions'>CARTO</a>"
        subdomains="abcd"
        maxZoom={20}
      />
      <ResizeFix />
      {children}
    </MapContainer>
  );
});

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [socketError, setSocketError] = useState('');

  // 🌍 1. Fetch Static Map Data on Mount
  useEffect(() => {
    const fetchMap = async () => {
      try {
        const res = await fetch(`${API_URL}/map`);
        if (!res.ok) throw new Error('API Offline');
        const json = await res.json();
        setMapData(json);
      } catch (e) {
        setSocketError('Map geometry server unreachable (Port 8000)');
      }
    };
    fetchMap();
  }, []);

  // 🛰️ 2. Stable WebSocket Lifecycle
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setStatus('connected');
        setSocketError('');
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
        } catch {
          console.error('Telemetry error');
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus('reconnecting');
        reconnectTimer = window.setTimeout(connect, 3000); 
      };

      ws.onerror = () => setSocketError('Neural link failed');
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const metrics = data?.metrics || {};

  return (
    <div className="flex w-screen h-screen bg-[#020617] font-sans selection:bg-sky-500/30 overflow-hidden">
      
      {/* Simulation View (75%) */}
      <div className="flex-[3] min-h-0 relative shadow-[inset_-30px_0_50px_rgba(0,0,0,0.8)]">
         <OptiMap mapData={mapData}>

           {/* ROAD HEATMAP (dynamic edges colored by congestion) */}
           {mapData?.edges?.map((edge, idx) => {
              const congestionKey = `${edge.from}_${edge.to}`;
              const count = data?.edge_congestion?.[congestionKey] || 0;
              return (
                <Polyline 
                  key={`heat-${idx}`}
                  positions={edge.path}
                  pathOptions={{ 
                    color: getEdgeCongestionColor(count), 
                    weight: getEdgeCongestionWeight(count),
                    opacity: getEdgeCongestionOpacity(count)
                  }}
                />
              );
           })}

           {/* INTERSECTIONS */}
           {data?.intersections?.map((inter) => (
             <CircleMarker 
                key={`signal-${inter.id}`}
                center={[inter.lat, inter.lon]}
                radius={10}
                pathOptions={{
                  fillColor: inter.is_yellow ? '#fbbf24' : (inter.green_dirs?.includes('N') || inter.green_dirs?.includes('S') ? '#10b981' : '#f43f5e'),
                  fillOpacity: 1.0,
                  color: '#fff',
                  weight: 2
                }}
              >
                <Tooltip direction="top" className="bg-slate-900 border-none text-[9px] font-black text-white px-2 py-0.5 rounded-sm opacity-80">
                   NODE {inter.id.toString().slice(-4)}
                </Tooltip>
             </CircleMarker>
           ))}

           {/* VEHICLES (color by speed) */}
           {data?.vehicles?.map((v) => {
              const edge = mapData?.edges?.find(e => e.from === v.from && e.to === v.to);
              if (!edge || !edge.path) return null;

              const progress = v.pos / v.length;
              const pathIdx = Math.floor(progress * (edge.path.length - 1));
              const nextIdx = Math.min(pathIdx + 1, edge.path.length - 1);
              const subProgress = (progress * (edge.path.length - 1)) - pathIdx;
              
              const p1 = edge.path[pathIdx];
              const p2 = edge.path[nextIdx];
              const currentPos = [
                p1[0] + (p2[0] - p1[0]) * subProgress,
                p1[1] + (p2[1] - p1[1]) * subProgress
              ];

              // Color by speed: stopped = red, slow = amber, moving = cyan
              const speed = v.speed || 0;
              const vColor = speed < 0.5 ? '#ef4444' : speed < 5 ? '#fbbf24' : '#38bdf8';

              return (
                <CircleMarker 
                  key={`v-${v.id}`}
                  center={currentPos}
                  radius={5}
                  pathOptions={{ fillColor: vColor, fillOpacity: 1, color: '#fff', weight: 1.5 }}
                />
              );
           })}
        </OptiMap>

        {/* HUD Overlay */}
        <div className="absolute top-8 left-8 z-[1000] flex flex-col gap-4 pointer-events-none">
          <StatusBadge status={status} />
          <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2 border-sky-400/20">
            <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
            <span className="text-[10px] font-black tracking-widest uppercase text-sky-100">Neural Network v3.2</span>
          </div>
        </div>

        <div className="absolute bottom-8 left-8 z-[1000] glass-card p-4 rounded-2xl flex gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-2xl backdrop-blur-3xl border-white/5">
           <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div> NS Green</div>
           <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e]"></div> EW Green</div>
           <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-sky-400 shadow-[0_0_10px_#38bdf8]"></div> Moving</div>
           <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]"></div> Stopped</div>
           <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                <div className="w-3 h-3 rounded-sm bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-sm bg-orange-500"></div>
                <div className="w-3 h-3 rounded-sm bg-red-500"></div>
              </div>
              Congestion
           </div>
        </div>
      </div>

      {/* Analytics Sidebar (25%) */}
      <div className="w-[380px] bg-[#0b1220] h-full overflow-auto flex flex-col gap-6 p-8 border-l border-white/5 relative z-[1001] shadow-2xl">
        <div className="mb-6 pointer-events-none">
          <div className="flex items-center gap-2 mb-2">
             <div className="w-6 h-6 bg-sky-500 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-[#020617]" />
             </div>
             <span className="text-[10px] font-black tracking-[0.3em] text-sky-500 uppercase">OptiFlow Advanced</span>
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter text-white contrast-200 uppercase">
             Dashboard
          </h1>
        </div>

        <div className="flex flex-col gap-4 pb-12">
          <StatCard 
            icon={<Clock className="text-sky-400" />} 
            label="Grid Runtime" 
            value={metrics.step ? `${metrics.step} ticks` : "--"} 
            hint="System clock"
          />
          <StatCard 
            icon={<Navigation className="text-emerald-400" />} 
            label="Fleet Size" 
            value={metrics.active_vehicles || "0"} 
            hint="Active nodes"
          />
          <StatCard 
            icon={<Gauge className="text-sky-400" />} 
            label="Avg Speed" 
            value={metrics.avg_speed !== undefined ? `${metrics.avg_speed} m/s` : "--"} 
            hint="Network flow"
          />
          <StatCard 
            icon={<OctagonX className="text-amber-400" />} 
            label="Stopped" 
            value={metrics.stopped_vehicles !== undefined ? metrics.stopped_vehicles : "--"} 
            hint="At red lights"
          />
          <StatCard 
            icon={<Zap className="text-rose-400" />} 
            label="Total Wait" 
            value={metrics.total_waiting_time !== undefined ? `${metrics.total_waiting_time.toFixed(1)}s` : "--"} 
            hint="Real accumulated"
          />
        </div>

        <div className="mt-auto space-y-4">
          <div className="glass-card p-6 rounded-3xl border-emerald-500/10 flex items-center gap-4">
             <div className="p-3 bg-emerald-500/10 rounded-xl">
                <Cpu className="w-6 h-6 text-emerald-400" />
             </div>
             <div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1.5">Decision Matrix</p>
                <p className="text-sm font-bold text-emerald-100 italic tracking-tight underline decoration-emerald-500/30">DQN Multi-Agent Active</p>
             </div>
          </div>
        </div>

        {socketError && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] p-8 glass-card bg-rose-500/10 border-rose-500/40 rounded-[2.5rem] text-center backdrop-blur-3xl shadow-2xl">
             <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
             <p className="text-xl font-black text-rose-100 mb-2 uppercase tracking-widest">Connection Error</p>
             <p className="text-[11px] text-rose-300 font-bold leading-relaxed">{socketError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }) {
  return (
    <div className="glass-card p-7 rounded-[2.5rem] transition-all hover:bg-slate-800/40 border border-white/5 relative group">
      <div className="flex justify-between items-start relative z-10">
        <div className="p-3 bg-slate-900 rounded-xl border border-white/5 group-hover:border-sky-500/20">
          {icon}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{hint}</p>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">{label}</p>
        </div>
      </div>
      <p className="text-4xl font-light text-slate-50 mt-6 tabular-nums tracking-tighter">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const configs = {
    connected: { color: 'bg-emerald-500 shadow-emerald-500/40', text: 'Bridge Sync: Strong' },
    connecting: { color: 'bg-amber-500 shadow-amber-500/40', text: 'Initializing' },
    reconnecting: { color: 'bg-rose-500 shadow-rose-500/40', text: 'Signal Interference' },
    disconnected: { color: 'bg-slate-500', text: 'System Offline' }
  };
  const config = configs[status] || configs.disconnected;

  return (
    <div className="glass-card px-5 py-3 rounded-2xl flex items-center gap-3 border border-white/5 shadow-2xl backdrop-blur-3xl">
      <div className={`w-2 h-2 rounded-full ${config.color} animate-pulse`}></div>
      <span className="text-[10px] font-black tracking-widest uppercase text-slate-100 leading-none">{config.text}</span>
    </div>
  );
}
