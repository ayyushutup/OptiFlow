import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import numpy

import config
from simulation.sim_runner import SimRunner
from agents.coordination import CoordinationManager  # pyre-ignore[21]

class TrafficEnv:
    def __init__(self):
        self.sim = SimRunner()
        self.grid = self.sim.grid
        self.coordinator = CoordinationManager(self.grid)
        self.agent_intersections = self.grid.get_intersections()

    def reset(self):
        """Resets the environment for a new training episode."""
        self.sim = SimRunner()
        self.grid = self.sim.grid
        self.coordinator = CoordinationManager(self.grid)
        self.agent_intersections = self.grid.get_intersections()
        
        return {inter.id: self._get_state(inter) for inter in self.agent_intersections}

    def step(self, actions_dict):
        """Takes a step in the simulation using the agents' actions."""
        self.sim.step_count += 1
        
        self.sim.spawn_vehicles()
        
        # Tick intersections. Apply the RL action to the specified intersection
        for inter in self.grid.get_intersections():
            if inter.id in actions_dict:
                inter.tick(rl_action=actions_dict[inter.id])
            else:
                inter.tick()
                
        self.sim.move_vehicles_on_roads()
        self.sim.collect_metrics()

        # Gather feedback for the agents
        next_states = {}
        rewards = {}
        
        for inter in self.agent_intersections:
            next_states[inter.id] = self._get_state(inter)
            rewards[inter.id] = self._get_reward(inter)
            
        done = self.sim.step_count >= config.SIM_STEPS
        
        return next_states, rewards, done

    def _get_state(self, intersection):
        """Translates real simulation measurements into a normalized tensor state for the DQN."""
        q = intersection.get_queue_lengths()
        neighbor_load = self.coordinator.get_neighbor_load(intersection)
        
        cap = float(config.LANE_CAPACITY)
        state = [
            min(q["N"], cap) / cap,
            min(q["S"], cap) / cap,
            min(q["E"], cap) / cap,
            min(q["W"], cap) / cap,
            float(intersection.signal.current_phase),
            float(intersection.signal.is_yellow),
            min(neighbor_load, 15.0) / 15.0
        ]
        import numpy as np
        return np.array(state, dtype=np.float32)

    def _get_reward(self, intersection):
        """Calculates the penalty based on traffic conditions."""
        wait_time = intersection.get_total_waiting_time()
        queues = intersection.get_queue_lengths()
        total_q = sum(queues.values())
        
        # Heavy penalty for standing queues and total wait times
        reward = - (0.5 * wait_time) - (1.0 * total_q)
        return reward