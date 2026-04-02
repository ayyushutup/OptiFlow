import sys
import os
import asyncio
import json
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import config
from agents.map_engine import MapEngine

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

class RealSimManager:
    """Manages continuous traffic simulation on a real-world graph."""
    def __init__(self, network):
        self.network = network
        self.nodes = network['nodes']
        self.edges = network['edges']
        self.vehicles = []
        self.signals = {}
        self.step_count = 0
        
        # Initialize some signals (randomly for now)
        for node in self.nodes:
            if node['id'] % 3 == 0: # 33% intersections have signals
                self.signals[node['id']] = {
                    "state": "green",
                    "green_dirs": ["NS"], # Placeholder
                    "is_yellow": False,
                    "timer": 0
                }

    def spawn_vehicle(self):
        """Spawns a vehicle on a random edge."""
        edge = np.random.choice(self.edges)
        self.vehicles.append({
            "id": f"v_{len(self.vehicles)}_{np.random.randint(1000)}",
            "from": edge['from'],
            "to": edge['to'],
            "pos": 0,
            "length": edge['length'],
            "speed": np.random.uniform(5, 15) # m/s
        })

    def tick(self):
        """Simulation physics step."""
        self.step_count += 1
        
        # Spawn logic
        if np.random.rand() < 0.2 and len(self.vehicles) < 50:
            self.spawn_vehicle()
            
        # Move vehicles
        active_vehicles = []
        total_waiting_time = 0
        for v in self.vehicles:
            v['pos'] += v['speed'] * 0.1 # 0.1s steps for smoothness
            
            if v['pos'] >= v['length']:
                # Reached intersection - for now, just teleport to a new random edge
                # (In Phase 3 we'll use actual pathfinding)
                edge = np.random.choice(self.edges)
                v['from'] = edge['from']
                v['to'] = edge['to']
                v['pos'] = 0
                v['length'] = edge['length']
            
            active_vehicles.append(v)
            
        self.vehicles = active_vehicles
        
        return self._serialize()

    def _serialize(self):
        return {
            "intersections": [
                {
                    "id": sid, 
                    "green_dirs": s['green_dirs'], 
                    "is_yellow": s['is_yellow'],
                    "lat": next(n['lat'] for n in self.nodes if n['id'] == sid),
                    "lon": next(n['lon'] for n in self.nodes if n['id'] == sid)
                } for sid, s in self.signals.items()
            ],
            "vehicles": [
                {
                    "id": v['id'],
                    "from": v['from'],
                    "to": v['to'],
                    "pos": v['pos'],
                    "length": v['length']
                } for v in self.vehicles
            ],
            "metrics": {
                "step": self.step_count,
                "active_vehicles": len(self.vehicles),
                "total_queued": sum(1 for v in self.vehicles if v['pos'] < 2),
                "total_waiting_time": self.step_count * 0.5 # placeholder
            }
        }

sim_manager = RealSimManager(real_network)

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
