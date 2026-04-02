import osmnx as ox
import networkx as nx
import os
import json

class MapEngine:
    def __init__(self, location="Mumbai, India", dist=1500):
        self.location = location
        self.dist = dist
        self.graph = None
        self.cache_dir = "cache"
        os.makedirs(self.cache_dir, exist_ok=True)
        
    def fetch_map(self):
        """Fetches driveable road network from OpenStreetMap."""
        print(f"[MapEngine] Fetching road network for {self.location}...")
        try:
            # We fetch a driveable network from a central point
            # 19.0760, 72.8777 is Mumbai center roughly
            self.graph = ox.graph_from_point((19.0760, 72.8777), dist=self.dist, network_type='drive')
            print(f"[MapEngine] Successfully fetched {len(self.graph.nodes)} intersections and {len(self.graph.edges)} roads.")
            return True
        except Exception as e:
            print(f"[MapEngine] Error fetching map: {e}")
            return False

    def get_serializable_network(self):
        """Converts the NetworkX graph into a React-friendly JSON format."""
        if not self.graph:
            return None
            
        nodes_data = []
        for node_id, data in self.graph.nodes(data=True):
            nodes_data.append({
                "id": node_id,
                "lat": data.get('y'),
                "lon": data.get('x'),
                "is_signal": 'highway' in data and data['highway'] == 'traffic_signals'
            })
            
        edges_data = []
        for u, v, data in self.graph.edges(data=True):
            # Geometry contains the precise path points
            geometry = []
            if 'geometry' in data:
                # geometry is a shapely LineString
                coords = list(data['geometry'].coords)
                geometry = [[lat, lon] for lon, lat in coords]
            else:
                # Fallback to straight line between nodes
                u_data = self.graph.nodes[u]
                v_data = self.graph.nodes[v]
                geometry = [[u_data['y'], u_data['x']], [v_data['y'], v_data['x']]]
                
            edges_data.append({
                "from": u,
                "to": v,
                "length": data.get('length', 0),
                "lanes": data.get('lanes', 1),
                "maxspeed": data.get('maxspeed', 40),
                "path": geometry
            })
            
        return {
            "nodes": nodes_data,
            "edges": edges_data,
            "center": [19.0760, 72.8777]
        }

if __name__ == "__main__":
    engine = MapEngine()
    if engine.fetch_map():
        # Dry run
        network = engine.get_serializable_network()
        print(f"Network processing complete. {len(network['nodes'])} nodes serialized.")
