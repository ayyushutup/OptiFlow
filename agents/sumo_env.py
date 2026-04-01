import sys
import os
import traci
import traci.constants as tc
import numpy as np

import config

class MockIntersection:
    def __init__(self, tl_id):
        self.id = tl_id

class MockSim:
    def __init__(self):
        self.metrics = []
        self.step_count = 0

class SumoEnv:
    def __init__(self, use_gui=False):
        self.use_gui = use_gui
        self.sumo_cmd = [
            "sumo-gui" if use_gui else "sumo",
            "-c", "sumo_env/config.sumocfg",
            "--no-step-log", "true",
            "--no-warnings", "true"
        ]
        
        self.agent_intersections = [MockIntersection("A")]
        self.sim = MockSim()
        self.tl_id = "A"
        self._is_running = False
        
        # Map our logic directions to SUMO edge IDs we built
        # This will depend on the netconvert output, but based on our XML:
        # Incoming edges to A: N2A, S2A, E2A, W2A
        self.incoming_edges = {
            "N": "N2A",
            "S": "S2A",
            "E": "E2A",
            "W": "W2A"
        }
        
        # SUMO phases for a standard cross:
        # Phase 0: NS Green, EW Red
        # Phase 1: NS Yellow, EW Red
        # Phase 2: NS Red, EW Green
        # Phase 3: NS Red, EW Yellow
        self.current_phase_index = 0
        self.is_yellow = False

    def reset(self):
        """Resets the environment for a new training episode by restarting SUMO."""
        if self._is_running:
            traci.close()
            self._is_running = False
            
        traci.start(self.sumo_cmd)
        self._is_running = True
        self.sim.step_count = 0
        self.sim.metrics = []
        
        # Set initial phase
        self.current_phase_index = 0
        self.is_yellow = False
        traci.trafficlight.setPhase(self.tl_id, self.current_phase_index)
        
        return {inter.id: self._get_state(inter) for inter in self.agent_intersections}

    def step(self, actions_dict):
        """Takes a step in the simulation using the agents' actions."""
        # 1. Apply actions (simplified phase control)
        # Assuming action is 0 (NS Green) or 1 (EW Green)
        # config.NUM_PHASES = 2
        
        if self.tl_id in actions_dict:
            target_action = actions_dict[self.tl_id]  # 0 or 1
            target_phase_index = 0 if target_action == 0 else 2
            
            if self.current_phase_index != target_phase_index and not self.is_yellow:
                # Need to switch, so go yellow first
                self.current_phase_index = 1 if self.current_phase_index == 0 else 3
                self.is_yellow = True
                traci.trafficlight.setPhase(self.tl_id, self.current_phase_index)
            elif self.is_yellow:
                # Was yellow, now go to the target green
                # A proper implementation would use timers for yellow, but here we step
                # Let's assume yellow takes 1 step for now.
                self.current_phase_index = target_phase_index
                self.is_yellow = False
                traci.trafficlight.setPhase(self.tl_id, self.current_phase_index)
            else:
                # Keep current green
                traci.trafficlight.setPhase(self.tl_id, self.current_phase_index)

        # 2. Advance simulation
        traci.simulationStep()
        self.sim.step_count += 1
        
        # 3. Collect state and rewards
        next_states = {}
        rewards = {}
        
        total_wait = 0
        total_q = 0
        
        for inter in self.agent_intersections:
            next_states[inter.id] = self._get_state(inter)
            # Fetch reward components directly from TraCI
            wait, q = self._get_wait_and_queue()
            total_wait += wait
            total_q += q
            rewards[inter.id] = - (0.5 * wait) - (1.0 * q)
            
        # Update metrics for main.py baseline eval
        self.sim.metrics.append({
            "step": self.sim.step_count,
            "active_vehicles": traci.vehicle.getIDCount(),
            "total_queued": total_q,
            "total_waiting_time": total_wait
        })
            
        done = self.sim.step_count >= config.SIM_STEPS
        
        if done:
            traci.close()
            self._is_running = False
            
        return next_states, rewards, done

    def _get_wait_and_queue(self):
        """Calculates total wait time and queue lengths for the intersection"""
        total_wait = 0
        total_q = 0
        
        for name, edge_id in self.incoming_edges.items():
            # SUMO lanes are usually edge_id + "_0", "_1" etc
            # We defined numLanes="2"
            for lane_idx in range(2):
                lane_id = f"{edge_id}_{lane_idx}"
                total_q += traci.lane.getLastStepHaltingNumber(lane_id)
                total_wait += traci.lane.getWaitingTime(lane_id)
                
        return total_wait, total_q

    def _get_queue_lengths(self):
        """Returns dict of queue lengths by logic direction"""
        q = {"N": 0, "S": 0, "E": 0, "W": 0}
        for name, edge_id in self.incoming_edges.items():
            for lane_idx in range(2):
                lane_id = f"{edge_id}_{lane_idx}"
                q[name] += traci.lane.getLastStepHaltingNumber(lane_id)
        return q

    def _get_state(self, intersection):
        """Matches the state shape from TrafficEnv"""
        q = self._get_queue_lengths()
        
        cap = float(config.LANE_CAPACITY) * 2  # 2 lanes
        # Phase parsing: 0=NS Green, 1=Yellow, 2=EW Green, 3=Yellow
        phase_flag = 0.0 if self.current_phase_index in [0, 1] else 1.0
        yellow_flag = 1.0 if self.is_yellow else 0.0
        neighbor_load = 0.0  # Dummy for single intersection
        
        state = [
            min(q["N"], cap) / cap,
            min(q["S"], cap) / cap,
            min(q["E"], cap) / cap,
            min(q["W"], cap) / cap,
            phase_flag,
            yellow_flag,
            neighbor_load
        ]
        return np.array(state, dtype=np.float32)
