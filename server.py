import sys
import os
import asyncio
import json
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import networkx as nx
import math
import config
from agents.map_engine import MapEngine
from agents.dqn_agent import DQNAgent
from agents.real_env import RealTrafficEnv

# Ensure simulation/agents paths are available
sys.path.append(os.path.join(os.path.dirname(__file__), 'simulation'))
sys.path.append(os.path.join(os.path.dirname(__file__), 'agents'))

app = FastAPI(title="OptiFlow Real-World Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global map engine
map_engine = MapEngine(location="Mumbai, India", dist=1000)
# Fetching map data (blocking for first time, but we'll optimize with cache later)
map_engine.fetch_map()
real_network = map_engine.get_serializable_network()
real_graph = map_engine.get_graph()

class RealSimManager:
    """Manages continuous traffic simulation on a real-world graph with DQN agents."""
    def __init__(self, network, graph):
        self.network = network
        self.graph = graph
        self.nodes = network['nodes']
        self.edges = network['edges']
        self.vehicles = []
        self.step_count = 0
        self.vehicle_id_counter = 0
        
        # RL Integration
        self.env = RealTrafficEnv(graph)
        self.agents = {}   # node_id -> DQNAgent
        self.signals = {}  # node_id -> state dict
        
        # Initialize agents for OSM signals
        for node in self.nodes:
            if node.get('is_signal'):
                sid = node['id']
                # State: [N, S, E, W] queues. Action: 0 (NS Green) or 1 (EW Green)
                self.agents[sid] = DQNAgent(state_size=4, action_size=2)
                self.signals[sid] = {
                    "green_dirs": ["N", "S"],
                    "last_state": None,
                    "last_action": 0,
                    "is_yellow": False
                }

    def _get_direction(self, u, v):
        """Helper to get compass dir (N, S, E, W) of edge u->v at intersection v."""
        u_data, v_data = self.graph.nodes[u], self.graph.nodes[v]
        dy = v_data['y'] - u_data['y']
        dx = (v_data['x'] - u_data['x']) * math.cos(math.radians(v_data['y']))
        angle = math.degrees(math.atan2(dy, dx))
        if -45 <= angle <= 45: return 'E'
        elif 45 < angle <= 135: return 'N'
        elif -135 <= angle < -45: return 'S'
        else: return 'W'

    def spawn_vehicle(self):
        """Spawns a vehicle with a real origin-destination path."""
        node_ids = [n['id'] for n in self.nodes]
        orig = np.random.choice(node_ids)
        dest = np.random.choice(node_ids)
        
        if orig == dest: return

        try:
            # Calculate shortest path by length
            path = nx.shortest_path(self.graph, orig, dest, weight='length')
            if len(path) < 2: return
            
            # Get first edge data
            u, v = path[0], path[1]
            edge_data = self.graph[u][v][0] # MultiDiGraph first edge
            
            self.vehicles.append({
                "id": f"v_{self.vehicle_id_counter}",
                "path": path,
                "path_idx": 0,
                "from": u,
                "to": v,
                "pos": 0,
                "length": edge_data.get('length', 10),
                "speed": np.random.uniform(10, 20), # m/s (approx 36-72 km/h)
                "max_speed": np.random.uniform(12, 20),
                "waiting_time": 0.0
            })
            self.vehicle_id_counter += 1
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            pass

    def tick(self):
        """Simulation physics step with IDM car-following, signal control, and real metrics."""
        self.step_count += 1
        dt = 0.1  # 100ms time step
        
        # 1. RL Signal Control (Every 50 ticks = 5s)
        if self.step_count % 50 == 0:
            for sid, agent in self.agents.items():
                state = self.env.get_state(sid, self.vehicles)
                action = agent.choose_action(state)
                self.signals[sid]['green_dirs'] = self.env.get_green_dirs(sid, action)
                
                if self.signals[sid]['last_state'] is not None:
                    reward = self.env.get_reward(sid, self.vehicles)
                    agent.remember(self.signals[sid]['last_state'], 
                                   self.signals[sid]['last_action'], 
                                   reward, state, False)
                    agent.replay(config.BATCH_SIZE)
                    agent.decay_epsilon()
                
                self.signals[sid]['last_state'] = state
                self.signals[sid]['last_action'] = action

        # 2. Spawn logic
        if np.random.rand() < 0.15 and len(self.vehicles) < 50:
            self.spawn_vehicle()

        # 3. Build edge occupancy index for IDM (vehicles sorted by position per edge)
        edge_vehicles = {}  # (from, to) -> list of vehicles sorted by pos
        for v in self.vehicles:
            key = (v['from'], v['to'])
            edge_vehicles.setdefault(key, []).append(v)
        for key in edge_vehicles:
            edge_vehicles[key].sort(key=lambda x: x['pos'])
            
        # 4. Move vehicles with IDM + Stop-at-Red
        # IDM Parameters
        IDM_A = 2.0     # max acceleration (m/s^2)
        IDM_B = 3.0     # comfortable deceleration (m/s^2)
        IDM_S0 = 4.0    # minimum gap (m)
        IDM_T = 1.0     # safe time headway (s)
        
        active_vehicles = []
        for v in self.vehicles:
            u, dest_node = v['from'], v['to']
            desired_speed = v['max_speed']
            
            # --- Signal check ---
            stopped_by_signal = False
            if dest_node in self.signals:
                dist_to_stop = v['length'] - v['pos']
                if dist_to_stop < 15:
                    incoming_dir = self._get_direction(u, dest_node)
                    if incoming_dir not in self.signals[dest_node]['green_dirs']:
                        stopped_by_signal = True
            
            # --- IDM: find leader on same edge ---
            edge_key = (u, dest_node)
            siblings = edge_vehicles.get(edge_key, [])
            leader_gap = float('inf')
            leader_speed = desired_speed
            
            idx_in_edge = None
            for i, sv in enumerate(siblings):
                if sv['id'] == v['id']:
                    idx_in_edge = i
                    break
            
            if idx_in_edge is not None and idx_in_edge + 1 < len(siblings):
                leader = siblings[idx_in_edge + 1]
                leader_gap = leader['pos'] - v['pos'] - 5.0  # 5m vehicle length
                leader_speed = leader['speed']
                if leader_gap < 0: leader_gap = 0.1
            
            # Virtual leader for red light
            if stopped_by_signal:
                signal_gap = v['length'] - v['pos'] - 2.0  # stop 2m before line
                if signal_gap < leader_gap:
                    leader_gap = max(signal_gap, 0.1)
                    leader_speed = 0.0
            
            # --- IDM acceleration ---
            speed = v['speed']
            delta_v = speed - leader_speed
            s_star = IDM_S0 + max(0, speed * IDM_T + (speed * delta_v) / (2 * math.sqrt(IDM_A * IDM_B)))
            
            free_accel = 1.0 - (speed / max(desired_speed, 0.1)) ** 4
            interaction = (s_star / max(leader_gap, 0.1)) ** 2
            accel = IDM_A * (free_accel - interaction)
            accel = max(accel, -IDM_B * 2)  # clip harsh braking
            
            new_speed = max(0, speed + accel * dt)
            v['speed'] = min(new_speed, v['max_speed'])
            v['pos'] += v['speed'] * dt
            
            # Track waiting time
            if v['speed'] < 0.5:
                v['waiting_time'] += dt
            
            # --- Edge transition ---
            if v['pos'] >= v['length']:
                v['path_idx'] += 1
                if v['path_idx'] + 1 < len(v['path']):
                    next_u = v['path'][v['path_idx']]
                    next_v = v['path'][v['path_idx'] + 1]
                    try:
                        edge_data = self.graph[next_u][next_v][0]
                        v['from'] = next_u
                        v['to'] = next_v
                        v['pos'] = 0
                        v['length'] = edge_data.get('length', 10)
                        active_vehicles.append(v)
                    except (KeyError, IndexError): pass
                # else: destination reached, vehicle removed
            else:
                active_vehicles.append(v)
            
        self.vehicles = active_vehicles
        return self._serialize(edge_vehicles)

    def _serialize(self, edge_vehicles=None):
        # Build edge congestion map for heatmap
        edge_congestion = {}
        if edge_vehicles:
            for (u, v), vehs in edge_vehicles.items():
                key = f"{int(u)}_{int(v)}"
                edge_congestion[key] = len(vehs)
        
        total_wait = sum(v['waiting_time'] for v in self.vehicles)
        avg_speed = (sum(v['speed'] for v in self.vehicles) / max(len(self.vehicles), 1))
        stopped = sum(1 for v in self.vehicles if v['speed'] < 0.5)
        
        return {
            "intersections": [
                {
                    "id": int(sid), 
                    "green_dirs": s['green_dirs'], 
                    "is_yellow": s['is_yellow'],
                    "lat": next(n['lat'] for n in self.nodes if n['id'] == sid),
                    "lon": next(n['lon'] for n in self.nodes if n['id'] == sid)
                } for sid, s in self.signals.items()
            ],
            "vehicles": [
                {
                    "id": v['id'],
                    "from": int(v['from']),
                    "to": int(v['to']),
                    "pos": float(v['pos']),
                    "length": float(v['length']),
                    "speed": round(float(v['speed']), 1)
                } for v in self.vehicles
            ],
            "edge_congestion": edge_congestion,
            "metrics": {
                "step": self.step_count,
                "active_vehicles": len(self.vehicles),
                "stopped_vehicles": stopped,
                "avg_speed": round(float(avg_speed), 1),
                "total_waiting_time": round(float(total_wait), 1)
            }
        }

sim_manager = RealSimManager(real_network, real_graph)

@app.get("/map")
async def get_map():
    """Retrieve the static road network."""
    return real_network

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        print("[Server] WebSocket Connection Established.")
        while True:
            # Broadcast physics
            frame = sim_manager.tick()
            await websocket.send_text(json.dumps(frame))
            await asyncio.sleep(0.05) # ~20 FPS simulation steps
    except WebSocketDisconnect:
        print("[Server] Connection Dropped.")
    except Exception as e:
        print(f"[Server] WS Error: {e}")

if __name__ == "__main__":
    print("Starting OptiFlow Real-World Engine on ws://localhost:8000")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
