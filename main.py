import sys
import os

# Ensure simulation module can be imported
sys.path.append(os.path.join(os.path.dirname(__file__), 'simulation'))

import config
from simulation.sim_runner import SimRunner

def main():
    print("="*50)
    print(f"OptiFlow Traffic Simulation - Phase 1 (No RL)")
    print("="*50)
    print(f"Grid Size: {config.GRID_ROWS}x{config.GRID_COLS}")
    print(f"Steps to Run: {config.SIM_STEPS}")
    print(f"Vehicle Spawn Rate: {config.VEHICLE_SPAWN_RATE}")
    print("-"*50)

    runner = SimRunner()
    runner.run()

    print("-"*50)
    print("Simulation Complete!")
    if runner.metrics:
        final = runner.metrics[-1]
        print(f"Final State: Active={final['active_vehicles']}, " \
              f"Queued={final['total_queued']}, " \
              f"Waiting Time={final['total_waiting_time']}")

if __name__ == "__main__":
    main()
