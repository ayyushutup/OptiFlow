# Multi-Agent RL Smart Traffic Optimization System — Implementation Plan

## Problem Statement

Build a modular, extensible traffic simulator where **each intersection is controlled by an independent Deep RL agent**. Agents observe local traffic state + neighbor info and learn to minimize waiting time, fuel consumption, and congestion across a real-world city network (OpenStreetMap).

---

## Evolution: [Phase 1-4] -> [Phase 11-12]

OptiFlow has evolved from a basic 2D grid prototype into a high-fidelity digital twin of urban infrastructure.

### Modern System Architecture

```mermaid
graph TD
    subgraph Simulation Engine (Python)
        OX[OSM Map Engine] --> LG[Leaflet Geometry]
        OX --> RG[Real Graph]
        RG --> SIM[RealSimManager]
        SIM --> IDM[IDM Physics]
        SIM --> MOB[MOBIL Lane Change]
        SIM --> RER[Dynamic Rerouting]
        SIM --> ENV[Weather/Peds Engine]
    end

    subgraph Intelligence (PyTorch)
        SIM --> DRL[Dueling DQN Agents]
        DRL --> PER[Prioritized Memory]
        DRL --> FED[Federated Learning]
        DRL-.->GCN[Graph Spatial RL]
    end

    subgraph Backend (FastAPI)
        SIM --> WS[WebSocket Server]
        SIM --> DB[SQLite Telemetry]
    end

    subgraph Visualization (React)
        WS --> DASH[Cyberpunk Dashboard]
        DASH --> 3D[3D Map Grid]
        DASH --> DASH_UI[Signal Overrides]
    end
```

---

## 🚀 Completed Phases

### Phase 1-4 — Foundations
Built discrete grid prototypes, tabular Q-learning, and basic PyGame visualization.

### Phase 5 — Real-World OSM Integration
- Integrated **OSMnx** to fetch actual road networks (Mumbai, India).
- Developed `MapEngine` to sanitize OSM data and convert it into driveable graphs.

### Phase 6 — Deep RL Upgrade (Dueling DQN)
- Shifted from Q-Tables to **Dueling Deep Q-Networks (DQN)**.
- Implemented **Prioritized Experience Replay (PER)** and Double DQN for stable training.

### Phase 7 — Regional Federated Learning
- Implemented asynchronous weight averaging across quadrants (NW, NE, SW, SE).
- Allows agents to learn from city-wide patterns without global synchronization bottlenecks.

### Phase 8 — Advanced Simulation Physics
- Replaced discrete moves with **Intelligent Driver Model (IDM)** for car-following.
- Added **MOBIL** lane-changing model for multi-lane dynamics.

### Phase 9 — Cyberpunk Visualization Dashboard
- Built a high-performance **React + Leaflet + Vite** frontend.
- Implemented **Real-time WebSockets** for low-latency telemetry streaming.
- **Cyber-Grid Aesthetics**: High-contrast, neon-themed 3D visualization.

### Phase 10 — Intelligent Routing
- Implemented **Dynamic Edge Weights** calculated from real-time density.
- Vehicles now perform **Dynamic Rerouting** using Dijkstra to avoid bottlenecks/accidents.

### Phase 11 — Advanced Environmental Dynamics
- **Multi-Vehicle Physics**: Integrated Car, Truck, Bus, and Emergency vehicle profiles with unique accel/length properties.
- **Weather Engine**: Dynamic transitions between Clear, Rain, and Storm, affecting IDM parameters (braking distance/max speed).
- **Pedestrian Logic**: Random "Pedestrian Crossing" events that trigger emergency stops at intersections.
- **Emergency Preemption (EVP)**: Automatic signal clearing for ambulances/fire trucks via path-projection overrides.

### Phase 12 — Graph Spatial RL [NEW]
- Integrated **Graph Convolutional Networks (GCN)** in pure PyTorch.
- Upgraded agents to **GraphDuelingDQN** to process city-wide topology.
- Implemented **Local Subgraph Observations** (node features + adjacency) in the environment.

---

## Current Project Structure

```
OptiFlow/
├── server.py             # FastAPI WebSocket Backend + RealSimManager
├── database.py           # SQLite persistence for metrics & replay
├── config.py             # Global constants & hyperparameters
├── agents/               # AI & Environment Logic
│   ├── map_engine.py     # OSM fetching & geometry serialization
│   ├── dqn_agent.py      # Graph Spatial RL (GCN + Dueling DQN)
│   ├── real_env.py       # Graph-structured observations (X, A matrices)
│   └── coordination.py   # Multi-agent utility functions
├── simulation/           # Legacy/Core Ops
│   └── vehicle.py        # Base Vehicle class (Logic migrated to server.py)
├── frontend/             # React Dashboard (Vite)
│   ├── src/
│   │   ├── Dashboard.jsx # Main Cyberpunk HUD & Map
│   │   └── Landing.jsx   # Project Entrance
│   └── public/
└── models/               # Saved Agent weights (.pth)
```

---

## 📈 Next Objectives (Upcoming)

| Phase | Objective | Description |
|---|---|---|
| **Phase 13** | **Emissions Analytics** | Calculate real-time CO2 and NOx output based on vehicle idling and "stop-and-go" cycles. |
| **Phase 14** | **Scenario Sandbox** | UI tools to manually spawn accidents, construction, or road closures to test AI resilience. |

---

## Verification Plan

### Automated System Check
```bash
# Start backend (Production/Real-World mode)
python server.py

# Start frontend
cd frontend && npm run dev
```

**KPI Targets**:
- **Congestion Reduction**: 20% improvement over fixed-timer baselines in Mumbai-OSM map.
- **Safety**: Zero collisions under normal weather conditions (IDM collision avoidance).
- **Scalability**: Support for 500+ active vehicles and 50+ signals on a standard laptop.
