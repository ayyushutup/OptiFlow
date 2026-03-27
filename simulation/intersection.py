import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from traffic_signal import TrafficSignal  # pyre-ignore[21]
from road import Lane  # pyre-ignore[21]

class Intersection:
    def __init__(self, intersection_id, position):
        self.id = intersection_id
        self.position = position  # (row, col)
        
        # Initialize the traffic signal for this intersection
        self.signal = TrafficSignal()
        
        # Lanes where vehicles wait BEFORE entering the intersection
        self.incoming_lanes = {
            "N": Lane("N"),
            "S": Lane("S"),
            "E": Lane("E"),
            "W": Lane("W")
        }
        
        # Roads leaving this intersection
        self.outgoing_roads = {
            "N": None,
            "S": None,
            "E": None,
            "W": None
        }

    def set_outgoing_road(self, direction, road):
        """Connects a road that leaves this intersection in the given direction"""
        self.outgoing_roads[direction] = road

    def add_vehicle_to_queue(self, vehicle, direction):
        """Vehicle arrives at intersection from `direction` and enters queue"""
        return self.incoming_lanes[direction].add_vehicle(vehicle)

    def tick(self, rl_action=None):
        """
        Move time forward:
        1. Tick the traffic signal (or process RL action)
        2. Process green lanes and move vehicles through
        """
        # Update signal phase
        if rl_action is not None:
            self.signal.process_action(rl_action)
        else:
            self.signal.tick()
        
        # Find who has a green light right now
        green_dirs = self.signal.get_green_directions()
        
        # Process lanes that have a green light
        for direction in green_dirs:
            if direction == "NS":
                self._process_lane("N", "S") # N lane goes to S road (straight through)
                self._process_lane("S", "N") # S lane goes to N road
            elif direction == "EW":
                self._process_lane("E", "W") # E lane goes to W road
                self._process_lane("W", "E") # W lane goes to E road

        # Increase waiting time for all vehicles still stuck in any queue
        for lane in self.incoming_lanes.values():
            for vehicle in lane.queue:
                vehicle.wait()

    def _process_lane(self, incoming_dir, default_outgoing_dir):
        """
        Moves one vehicle from the incoming lane to an outgoing road
        Note: Currently assumes vehicles go straight. We can add turning logic later.
        """
        lane = self.incoming_lanes[incoming_dir]
        outgoing_road = self.outgoing_roads[default_outgoing_dir]
        
        if lane.get_queue_length() > 0 and outgoing_road is not None:
            # Pop vehicle from front of line
            vehicle = lane.remove_vehicle()
            if vehicle:
                # Add it to the outgoing road
                outgoing_road.add_vehicle(vehicle)

    def get_queue_lengths(self):
        """Returns the number of waiting vehicles in each lane"""
        return {
            "N": self.incoming_lanes["N"].get_queue_length(),
            "S": self.incoming_lanes["S"].get_queue_length(),
            "E": self.incoming_lanes["E"].get_queue_length(),
            "W": self.incoming_lanes["W"].get_queue_length()
        }

    def get_total_waiting_time(self):
        """Sum of waiting time for all currently queued vehicles across all lanes"""
        total = 0
        for lane in self.incoming_lanes.values():
            total += sum(v.waiting_time for v in lane.queue)
        return total

    def __repr__(self):
        queues = [f"{d}:{l.get_queue_length()}" for d, l in self.incoming_lanes.items()]
        return f"Intersection(id={self.id}, pos={self.position}, phase={self.signal.current_phase}, queues=[{', '.join(queues)}])"


if __name__ == "__main__":
    from vehicle import Vehicle  # pyre-ignore[21]
    from road import Road  # pyre-ignore[21]
    
    print("=== Intersection Test ===")
    i1 = Intersection("A", (0,0))
    
    # Setup a fake outgoing road to the South
    south_road = Road()
    i1.set_outgoing_road("S", south_road)
    
    # Add cars coming from the North (heading South)
    v1 = Vehicle(1)
    v2 = Vehicle(2)
    i1.add_vehicle_to_queue(v1, "N")
    i1.add_vehicle_to_queue(v2, "N")
    
    print(f"Initial: {i1}")
    print(f"South Road vehicles: {len(south_road.vehicles)}")
    
    # Tick simulation until signal turns green for NS
    for step in range(15):
        print(f"\\nTick {step+1}:")
        i1.tick()
        print(f"Signal state: {i1.signal}")
        print(f"Queues: {i1.get_queue_lengths()}")
        print(f"South Road vehicles: {len(south_road.vehicles)}")
        
        if len(south_road.vehicles) == 2:
            print("Both vehicles made it through the intersection!")
            break
