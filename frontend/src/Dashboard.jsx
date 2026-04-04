import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap, Tooltip } from 'react-leaflet';
import { Activity, Clock, Navigation, BarChart3, Radio, AlertCircle, Cpu, Zap, Gauge, OctagonX, Crosshair, Layers, Eye } from 'lucide-react';
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

// ─── Color System (strict, cinematic) ───
const COLORS = {
  fast:      '#00FFAA',
  medium:    '#FFD166',
  congested: '#FF4D4D',
  node:      '#4CC9F0',
  ai:        '#9B5DE5',
  roadBase:  '#1a2536',
  roadEmpty: '#111b2a',
  nsGreen:   '#00FFAA',
  ewGreen:   '#FF6B9D',
  yellow:    '#FFD166',
};

/**
 * Force Leaflet to re-calculate container size after initial layout.
 */
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 450);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}



// ─── Congestion helpers (upgraded color system) ───
function getEdgeCongestionColor(count) {
  if (!count || count === 0) return COLORS.roadEmpty;
  if (count === 1) return COLORS.fast;
  if (count === 2) return COLORS.medium;
  if (count === 3) return '#FF8C42'; // orange transition
  return COLORS.congested;
}

function getEdgeCongestionWeight(count) {
  if (!count || count === 0) return 3;
  return Math.min(3 + count * 1.8, 10);
}

function getEdgeCongestionOpacity(count) {
  if (!count || count === 0) return 0.35;
  return Math.min(0.55 + count * 0.14, 1.0);
}

function getEdgeGlowClass(count) {
  if (!count || count === 0) return '';
  if (count <= 1) return 'road-glow';
  if (count <= 2) return 'road-glow-medium';
  return 'road-glow-congested';
}

// Vehicle color (strict palette)
function getVehicleColor(speed) {
  if (speed < 0.5) return COLORS.congested;
  if (speed < 5) return COLORS.medium;
  return COLORS.fast;
}

function getVehicleGlowClass(speed) {
  if (speed < 0.5) return 'vehicle-glow-stopped';
  if (speed < 5) return 'vehicle-glow-medium';
  return 'vehicle-glow-fast';
}

// Signal color
function getSignalColor(inter) {
  if (inter.is_yellow) return COLORS.yellow;
  if (inter.green_dirs?.includes('N') || inter.green_dirs?.includes('S')) return COLORS.nsGreen;
  return COLORS.ewGreen;
}

// ─── MEMOIZED MAP CORE ───
const OptiMap = memo(({ children }) => {
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
      {/* 🎯 #1: Carto Dark Matter NO LABELS — kills the "civilian" look */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <ResizeFix />
      {children}
    </MapContainer>
  );
});

// ─── MAIN DASHBOARD ───
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

  // 🛰️ 2. WebSocket Lifecycle
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
  const congestionLevel = metrics.stopped_vehicles > 20 ? 'critical' : metrics.stopped_vehicles > 8 ? 'elevated' : 'optimal';

  return (
    <div className="flex w-screen h-screen bg-[#020617] font-sans selection:bg-sky-500/30 overflow-hidden">
      
      {/* ══════════ Simulation View (75%) ══════════ */}
      <div className="flex-[3] min-h-0 relative shadow-[inset_-30px_0_50px_rgba(0,0,0,0.8)]">

        <OptiMap>


          {/* ════ Layer 1: Road Base (dark, structural) ══════ */}
          {mapData?.edges?.map((edge, idx) => (
            <Polyline 
              key={`base-${idx}`}
              positions={edge.path}
              pathOptions={{ 
                color: COLORS.roadBase, 
                weight: 4,
                opacity: 0.5
              }}
            />
          ))}

          {/* ════ Layer 2: Traffic Congestion Overlay (glowing) ══════ */}
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
                  opacity: getEdgeCongestionOpacity(count),
                  className: getEdgeGlowClass(count),
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              />
            );
          })}

          {/* ══════ Intersection Signal Hubs ══════ */}
          {data?.intersections?.map((inter) => {
            const signalColor = getSignalColor(inter);
            return (
              <CircleMarker 
                key={`signal-${inter.id}`}
                center={[inter.lat, inter.lon]}
                radius={12}
                pathOptions={{
                  fillColor: signalColor,
                  fillOpacity: 1.0,
                  color: '#ffffff',
                  weight: 3,
                  opacity: 0.9,
                }}
              >
                <Tooltip direction="top">
                  NODE {inter.id.toString().slice(-4)} • {inter.green_dirs?.join('/')} GREEN
                </Tooltip>
              </CircleMarker>
            );
          })}

          {/* ══════ Outer pulse ring for each signal (bigger, fading) ══════ */}
          {data?.intersections?.map((inter) => {
            const signalColor = getSignalColor(inter);
            return (
              <CircleMarker 
                key={`pulse-${inter.id}`}
                center={[inter.lat, inter.lon]}
                radius={22}
                pathOptions={{
                  fillColor: 'transparent',
                  fillOpacity: 0,
                  color: signalColor,
                  weight: 2,
                  opacity: 0.3,
                }}
              />
            );
          })}

          {/* ══════ Vehicles — GLOWING dots ══════ */}
          {(() => {
            // Build a fast edge lookup: "from_to" -> edge (first match)
            const edgeMap = {};
            if (mapData?.edges) {
              for (const e of mapData.edges) {
                const key = `${e.from}_${e.to}`;
                if (!edgeMap[key]) edgeMap[key] = e;
              }
            }

            return data?.vehicles?.map((v) => {
              const edgeKey = `${v.from}_${v.to}`;
              const edge = edgeMap[edgeKey];
              if (!edge?.path?.length || edge.path.length < 2) return null;

              // Clamp progress to [0, 1] to prevent overshoot
              const progress = Math.max(0, Math.min(v.pos / Math.max(v.length, 0.1), 1.0));
              const maxIdx = edge.path.length - 1;
              const rawIdx = progress * maxIdx;
              const pathIdx = Math.min(Math.floor(rawIdx), maxIdx - 1);
              const nextIdx = pathIdx + 1;
              const subProgress = rawIdx - pathIdx;
              
              const p1 = edge.path[pathIdx];
              const p2 = edge.path[nextIdx];
              if (!p1 || !p2) return null;

              const currentPos = [
                p1[0] + (p2[0] - p1[0]) * subProgress,
                p1[1] + (p2[1] - p1[1]) * subProgress
              ];

              // Sanity check — reject positions wildly off Mumbai
              if (Math.abs(currentPos[0] - 19.076) > 0.05 || Math.abs(currentPos[1] - 72.878) > 0.05) return null;

              const speed = v.speed || 0;
              const vColor = getVehicleColor(speed);
              const glowClass = getVehicleGlowClass(speed);

              return (
                <CircleMarker 
                  key={`v-${v.id}`}
                  center={currentPos}
                  radius={6}
                  pathOptions={{ 
                    fillColor: vColor, 
                    fillOpacity: 1, 
                    color: '#ffffff', 
                    weight: 2,
                    opacity: 0.7,
                    className: glowClass 
                  }}
                />
              );
            });
          })()}
        </OptiMap>

        {/* ─── Overlay Stack (vignette + grid + scanline) ─── */}
        <div className="map-overlay-vignette" />
        <div className="map-overlay-grid" />
        <div className="map-overlay-scanline" />

        {/* ─── HUD: Top Left ─── */}
        <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-3 pointer-events-none">
          <StatusBadge status={status} />
          <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2.5">
            <Radio className="w-3.5 h-3.5 text-[#00FFAA] animate-pulse" />
            <span className="hud-tag text-[#00FFAA]/80">Neural Network v3.2</span>
          </div>
          <CongestionIndicator level={congestionLevel} />
        </div>

        {/* ─── HUD: Bottom Left Legend ─── */}
        <div className="absolute bottom-6 left-6 z-[1000] glass-card p-4 rounded-2xl flex gap-5 items-center">
          <LegendItem dotClass="legend-dot-fast" label="Fast" />
          <LegendItem dotClass="legend-dot-medium" label="Medium" />
          <LegendItem dotClass="legend-dot-congested" label="Congested" />
          <div className="w-px h-5 bg-white/10" />
          <LegendItem dotClass="legend-dot-node" label="Signal" />
          <LegendItem dotClass="legend-dot-ai" label="AI" />
        </div>

        {/* ─── HUD: Top Right — Live indicator ─── */}
        <div className="absolute top-6 right-[calc(380px+24px)] z-[1000] pointer-events-none">
          <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="hud-tag text-red-400/90">LIVE</span>
          </div>
        </div>
      </div>

      {/* ══════════ Analytics Sidebar (25%) ══════════ */}
      <div className="w-[380px] bg-[#0a0f1a] h-full overflow-auto flex flex-col gap-5 p-7 border-l border-white/5 relative z-[1001] shadow-2xl">
        
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-[#4CC9F0] rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-[#020617]" />
            </div>
            <span className="hud-tag text-[#4CC9F0]">OptiFlow Command</span>
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-white contrast-200 uppercase leading-none">
            Traffic<br/>Intelligence
          </h1>
          <div className="mt-2 h-px w-16 bg-gradient-to-r from-[#4CC9F0] to-transparent" />
        </div>

        {/* Metrics Grid */}
        <div className="flex flex-col gap-3.5 pb-6">
          <StatCard 
            icon={<Clock className="text-[#4CC9F0]" />} 
            label="Grid Runtime" 
            value={metrics.step ? `${metrics.step}` : "--"} 
            unit="ticks"
            accentColor="#4CC9F0"
          />
          <StatCard 
            icon={<Navigation className="text-[#00FFAA]" />} 
            label="Fleet Size" 
            value={metrics.active_vehicles || "0"} 
            unit="active"
            accentColor="#00FFAA"
          />
          <StatCard 
            icon={<Gauge className="text-[#9B5DE5]" />} 
            label="Avg Speed" 
            value={metrics.avg_speed !== undefined ? `${metrics.avg_speed}` : "--"} 
            unit="m/s"
            accentColor="#9B5DE5"
          />
          <StatCard 
            icon={<OctagonX className="text-[#FFD166]" />} 
            label="Stopped" 
            value={metrics.stopped_vehicles !== undefined ? metrics.stopped_vehicles : "--"} 
            unit="vehicles"
            accentColor="#FFD166"
          />
          <StatCard 
            icon={<Zap className="text-[#FF4D4D]" />} 
            label="Total Wait" 
            value={metrics.total_waiting_time !== undefined ? `${metrics.total_waiting_time.toFixed(1)}` : "--"} 
            unit="seconds"
            accentColor="#FF4D4D"
          />
        </div>

        {/* AI Status Footer */}
        <div className="mt-auto space-y-3">
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border-[#9B5DE5]/15 hover:border-[#9B5DE5]/30 transition-colors">
            <div className="p-2.5 bg-[#9B5DE5]/10 rounded-xl">
              <Cpu className="w-5 h-5 text-[#9B5DE5]" />
            </div>
            <div>
              <p className="hud-tag mb-1">Decision Engine</p>
              <p className="text-sm font-bold text-[#9B5DE5] italic tracking-tight">DQN Multi-Agent Active</p>
            </div>
            <div className="ml-auto w-2 h-2 rounded-full bg-[#00FFAA] shadow-[0_0_8px_rgba(0,255,170,0.6)] animate-pulse" />
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border-[#4CC9F0]/15">
            <div className="p-2.5 bg-[#4CC9F0]/10 rounded-xl">
              <Eye className="w-5 h-5 text-[#4CC9F0]" />
            </div>
            <div>
              <p className="hud-tag mb-1">Camera Mode</p>
              <p className="text-sm font-bold text-[#4CC9F0]/80 italic tracking-tight">Auto-Track Congestion</p>
            </div>
          </div>
        </div>

        {/* Error Overlay */}
        {socketError && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] p-8 glass-card bg-rose-500/10 border-rose-500/40 rounded-[2.5rem] text-center backdrop-blur-3xl shadow-2xl z-50">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <p className="text-xl font-black text-rose-100 mb-2 uppercase tracking-widest">Connection Error</p>
            <p className="text-[11px] text-rose-300 font-bold leading-relaxed">{socketError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ───

function StatCard({ icon, label, value, unit, accentColor }) {
  return (
    <div className="glass-card stat-card-glow p-5 rounded-2xl border border-white/5 relative group overflow-hidden">
      {/* Accent line */}
      <div className="absolute top-0 left-0 w-1 h-full rounded-r-full opacity-40 transition-opacity group-hover:opacity-80"
           style={{ background: accentColor }} />
      
      <div className="flex justify-between items-center relative z-10 pl-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/5 rounded-lg border border-white/5 group-hover:border-white/10 transition-colors">
            {icon}
          </div>
          <div>
            <p className="hud-tag text-slate-500 mb-0.5">{label}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-light text-white tabular-nums tracking-tight">{value}</span>
              {unit && <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{unit}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const configs = {
    connected:    { color: 'bg-[#00FFAA] shadow-[0_0_10px_rgba(0,255,170,0.5)]', text: 'Bridge Sync: Strong' },
    connecting:   { color: 'bg-[#FFD166] shadow-[0_0_10px_rgba(255,209,102,0.5)]', text: 'Initializing' },
    reconnecting: { color: 'bg-[#FF4D4D] shadow-[0_0_10px_rgba(255,77,77,0.5)]', text: 'Signal Interference' },
    disconnected: { color: 'bg-slate-500', text: 'System Offline' }
  };
  const config = configs[status] || configs.disconnected;

  return (
    <div className="glass-card px-4 py-2.5 rounded-xl flex items-center gap-3 border border-white/5 shadow-2xl">
      <div className={`w-2 h-2 rounded-full ${config.color} animate-pulse`} />
      <span className="hud-tag text-slate-200 leading-none">{config.text}</span>
    </div>
  );
}

function CongestionIndicator({ level }) {
  const configs = {
    optimal:  { color: '#00FFAA', label: 'OPTIMAL FLOW' },
    elevated: { color: '#FFD166', label: 'ELEVATED LOAD' },
    critical: { color: '#FF4D4D', label: 'CRITICAL CONGESTION' },
  };
  const c = configs[level] || configs.optimal;

  return (
    <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2.5">
      <Crosshair className="w-3.5 h-3.5" style={{ color: c.color }} />
      <span className="hud-tag" style={{ color: c.color }}>{c.label}</span>
    </div>
  );
}

function LegendItem({ dotClass, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`legend-dot ${dotClass}`} />
      <span className="hud-tag text-slate-500">{label}</span>
    </div>
  );
}
