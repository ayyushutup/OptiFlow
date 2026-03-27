import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import config
from intersection import Intersection
from road import Road

class CityGrid:
    def __init__(self):
        self.rows = config.GRID_ROWS
        self.cols = config.GRID_COLS
        self.intersections = {}  # Map (row, col) -> Intersection
        self.roads = []          # List of all roads
        
        self._build_grid()

    def _build_grid(self):
        """
        Builds the grid of intersections and connects them with roads.
        """
        # 1. Create all intersections
        intersection_id = 0
        for r in range(self.rows):
            for c in range(self.cols):
                self.intersections[(r, c)] = Intersection(intersection_id, (r, c))
                intersection_id += 1

        # 2. Connect intersections with roads
        # We need a road in both directions between adjacent intersections
        for r in range(self.rows):
            for c in range(self.cols):
                current = self.intersections[(r, c)]

                # Check Right neighbor (East)
                if c < self.cols - 1:
                    east_neighbor = self.intersections[(r, c+1)]
                    
                    # Create Road: Current -> East Neighbor
                    road_to_east = Road()
                    road_to_east.from_intersection = current
                    road_to_east.to_intersection = east_neighbor
                    current.set_outgoing_road("E", road_to_east)
                    self.roads.append(road_to_east)
                    
                    # Create Road: East Neighbor -> Current
                    road_to_west = Road()
                    road_to_west.from_intersection = east_neighbor
                    road_to_west.to_intersection = current
                    east_neighbor.set_outgoing_road("W", road_to_west)
                    self.roads.append(road_to_west)

                # Check Bottom neighbor (South)
                if r < self.rows - 1:
                    south_neighbor = self.intersections[(r+1, c)]
                    
                    # Create Road: Current -> South Neighbor
                    road_to_south = Road()
                    road_to_south.from_intersection = current
                    road_to_south.to_intersection = south_neighbor
                    current.set_outgoing_road("S", road_to_south)
                    self.roads.append(road_to_south)
                    
                    # Create Road: South Neighbor -> Current
                    road_to_north = Road()
                    road_to_north.from_intersection = south_neighbor
                    road_to_north.to_intersection = current
                    south_neighbor.set_outgoing_road("N", road_to_north)
                    self.roads.append(road_to_north)

    def get_intersections(self):
        """Return list of all intersections"""
        return list(self.intersections.values())

    def __repr__(self):
        return f"CityGrid({self.rows}x{self.cols}, Intersections: {len(self.intersections)}, Roads: {len(self.roads)})"


if __name__ == "__main__":
    print("=== City Grid Test ===")
    grid = CityGrid()
    print(grid)
    
    print("\\nIntersections:")
    for pos, inter in grid.intersections.items():
        print(f"  {pos}: {inter}")
        
    print("\\nRoads:")
    for road in grid.roads:
        frm = road.from_intersection.id if road.from_intersection else "Edge"
        to = road.to_intersection.id if road.to_intersection else "Edge"
        print(f"  Intersection {frm} -> Intersection {to}")
