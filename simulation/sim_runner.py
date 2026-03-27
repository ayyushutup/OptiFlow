import sys
import os
import random
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import config
from city_grid import CityGrid
from vehicle import Vehicle

import json

class SimRunner:
    def __init__(self):
        self.grid = CityGrid()
        self.step_count = 0
        self.total_vehicles_spawned = 0
        self.active_vehicles = []
        self.metrics = []

    def spawn_vehicles(self):
        """Randomly spawns vehicles at the edges of the grid based on spawn rate"""
        if random.random() < config.VEHICLE_SPAWN_RATE:
            # Pick a random intersection to spawn a vehicle
            intersections = self.grid.get_intersections()
            if not intersections: return
            
            spawn_node = random.choice(intersections)
            
            # Pick a random incoming direction to spawn it
            direction = random.choice(["N", "S", "E", "W"])
            
            v = Vehicle(self.total_vehicles_spawned)
            self.total_vehicles_spawned += 1
            
            success = spawn_node.add_vehicle_to_queue(v, direction)
            if success:
                self.active_vehicles.append(v)
            else:
                pass # Lane was full, vehicle was rejected (dropped)

    def move_vehicles_on_roads(self):
        """
        Moves vehicles along roads. If they reach the end of the road, 
        they enter the queue of the next intersection. If there is no next 
        intersection (edge of grid), they exit the simulation.
        """
        vehicles_to_remove = []
        
        for road in self.grid.roads:
            for vehicle in list(road.vehicles):
                # Move vehicle forward
                vehicle.move()
                
                # Check if reached end of road
                if vehicle.position >= road.length:
                    # Remove from road
                    road.remove_vehicle(vehicle)
                    
                    if road.to_intersection is None:
                        # Exited the city grid
                        vehicles_to_remove.append(vehicle)
                    else:
                        # Arrived at next intersection
                        # Determine direction it arrived from based on road setup
                        # Since we built roads E <-> W and N <-> S:
                        direction = None
                        from_i = road.from_intersection
                        to_i = road.to_intersection
                        
                        if from_i.position[0] < to_i.position[0]: direction = "N" # Came from North
                        elif from_i.position[0] > to_i.position[0]: direction = "S" # Came from South
                        elif from_i.position[1] < to_i.position[1]: direction = "W" # Came from West
                        elif from_i.position[1] > to_i.position[1]: direction = "E" # Came from East
                        
                        if direction:
                            success = to_i.add_vehicle_to_queue(vehicle, direction)
                            if not success:
                                # Lane full, dropped
                                vehicles_to_remove.append(vehicle)

        # Cleanup vehicles that exited
        for v in vehicles_to_remove:
            if v in self.active_vehicles:
                self.active_vehicles.remove(v)

    def step(self):
        """Run one full step of the simulation"""
        self.step_count += 1
        
        # 1. Spawn new vehicles
        self.spawn_vehicles()
        
        # 2. Tick all intersections (updates signals, moves cars from queues -> roads)
        for intersection in self.grid.get_intersections():
            intersection.tick()
            
        # 3. Move vehicles already on roads
        self.move_vehicles_on_roads()
        
        # 4. Collect metrics
        self.collect_metrics()

    def collect_metrics(self):
        """Gather stats for this timestep"""
        total_waiting = 0
        total_queued = 0
        
        for intersection in self.grid.get_intersections():
            total_waiting += intersection.get_total_waiting_time()
            queues = intersection.get_queue_lengths()
            total_queued += sum(queues.values())

        metrics = {
            "step": self.step_count,
            "active_vehicles": len(self.active_vehicles),
            "total_queued": total_queued,
            "total_waiting_time": total_waiting
        }
        self.metrics.append(metrics)
        return metrics

    def run(self, steps=None):
        """Run simulation for specified number of steps"""
        run_steps = steps or config.SIM_STEPS
        print(f"Starting simulation for {run_steps} steps...")
        
        for _ in range(run_steps):
            self.step()
            latest_metrics = self.metrics[-1]
            print(f"Step {latest_metrics['step']}: " \
                  f"Active Vehicles={latest_metrics['active_vehicles']}, " \
                  f"Queued={latest_metrics['total_queued']}, " \
                  f"Total Waiting Time={latest_metrics['total_waiting_time']}")

if __name__ == "__main__":
    runner = SimRunner()
    runner.run(15)
