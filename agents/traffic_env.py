import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

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
        """Translates real simulation measurements into a simplified state for the Q-Table."""
        q = intersection.get_queue_lengths()
        neighbor_load = self.coordinator.get_neighbor_load(intersection)
        
        # We divide queue lengths by 3 to create "bins" (e.g. queue of 4 and 5 are both bin '1').
        # This keeps the Q-Table small enough to learn quickly.
        state = (
            min(q["N"], config.LANE_CAPACITY) // 3,
            min(q["S"], config.LANE_CAPACITY) // 3,
            min(q["E"], config.LANE_CAPACITY) // 3,
            min(q["W"], config.LANE_CAPACITY) // 3,
            intersection.signal.current_phase,
            min(neighbor_load, 15) // 3
        )
        return state

    def _get_reward(self, intersection):
        """Calculates the penalty based on traffic conditions."""
        wait_time = intersection.get_total_waiting_time()
        queues = intersection.get_queue_lengths()
        max_q = max(queues.values()) if queues.values() else 0
        
        # Negative reward pushes the agent to minimize waiting time and queue length
        reward = - (0.5 * wait_time) - (0.3 * max_q)
        return reward