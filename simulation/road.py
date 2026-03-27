import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import config  # pyre-ignore[21]
from collections import deque

class Lane:
    def __init__(self, direction):
        self.direction = direction
        self.capacity = config.LANE_CAPACITY
        self.queue = deque()

    def add_vehicle(self, vehicle):
        if len(self.queue) < self.capacity:
            self.queue.append(vehicle)
            return True
        return False



    def remove_vehicle(self):
        """
        Remove vehicle from front of queue (FIFO).
        """
        if self.queue:
            return self.queue.popleft()
        return None

    def get_queue_length(self):
        return len(self.queue)

    def is_full(self):
        return len(self.queue) >= self.capacity

    def __repr__(self):
        return f"Lane(dir={self.direction}, queue={len(self.queue)}/{self.capacity})"


class Road:
    def __init__(self, length=None):
        self.from_intersection = None
        self.to_intersection = None
        self.length = length or config.ROAD_LENGTH
        self.vehicles = []

    def add_vehicle(self, vehicle):
        """
        Put vehicle at start of road.
        """
        vehicle.position = 0
        vehicle.current_road = self
        self.vehicles.append(vehicle)

    def remove_vehicle(self, vehicle):
        """
        Remove vehicle from road.
        """
        if vehicle in self.vehicles:
            self.vehicles.remove(vehicle)

    def __repr__(self):
        return f"Road(vehicles={len(self.vehicles)}, length={self.length})"


if __name__ == "__main__":
    from vehicle import Vehicle  # pyre-ignore[21]

    # --- Test Lane ---
    print("=== Lane Test ===")
    lane = Lane("north")
    v1 = Vehicle(1)
    v2 = Vehicle(2)
    v3 = Vehicle(3)

    lane.add_vehicle(v1)
    lane.add_vehicle(v2)
    lane.add_vehicle(v3)
    print(lane)                          # queue=3/10
    print(f"Queue length: {lane.get_queue_length()}")
    print(f"Is full: {lane.is_full()}")

    removed = lane.remove_vehicle()
    print(f"Removed: {removed}")         # should be v1 (FIFO)
    print(lane)                          # queue=2/10

    # --- Test Road ---
    print("\n=== Road Test ===")
    road = Road()
    print(road)                          # vehicles=0, length=5

    road.add_vehicle(v2)
    road.add_vehicle(v3)
    print(road)                          # vehicles=2
    print(f"v2 position: {v2.position}, on road: {v2.current_road}")

    road.remove_vehicle(v2)
    print(road)                          # vehicles=1
    print("All tests passed!")                  