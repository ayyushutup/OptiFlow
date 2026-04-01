import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'simulation'))

import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
import config
from agents.traffic_env import TrafficEnv
from agents.dqn_agent import DQNAgent
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="OptiFlow PyTorch WebSocket Controller")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SimulationManager:
    def __init__(self):
        self.env = TrafficEnv()
        self.states = self.env.reset()
        
        state_size = len(list(self.states.values())[0])
        action_size = getattr(config, 'NUM_PHASES', 2)
        
        self.agents = {}
        for inter in self.env.agent_intersections:
            # We instantiate standard evaluation agents
            agent = DQNAgent(state_size, action_size)
            # Freeze exploration since we just want to watch them perform
            agent.epsilon = 0.0  
            self.agents[inter.id] = agent
            
    def tick(self):
        actions = {}
        for agent_id, agent in self.agents.items():
            actions[agent_id] = agent.choose_action(self.states[agent_id], evaluate=True)
            
        next_states, rewards, done = self.env.step(actions)
        self.states = next_states
        
        return self._serialize_state()

    def _serialize_state(self):
        """Massages the complex Python OOP models into a lightweight JSON schema for React"""
        intersections = []
        for (r,c), inter in self.env.grid.intersections.items():
            intersections.append({
                "id": inter.id,
                "r": r, "c": c,
                "is_yellow": inter.signal.is_yellow,
                "green_dirs": inter.signal.get_green_directions()
            })
            
        vehicles = []
        for road in self.env.grid.roads:
            from_id = road.from_intersection.id if road.from_intersection else None
            to_id = road.to_intersection.id if road.to_intersection else None
            for v in road.vehicles:
                vehicles.append({
                    "id": id(v),
                    "pos": v.position,
                    "length": config.ROAD_LENGTH,
                    "from": from_id,
                    "to": to_id
                })
        
        metrics = self.env.sim.metrics[-1] if self.env.sim.metrics else {}
        
        return {
            "intersections": intersections,
            "vehicles": vehicles,
            "metrics": metrics,
            "config": {
                "rows": config.GRID_ROWS,
                "cols": config.GRID_COLS
            }
        }

sim_manager = SimulationManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        print("React Frontend Connected!")
        while True:
            # Generate next simulation frame
            data = sim_manager.tick()
            
            # Broadcast the entire physics universe as JSON
            await websocket.send_text(json.dumps(data))
            
            # Target 20 FPS broadcast lock
            await asyncio.sleep(0.05) 
            
    except WebSocketDisconnect:
        print("Frontend Disconnected.")
    except Exception as e:
        print(f"WS Error: {e}")

if __name__ == "__main__":
    print("Starting OptiFlow Backend on ws://localhost:8000")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
