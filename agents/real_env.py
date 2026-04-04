import numpy as np
import math

class RealTrafficEnv:
    """
    State and Action mapping for Real-World OSM signals.
    Groups incoming edges into 4 compass bins: N, S, E, W.
    """
    def __init__(self, graph):
        self.graph = graph
        # Pre-calculate incoming edge directions for each signal node
        self.signal_configs = {}

    def register_signal(self, node_id):
        """Analyze incoming edges to determine their compass orientation."""
        # Get node coordinates
        u_data = self.graph.nodes[node_id]
        u_lat, u_lon = u_data['y'], u_data['x']
        
        # MultiDiGraph yields (v, u, data) for incoming edges to u
        incoming = list(self.graph.in_edges(node_id, data=True))
        bins = {'N': [], 'S': [], 'E': [], 'W': []}
        
        for v, u, data in incoming:
            v_data = self.graph.nodes[v]
            v_lat, v_lon = v_data['y'], v_data['x']
            
            # Calculate angle from v to u (incoming direction)
            # lat/lon to approx cartesian angle
            dy = u_lat - v_lat
            dx = (u_lon - v_lon) * math.cos(math.radians(u_lat))
            angle = math.degrees(math.atan2(dy, dx))
            
            # Group into bins based on incoming angle
            # 0 is East, 90 is North, 180/-180 is West, -90 is South
            if -45 <= angle <= 45: bins['E'].append((v, u))
            elif 45 < angle <= 135: bins['N'].append((v, u))
            elif -135 <= angle < -45: bins['S'].append((v, u))
            else: bins['W'].append((v, u)) # (-180 to -135) or (135 to 180)
            
        self.signal_configs[node_id] = bins

    def get_state(self, node_id, vehicles):
        """
        Returns a 4D vector of normalized queue lengths [N, S, E, W].
        Calculated by counting vehicles within 30m of the intersection on incoming edges.
        """
        if node_id not in self.signal_configs:
            self.register_signal(node_id)
            
        bins = self.signal_configs[node_id]
        state = []
        for direction in ['N', 'S', 'E', 'W']:
            count = 0
            edges = bins[direction]
            for v, u in edges:
                # Count vehicles currently on this edge and close to intersection
                count += sum(1 for veh in vehicles 
                             if veh['from'] == v and veh['to'] == u 
                             and (veh['length'] - veh['pos']) < 30) # within 30m
            state.append(count)
            
        # Normalize (clipping at 10 for state stability)
        return np.clip(np.array(state, dtype=np.float32) / 10.0, 0, 1.0)

    def get_reward(self, node_id, vehicles):
        """
        Negative congestion penalty.
        Uses sum of squares of queue lengths to heavily penalize large bottlenecks.
        """
        # Get raw counts (de-normalized)
        state = self.get_state(node_id, vehicles) * 10.0
        reward = -np.sum(np.square(state))
        return float(reward)

    def get_green_dirs(self, node_id, action):
        """
        Maps agent action to a list of compass directions that get Green light.
        Action 0: North-South
        Action 1: East-West
        """
        if action == 0:
            return ['N', 'S']
        else:
            return ['E', 'W']
