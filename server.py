import sys
import os
import asyncio
import json
import numpy as np
import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import networkx as nx
import math
import config
import database
from agents.map_engine import MapEngine
from agents.dqn_agent import DQNAgent
from agents.real_env import RealTrafficEnv

# Ensure simulation/agents paths are available
sys.path.append(os.path.join(os.path.dirname(__file__), 'simulation'))
sys.path.append(os.path.join(os.path.dirname(__file__), 'agents'))

app = FastAPI(title="OptiFlow Real-World Backend")

database.init_db()

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
        
        # Persistence settings
        self.model_path = os.path.join(config.MODEL_DIR, "dqn_main.pth")
        
        # New Simulation Dimensions
        self.weather = 'clear'
        self.incidents = {} # (u, v) -> position
        self.pedestrian_events = {} # node_id -> remaining_ticks
        
        # Regional Federated Learning Setup
        lats = [n['lat'] for n in self.nodes]
        lons = [n['lon'] for n in self.nodes]
        self.mid_lat = (max(lats) + min(lats)) / 2 if lats else 0
        self.mid_lon = (max(lons) + min(lons)) / 2 if lons else 0
        
        self.regional_agents = {
            "NW": DQNAgent(state_size=8, action_size=2),
            "NE": DQNAgent(state_size=8, action_size=2),
            "SW": DQNAgent(state_size=8, action_size=2),
            "SE": DQNAgent(state_size=8, action_size=2)
        }
        self.overrides = {} # node_id -> action (0 or 1)
        self.evp_routes = []
        
        # Initialize regional agents for OSM signals
        for node in self.nodes:
            if node.get('is_signal'):
                sid = node['id']
                if node['lat'] >= self.mid_lat and node['lon'] <= self.mid_lon: quad = "NW"
                elif node['lat'] >= self.mid_lat and node['lon'] > self.mid_lon: quad = "NE"
                elif node['lat'] < self.mid_lat and node['lon'] <= self.mid_lon: quad = "SW"
                else: quad = "SE"
                
                self.agents[sid] = self.regional_agents[quad]
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
            
            # Choose vehicle type
            rand_val = np.random.rand()
            if rand_val < 0.70:
                v_type = 'car'
                v_len = 5.0
                max_speed = np.random.uniform(15, 20)
                accel_mult = 1.0
            elif rand_val < 0.90:
                v_type = 'truck'
                v_len = 12.0
                max_speed = np.random.uniform(10, 12)
                accel_mult = 0.5
            elif rand_val < 0.98:
                v_type = 'bus'
                v_len = 10.0
                max_speed = np.random.uniform(12, 15)
                accel_mult = 0.7
            else:
                v_type = 'emergency'
                v_len = 6.0
                max_speed = np.random.uniform(22, 28)
                accel_mult = 1.5
                
            self.vehicles.append({
                "id": f"v_{self.vehicle_id_counter}",
                "type": v_type,
                "path": path,
                "path_idx": 0,
                "from": u,
                "to": v,
                "pos": 0,
                "edge_length": edge_data.get('length', 10),
                "v_length": v_len,
                "speed": max_speed * 0.8,
                "max_speed": max_speed,
                "accel_mult": accel_mult,
                "waiting_time": 0.0
            })
            self.vehicle_id_counter += 1
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            pass

    def tick(self):
        """Simulation physics step with IDM car-following, signal control, and real metrics."""
        self.step_count += 1
        dt = 0.1  # 100ms time step
        
        # 0. Emergency Preemption Projection
        self.evp_overrides = {}
        self.evp_routes = []
        for v in self.vehicles:
            if v.get('type') == 'emergency':
                idx = v['path_idx']
                if idx < len(v['path']):
                    evp_path = v['path'][idx:]
                    coords = []
                    for n in evp_path:
                        n_data = self.graph.nodes.get(n)
                        if n_data: coords.append([n_data.get('y', 0), n_data.get('x', 0)])
                    self.evp_routes.append(coords)
                    
                    dist_accum = v.get('edge_length', 10) - v.get('pos', 0)
                    for j in range(idx + 1, len(v['path'])):
                        u = v['path'][j-1]
                        node = v['path'][j]
                        if node in self.signals:
                            if dist_accum < 500:
                                incoming_dir = self._get_direction(u, node)
                                # Map direction to action: 0 -> N/S, 1 -> E/W
                                desired_action = 0 if incoming_dir in ['N', 'S'] else 1
                                self.evp_overrides[node] = desired_action
                        try:
                            # Safely fetch edge length
                            e_len = 10
                            edge_list = self.graph.get(u, {}).get(node, {})
                            if 0 in edge_list and 'length' in edge_list[0]:
                                e_len = edge_list[0]['length']
                            dist_accum += e_len
                        except: pass

        # 1. RL Signal Control (Every 50 ticks = 5s)
        if self.step_count % 50 == 0:
            for sid, agent in self.agents.items():
                state = self.env.get_state(sid, self.vehicles)
                
                # Check Overrides (EVP > Manual)
                if sid in self.evp_overrides:
                    action = self.evp_overrides[sid]
                    with torch.no_grad():
                        q_tensor = agent.model(torch.FloatTensor(state).unsqueeze(0).to(agent.device))
                        self.signals[sid]['q_values'] = q_tensor[0].tolist()
                        self.signals[sid]['is_evp'] = True
                elif sid in self.overrides:
                    action = self.overrides[sid]
                    # We can optionally fetch Q-values here for visualization without training
                    with torch.no_grad():
                        q_tensor = agent.model(torch.FloatTensor(state).unsqueeze(0).to(agent.device))
                        self.signals[sid]['q_values'] = q_tensor[0].tolist()
                else:
                    action = agent.choose_action(state)
                    with torch.no_grad():
                        q_tensor = agent.model(torch.FloatTensor(state).unsqueeze(0).to(agent.device))
                        self.signals[sid]['q_values'] = q_tensor[0].tolist()
                        
                    if self.signals[sid]['last_state'] is not None:
                        reward = self.env.get_reward(sid, self.vehicles)
                        agent.remember(self.signals[sid]['last_state'], 
                                       self.signals[sid]['last_action'], 
                                       reward, state, False)
                        agent.replay(config.BATCH_SIZE)
                        agent.decay_epsilon()
                    
                    self.signals[sid]['last_state'] = state
                    self.signals[sid]['last_action'] = action
                    self.signals[sid]['is_evp'] = False

                self.signals[sid]['green_dirs'] = self.env.get_green_dirs(sid, action)

        # 2. Spawn logic
        if np.random.rand() < 0.3 and len(self.vehicles) < 150:
            self.spawn_vehicle()
            
        # 2.5 Pedestrian Events (Random crosswalk blockades)
        if self.step_count % 300 == 0:
            signal_nodes = [n['id'] for n in self.nodes if n.get('is_signal')]
            if signal_nodes and np.random.rand() < 0.15:
                ped_node = np.random.choice(signal_nodes)
                self.pedestrian_events[ped_node] = 100 # 100 ticks = 10s

        active_peds = []
        for pnode in list(self.pedestrian_events.keys()):
            self.pedestrian_events[pnode] -= 1
            if self.pedestrian_events[pnode] <= 0:
                del self.pedestrian_events[pnode]
            else:
                active_peds.append(pnode)

        # 3. Build edge occupancy index for IDM (vehicles sorted by position per edge)
        edge_vehicles = {}  # (from, to) -> list of vehicles sorted by pos
        for v in self.vehicles:
            key = (v['from'], v['to'])
            edge_vehicles.setdefault(key, []).append(v)
        for key in edge_vehicles:
            edge_vehicles[key].sort(key=lambda x: x['pos'])
            
        # Weather modifications
        weather = getattr(self, 'weather', 'clear')
        if weather == 'rain':
            g_idm_a, g_idm_s0, g_max_speed = 1.0, 8.0, 0.7
        elif weather == 'storm':
            g_idm_a, g_idm_s0, g_max_speed = 0.6, 12.0, 0.4
        else:
            g_idm_a, g_idm_s0, g_max_speed = 2.0, 4.0, 1.0
            
        # 4. Move vehicles with IDM + Stop-at-Red
        # IDM Parameters
        IDM_A = 2.0     # max acceleration (m/s^2)
        IDM_B = 3.0     # comfortable deceleration (m/s^2)
        IDM_S0 = 4.0    # minimum gap (m)
        IDM_T = 1.0     # safe time headway (s)
        
        active_vehicles = []
        for v in self.vehicles:
            u, dest_node = v['from'], v['to']
            desired_speed = v['max_speed'] * g_max_speed
            
            # --- Signal check & Complex Road Rules ---
            stopped_by_signal = False
            if dest_node in active_peds:
                # Pedestrian crossing forces all-red stop at node
                dist_to_stop = v['edge_length'] - v['pos']
                if dist_to_stop < 15:
                    stopped_by_signal = True
            elif dest_node in self.signals:
                dist_to_stop = v['edge_length'] - v['pos']
                if dist_to_stop < 15:
                    incoming_dir = self._get_direction(u, dest_node)
                    if incoming_dir not in self.signals[dest_node]['green_dirs']:
                        stopped_by_signal = True
                        
                        # Hybrid Right-Turn-On-Red
                        if v['path_idx'] + 1 < len(v['path']):
                            next_next_node = v['path'][v['path_idx'] + 1]
                            du1 = self.graph.nodes[dest_node]['x'] - self.graph.nodes[u]['x']
                            dv1 = self.graph.nodes[dest_node]['y'] - self.graph.nodes[u]['y']
                            du2 = self.graph.nodes[next_next_node]['x'] - self.graph.nodes[dest_node]['x']
                            dv2 = self.graph.nodes[next_next_node]['y'] - self.graph.nodes[dest_node]['y']
                            
                            angle1 = math.degrees(math.atan2(dv1, du1 * math.cos(math.radians(self.graph.nodes[dest_node]['y']))))
                            angle2 = math.degrees(math.atan2(dv2, du2 * math.cos(math.radians(self.graph.nodes[next_next_node]['y']))))
                            diff = (angle2 - angle1) % 360
                            
                            if 200 < diff < 340: # Right turn geometrical proxy
                                stopped_by_signal = False
                                desired_speed = min(desired_speed, 2.0) # Crawl speed
            
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
                leader_gap = leader['pos'] - v['pos'] - leader.get('v_length', 5.0)
                leader_speed = leader['speed']
                if leader_gap < 0: leader_gap = 0.1
                
            # Virtual leader for incidents
            if edge_key in self.incidents:
                accident_pos = self.incidents[edge_key]
                if v['pos'] < accident_pos:
                    accident_gap = accident_pos - v['pos'] - 3.0
                    if accident_gap < leader_gap:
                        leader_gap = max(accident_gap, 0.1)
                        leader_speed = 0.0
            
            # Virtual leader for red light
            if stopped_by_signal:
                signal_gap = v['edge_length'] - v['pos'] - 2.0  # stop 2m before line
                if signal_gap < leader_gap:
                    leader_gap = max(signal_gap, 0.1)
                    leader_speed = 0.0
            
            # --- IDM acceleration ---
            speed = v['speed']
            delta_v = speed - leader_speed
            
            IDM_A = g_idm_a * v.get('accel_mult', 1.0)
            
            s_star = g_idm_s0 + max(0, speed * IDM_T + (speed * delta_v) / (2 * math.sqrt(IDM_A * IDM_B)))
            
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
            if v['pos'] >= v['edge_length']:
                v['path_idx'] += 1
                if v['path_idx'] + 1 < len(v['path']):
                    next_u = v['path'][v['path_idx']]
                    next_v = v['path'][v['path_idx'] + 1]
                    try:
                        edge_data = self.graph[next_u][next_v][0]
                        v['from'] = next_u
                        v['to'] = next_v
                        v['pos'] = 0
                        v['edge_length'] = edge_data.get('length', 10)
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
                    "lon": next(n['lon'] for n in self.nodes if n['id'] == sid),
                    "q_values": s.get('q_values', [0, 0]),
                    "is_overridden": sid in self.overrides or getattr(self, 'evp_overrides', {}).get(sid) is not None,
                    "is_evp": s.get('is_evp', False)
                } for sid, s in self.signals.items()
            ],
            "vehicles": [
                {
                    "id": v['id'],
                    "type": v['type'],
                    "from": int(v['from']),
                    "to": int(v['to']),
                    "pos": float(v['pos']),
                    "edge_length": float(v['edge_length']),
                    "speed": round(float(v['speed']), 1)
                } for v in self.vehicles
            ],
            "edge_congestion": edge_congestion,
            "weather": self.weather,
            "incidents": [{"from": u, "to": v, "pos": p} for (u, v), p in self.incidents.items()],
            "pedestrians": [int(n) for n in self.pedestrian_events.keys()],
            "evp_routes": getattr(self, 'evp_routes', []),
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

@app.get("/api/metrics/history")
async def get_metrics_history():
    """Fetch the latest historical metric points for UI charting."""
    return database.get_historical_metrics(limit=100)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    async def listen():
        try:
            while True:
                data = await websocket.receive_text()
                msg = json.loads(data)
                if msg.get("type") == "OVERRIDE":
                    nid = msg.get("node_id")
                    act = msg.get("action")
                    if act is None or act == -1:
                        sim_manager.overrides.pop(nid, None)
                    else:
                        sim_manager.overrides[nid] = act
                elif msg.get("type") == "WEATHER":
                    sim_manager.weather = msg.get("condition", "clear")
                elif msg.get("type") == "ADD_INCIDENT":
                    # Add accident halfway down the edge
                    u, v = msg.get("from"), msg.get("to")
                    path_len = map_engine.get_graph()[u][v][0].get('length', 50)
                    sim_manager.incidents[(u, v)] = path_len / 2
                elif msg.get("type") == "CLEAR_INCIDENTS":
                    sim_manager.incidents.clear()
                elif msg.get("type") == "TOGGLE_RANDOM_INCIDENTS":
                    edges = list(map_engine.get_graph().edges())
                    for _ in range(5):
                        try:
                            u, v = random.choice(edges)
                            path_len = map_engine.get_graph()[u][v][0].get('length', 50)
                            sim_manager.incidents[(u, v)] = path_len / 2
                        except (IndexError, KeyError):
                            pass
        except Exception as e:
            pass
            
    loop = asyncio.get_event_loop()
    loop.create_task(listen())
    
    try:
        print("[Server] WebSocket Connection Established.")
        while True:
            # Multi-step update if Training Mode is on
            steps_per_broadcast = config.SPEED_MULTIPLIER if not config.TRAINING_MODE else 10
            
            for _ in range(steps_per_broadcast):
                frame = sim_manager.tick()
                
                # Check for persistence save / Federated Averaging
                if sim_manager.step_count % config.MODEL_SAVE_FREQ == 0:
                    # Federated Averaging across 4 regional nodes
                    sd_list = [agent.model.state_dict() for agent in sim_manager.regional_agents.values()]
                    avg_sd = {}
                    for key in sd_list[0].keys():
                        avg_sd[key] = sum([sd[key] for sd in sd_list]) / len(sd_list)
                    
                    for name, agent in sim_manager.regional_agents.items():
                        agent.model.load_state_dict(avg_sd)
                        agent.update_target_model()
                        agent.save_weights(os.path.join(config.MODEL_DIR, f"dqn_regional_{name}.pth"))
            
            # Log metrics to DB before broadcasting
            metrics_data = frame.get("metrics")
            if metrics_data:
                database.insert_metric(
                    step=metrics_data["step"],
                    active_vehicles=metrics_data["active_vehicles"],
                    stopped_vehicles=metrics_data["stopped_vehicles"],
                    avg_speed=metrics_data["avg_speed"],
                    total_waiting_time=metrics_data["total_waiting_time"]
                )
            
            # 2. Broadcast frame to UI
            await websocket.send_text(json.dumps(frame))
            
            # 3. Dynamic sleep based on mode
            if config.TRAINING_MODE:
                await asyncio.sleep(0.001) # Near 0 delay for training
            else:
                await asyncio.sleep(0.05 / config.SPEED_MULTIPLIER) # Real-time ish
    except WebSocketDisconnect:
        print("[Server] Connection Dropped.")
    except Exception as e:
        print(f"[Server] WS Error: {e}")

if __name__ == "__main__":
    print("Starting OptiFlow Real-World Engine on ws://localhost:8000")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
