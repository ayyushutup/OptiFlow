import { useEffect, useMemo, useState, useCallback, memo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap, Tooltip } from 'react-leaflet';
import { Activity, Clock, Navigation, BarChart3, Radio, AlertCircle, Cpu, Zap, Gauge, OctagonX, Crosshair, Layers, Eye } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

// ─── Color System (Cyberpunk) ───
const COLORS = {
  fast:      '#00FFC6',
  medium:    '#FF00FF', // magenta
  congested: '#FF3B3B', // neon red
  node:      '#00BFFF', // electric blue
  ai:        '#9B5DE5', // purple
  roadBase:  '#050A15',
  roadEmpty: '#030610',
  nsGreen:   '#00FFC6',
  ewGreen:   '#FF00FF',
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
  if (count <= 1) return 'neon-glow-fast';
  if (count <= 2) return 'neon-glow-medium';
  return 'neon-glow-congested';
}

// Vehicle color (strict palette)
function getVehicleColor(speed) {
  if (speed < 0.5) return COLORS.congested;
  if (speed < 5) return COLORS.medium;
  return COLORS.fast;
}

function getVehicleGlowClass(speed) {
  if (speed < 0.5) return 'neon-glow-congested';
  if (speed < 5) return 'neon-glow-medium';
  return 'neon-glow-fast';
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
      preferCanvas={true}
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
  const [history, setHistory] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const wsRef = useRef(null);

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

      wsRef.current = ws;

      let lastUpdate = 0;

      ws.onmessage = (event) => {
        try {
          // Throttle updates to ~5 FPS to prevent massive memory leaks in Safari
          const now = Date.now();
          if (now - lastUpdate < 200) return;
          lastUpdate = now;

          const parsed = JSON.parse(event.data);
          setData(parsed);
          if (parsed.metrics) {
             setHistory(prev => {
                 const updated = [...prev, { time: parsed.metrics.step, speed: parsed.metrics.avg_speed, wait: parsed.metrics.total_waiting_time }];
                 if (updated.length > 50) updated.shift();
                 return updated;
             });
          }
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
      <div className="map-wrapper flex-[3] min-h-0 relative shadow-[inset_-30px_0_50px_rgba(0,0,0,0.8)]">

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

          {/* ════ Layer 2 & 3: Congestion Overlay & AI Streams ══════ */}
          {mapData?.edges?.map((edge, idx) => {
            const congestionKey = `${edge.from}_${edge.to}`;
            const count = data?.edge_congestion?.[congestionKey] || 0;
            return (
              <div key={`edge-group-${idx}`}>
                {/* Congestion Glow */}
                <Polyline 
                  positions={edge.path}
                  eventHandlers={{
                    click: () => wsRef.current?.send(JSON.stringify({type: 'ADD_INCIDENT', from: edge.from, to: edge.to}))
                  }}
                  pathOptions={{ 
                    color: getEdgeCongestionColor(count), 
                    weight: getEdgeCongestionWeight(count) * 1.5, // Thicker so it's easier to click
                    opacity: Math.max(0.2, getEdgeCongestionOpacity(count)), 
                    className: getEdgeGlowClass(count) + ' cursor-pointer',
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
                
                {/* AI Data Stream (Flowing dashed lines if active) */}
                {count > 0 && (
                  <Polyline 
                    positions={edge.path}
                    pathOptions={{ 
                      color: COLORS.ai, 
                      weight: 1.5,
                      opacity: 0.8,
                      className: 'road-flow neon-glow-ai'
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* ══════ Intersection Signal Hubs ══════ */}
          {data?.intersections?.map((inter) => {
            const signalColor = getSignalColor(inter);
            const isSelected = selectedNodeId === inter.id;
            const glowClass = isSelected ? 'neon-glow-fast' : 'neon-glow-node';
            return (
              <CircleMarker 
                key={`signal-${inter.id}`}
                center={[inter.lat, inter.lon]}
                radius={isSelected ? 16 : 12}
                eventHandlers={{
                  click: () => { setSelectedNodeId(isSelected ? null : inter.id); }
                }}
                pathOptions={{
                  fillColor: signalColor,
                  fillOpacity: 1.0,
                  color: isSelected ? '#FFFFFF' : '#ffffff',
                  weight: isSelected ? 4 : 2,
                  opacity: 0.9,
                  className: glowClass
                }}
              >
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

          {/* ══════ Pedestrian Crossings (All-Red) ══════ */}
          {data?.pedestrians?.map((p_node) => {
             const inter = data?.intersections?.find(i => i.id === p_node);
             if (!inter) return null;
             return (
               <CircleMarker 
                  key={`ped-${p_node}`}
                  center={[inter.lat, inter.lon]}
                  radius={20}
                  pathOptions={{
                    fillColor: '#FFFFFF',
                    fillOpacity: 0.6,
                    color: '#FFFFFF',
                    weight: 2,
                    dashArray: '4, 4',
                    className: 'animate-spin'
                  }}
               />
             )
          })}

          {/* ══════ EVP Corridors (Ambulance Overrides) ══════ */}
          {data?.evp_routes?.map((pathCoords, i) => (
             <Polyline 
               key={`evp-${i}`}
               positions={pathCoords}
               pathOptions={{
                 color: '#FF0055',
                 weight: 6,
                 opacity: 0.8,
                 className: 'animate-pulse drop-shadow-[0_0_15px_rgba(255,0,85,0.8)]'
               }}
             />
          ))}

          {/* ══════ Vehicles & Incidents ══════ */}
          {(() => {
            // Build a fast edge lookup: "from_to" -> edge (first match)
            const edgeMap = {};
            if (mapData?.edges) {
              for (const e of mapData.edges) {
                const key = `${e.from}_${e.to}`;
                if (!edgeMap[key]) edgeMap[key] = e;
              }
            }
            
            const interpolatePath = (edge, pos, edgeLen = 10) => {
              if (!edge?.path?.length || edge.path.length < 2) return null;
              const progress = Math.max(0, Math.min(pos / Math.max(edgeLen, 0.1), 1.0));
              const maxIdx = edge.path.length - 1;
              const rawIdx = progress * maxIdx;
              const pathIdx = Math.min(Math.floor(rawIdx), maxIdx - 1);
              const nextIdx = pathIdx + 1;
              const subProgress = rawIdx - pathIdx;
              const p1 = edge.path[pathIdx];
              const p2 = edge.path[nextIdx];
              if (!p1 || !p2) return null;
              return [
                p1[0] + (p2[0] - p1[0]) * subProgress,
                p1[1] + (p2[1] - p1[1]) * subProgress
              ];
            };

            const incidentMarkers = data?.incidents?.map((inc, i) => {
               const edgeKey = `${inc.from}_${inc.to}`;
               const edge = edgeMap[edgeKey];
               if (!edge) return null;
               // Estimate edge length. We don't have exact length here, fallback to 50
               const pos = interpolatePath(edge, inc.pos, 50);
               if (!pos) return null;
               return (
                 <CircleMarker 
                   key={`inc-${i}`}
                   center={pos}
                   radius={14}
                   pathOptions={{
                     fillColor: '#FF0000', fillOpacity: 0.8, color: '#FFFFFF', weight: 2, className: 'animate-ping'
                   }}
                 />
               );
            });

            const vehicleMarkers = data?.vehicles?.map((v) => {
              const edgeKey = `${v.from}_${v.to}`;
              const edge = edgeMap[edgeKey];
              const currentPos = interpolatePath(edge, v.pos, Math.max(v.edge_length || 10, 0.1));
              if (!currentPos) return null;

              // Sanity check — reject positions wildly off Mumbai
              if (Math.abs(currentPos[0] - 19.076) > 0.05 || Math.abs(currentPos[1] - 72.878) > 0.05) return null;

              const speed = v.speed || 0;
              let vColor = getVehicleColor(speed);
              let glowClass = getVehicleGlowClass(speed);
              let renderRadius = 6;
              
              if (v.type === 'truck') {
                  renderRadius = 9;
                  vColor = '#FF8C42'; 
              } else if (v.type === 'bus') {
                  renderRadius = 10;
                  vColor = '#FFD166'; 
              } else if (v.type === 'emergency') {
                  renderRadius = 8;
                  vColor = '#FF0055'; 
                  glowClass = 'neon-glow-congested animate-pulse';
              }

              return (
                <CircleMarker 
                  key={`v-${v.id}`}
                  center={currentPos}
                  radius={renderRadius}
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
            
            return <>{incidentMarkers}{vehicleMarkers}</>;
          })()}
        </OptiMap>

        {/* ─── Overlay Stack (vignette + grid + scanline) ─── */}
        <div className="map-overlay-vignette" />
        <div className="map-overlay-grid" />
        <div className="map-overlay-scanline" />

        {/* ─── HUD: Top Left ─── */}
        <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-3 pointer-events-none">
          <StatusBadge status={status} />
          <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2.5 border-l-[3px] border-l-[#00FFC6]">
            <Radio className="w-3.5 h-3.5 text-[#00FFC6] animate-pulse glow-icon" />
            <span className="hud-tag text-[#00FFC6] text-cyber-glow glitch">Neural Network v3.2</span>
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
          <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2 border-l-[3px] border-l-[#FF3B3B]">
            <div className="w-2 h-2 rounded-full bg-[#FF3B3B] animate-pulse neon-glow-congested" />
            <span className="hud-tag text-[#FF3B3B] text-cyber-glow glitch" style={{ animationDelay: '0.5s' }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* ══════════ Analytics Sidebar (25%) ══════════ */}
      <div className="w-[380px] bg-[#0a0f1a] h-full overflow-auto flex flex-col gap-5 p-7 border-l border-white/5 relative z-[1001] shadow-2xl">
        
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-[var(--c-node)] rounded-lg flex items-center justify-center neon-glow-node">
              <BarChart3 className="w-4 h-4 text-[#000]" />
            </div>
            <span className="hud-tag text-[var(--c-node)] text-cyber-glow">OptiFlow Command</span>
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-white contrast-200 uppercase leading-none drop-shadow-md">
            Traffic<br/><span className="text-[var(--c-fast)] text-cyber-glow">Intelligence</span>
          </h1>
          <div className="mt-2 h-[2px] w-16 bg-gradient-to-r from-[var(--c-fast)] to-[var(--c-medium)] neon-glow-fast" />
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

        {/* Node Override & Analytics */}
        {(() => {
           const sNode = data?.intersections?.find(n => n.id === selectedNodeId);
           return (
             <div className="flex flex-col gap-4 mt-auto">
               {sNode ? (
                 <div className={`glass-card p-4 rounded-xl border-l-[3px] ${sNode.is_overridden ? 'border-l-[#FF3B3B]' : 'border-l-[#FF00FF]'}`}>
                   <h3 className="text-[#FF00FF] font-bold uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
                     <Crosshair className="w-4 h-4" /> NODE {sNode.id.toString().slice(-4)} {sNode.is_overridden ? '(OVERRIDDEN)' : ''}
                   </h3>
                   
                   {/* EVP OVERRIDE INDICATOR */}
                   {sNode.is_evp && (
                     <div className="mb-4 p-2 bg-[#FF0055]/20 border border-[#FF0055] rounded-xl text-center shadow-[0_0_15px_rgba(255,0,85,0.4)] animate-pulse">
                       <p className="font-bold text-[#FF0055] uppercase tracking-widest text-[10px] flex items-center justify-center gap-1">
                         <AlertCircle className="w-3 h-3" /> EVP ACTIVE
                       </p>
                     </div>
                   )}

                   {/* Manual Override Controls */}
                   <div className="flex gap-2 mb-4">
                     <button className="flex-1 bg-white/10 hover:bg-white/20 text-[#00FFC6] font-bold text-[10px] py-1.5 rounded transition-colors" onClick={() => wsRef.current?.send(JSON.stringify({type: 'OVERRIDE', node_id: sNode.id, action: 0}))}>N/S GREEN</button>
                     <button className="flex-1 bg-white/10 hover:bg-white/20 text-[#FF00FF] font-bold text-[10px] py-1.5 rounded transition-colors" onClick={() => wsRef.current?.send(JSON.stringify({type: 'OVERRIDE', node_id: sNode.id, action: 1}))}>E/W GREEN</button>
                     <button className="flex-1 bg-[#FF3B3B]/20 hover:bg-[#FF3B3B]/40 text-[#FF3B3B] font-bold text-[10px] py-1.5 rounded transition-colors" onClick={() => wsRef.current?.send(JSON.stringify({type: 'OVERRIDE', node_id: sNode.id, action: -1}))}>AUTO AI</button>
                   </div>
                   
                   {/* Q-Value Readout */}
                   {sNode.q_values && (
                     <div className="mt-2">
                       <p className="text-[10px] text-slate-400 mb-1 tracking-widest uppercase">Agent Inner Policy (Q-Values)</p>
                       <div className="flex justify-between items-center bg-[#000]/40 px-3 py-2 rounded border border-white/5">
                         <span className="text-[#00FFC6] font-mono text-xs">N/S: {sNode.q_values[0].toFixed(2)}</span>
                         <div className="w-px h-3 bg-white/20" />
                         <span className="text-[#FF00FF] font-mono text-xs">E/W: {sNode.q_values[1].toFixed(2)}</span>
                       </div>
                     </div>
                   )}
                 </div>
               ) : (
                 <div className="glass-card p-4 rounded-xl border border-white/5 opacity-50 flex items-center gap-3">
                   <Radio className="w-4 h-4 text-slate-500" />
                   <p className="text-xs text-slate-500 uppercase tracking-widest leading-tight">Select map node<br/>to grant God Mode</p>
                 </div>
               )}

               {/* Environment Controls */}
               <div className="glass-card p-4 rounded-xl border border-white/5">
                 <h3 className="text-[#4CC9F0] font-bold uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
                   <Layers className="w-4 h-4" /> Global Climate
                 </h3>
                 <div className="flex gap-2">
                    <button className={`flex-1 font-bold text-[10px] py-1.5 rounded transition-colors ${data?.weather === 'clear' ? 'bg-[#4CC9F0] text-black drop-shadow-[0_0_10px_rgba(76,201,240,0.8)]' : 'bg-white/10 text-white'}`} onClick={() => wsRef.current?.send(JSON.stringify({type: 'WEATHER', condition: 'clear'}))}>CLEAR</button>
                    <button className={`flex-1 font-bold text-[10px] py-1.5 rounded transition-colors ${data?.weather === 'rain' ? 'bg-[#4CC9F0] text-black drop-shadow-[0_0_10px_rgba(76,201,240,0.8)]' : 'bg-white/10 text-white'}`} onClick={() => wsRef.current?.send(JSON.stringify({type: 'WEATHER', condition: 'rain'}))}>RAIN</button>
                    <button className={`flex-1 font-bold text-[10px] py-1.5 rounded transition-colors ${data?.weather === 'storm' ? 'bg-[#4CC9F0] text-black drop-shadow-[0_0_10px_rgba(76,201,240,0.8)]' : 'bg-white/10 text-white'}`} onClick={() => wsRef.current?.send(JSON.stringify({type: 'WEATHER', condition: 'storm'}))}>STORM</button>
                 </div>
                 <h3 className="text-[#FF3B3B] font-bold uppercase tracking-widest text-xs mt-4 mb-3 flex items-center gap-2">
                   <AlertCircle className="w-4 h-4" /> Hazard Injection
                 </h3>
                 <div className="flex gap-2">
                     <button className="w-1/2 bg-[#FF3B3B]/20 hover:bg-[#FF3B3B]/40 text-[#FF3B3B] font-bold text-[10px] py-1.5 rounded transition-colors" onClick={() => wsRef.current?.send(JSON.stringify({type: 'TOGGLE_RANDOM_INCIDENTS'}))}>SPAWN RANDOM</button>
                     <button className="w-1/2 bg-white/10 hover:bg-[#FF3B3B]/40 text-[#FF3B3B] font-bold text-[10px] py-1.5 rounded transition-colors" onClick={() => wsRef.current?.send(JSON.stringify({type: 'CLEAR_INCIDENTS'}))}>CLEAR ALL</button>
                 </div>
                 <p className="text-[9px] text-slate-500 mt-2 uppercase tracking-widest leading-tight">Click on any road path on the map to manually inject an incident.</p>
               </div>

               {/* Live Chart */}
               {history.length > 0 && (
                 <div className="glass-card p-4 rounded-xl border border-white/5 h-48 flex flex-col">
                   <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-widest w-full flex justify-between">
                     <span>Global Telemetry</span>
                     <span className="text-[#4CC9F0]">Spd</span> | <span className="text-[#FF4D4D]">Wait</span>
                   </p>
                   <div className="flex-1 min-h-0">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={history}>
                         <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                         <XAxis dataKey="time" hide />
                         <YAxis yAxisId="left" stroke="#4CC9F0" tick={{fontSize: 9}} width={30} axisLine={false} tickLine={false} />
                         <YAxis yAxisId="right" orientation="right" stroke="#FF4D4D" tick={{fontSize: 9}} width={30} axisLine={false} tickLine={false} />
                         <RechartsTooltip contentStyle={{backgroundColor: '#050A15', borderColor: '#ffffff20', color: '#fff'}} itemStyle={{fontSize: '12px'}} labelStyle={{display: 'none'}} />
                         <Line yAxisId="left" type="monotone" dataKey="speed" stroke="#4CC9F0" strokeWidth={2} dot={false} isAnimationActive={false} />
                         <Line yAxisId="right" type="monotone" dataKey="wait" stroke="#FF4D4D" strokeWidth={2} dot={false} isAnimationActive={false} />
                       </LineChart>
                     </ResponsiveContainer>
                   </div>
                 </div>
               )}
             </div>
           );
        })()}

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
    connected:    { color: 'bg-[var(--c-fast)] neon-glow-fast', text: 'Bridge Sync: Strong' },
    connecting:   { color: 'bg-[var(--c-yellow)] neon-glow-medium', text: 'Initializing' },
    reconnecting: { color: 'bg-[var(--c-congested)] neon-glow-congested', text: 'Signal Interference' },
    disconnected: { color: 'bg-slate-500', text: 'System Offline' }
  };
  const config = configs[status] || configs.disconnected;

  return (
    <div className="glass-card px-4 py-2.5 rounded-xl flex items-center gap-3 border-l-[3px] border-l-white/20">
      <div className={`w-2 h-2 rounded-full ${config.color} animate-pulse`} />
      <span className="hud-tag text-white leading-none text-cyber-glow">{config.text}</span>
    </div>
  );
}

function CongestionIndicator({ level }) {
  const configs = {
    optimal:  { color: 'var(--c-fast)', label: 'OPTIMAL FLOW', glow: 'neon-glow-fast' },
    elevated: { color: 'var(--c-medium)', label: 'ELEVATED LOAD', glow: 'neon-glow-medium' },
    critical: { color: 'var(--c-congested)', label: 'CRITICAL OVERLOAD', glow: 'neon-glow-congested' },
  };
  const c = configs[level] || configs.optimal;

  return (
    <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2.5 border-l-[3px]" style={{ borderColor: c.color }}>
      <Crosshair className={`w-3.5 h-3.5 ${c.glow}`} style={{ color: c.color }} />
      <span className={`hud-tag text-cyber-glow ${c.glow}`} style={{ color: c.color }}>{c.label}</span>
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
