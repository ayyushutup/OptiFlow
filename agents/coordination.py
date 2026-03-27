import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

class CoordinationManager:
    def __init__(self, grid):
        self.grid = grid
        
    def get_neighbor_load(self, intersection):
        """
        Calculates the average queue length of all immediate neighbors.
        This allows the agent to anticipate incoming traffic from neighboring intersections.
        """
        total_queue = 0
        neighbor_count = 0
        
        # Check all outgoing roads from this intersection to find neighbors
        for direction, road in intersection.outgoing_roads.items():
            if road is not None and road.to_intersection is not None:  # pyre-ignore[16]
                neighbor = road.to_intersection
                
                # Sum the queues of the neighbor
                queues = neighbor.get_queue_lengths()
                total_queue += sum(queues.values())
                neighbor_count += 1
                
        if neighbor_count == 0:
            return 0
            
        return total_queue // neighbor_count
