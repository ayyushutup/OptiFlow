import numpy as np
import math

class RealTrafficEnv:
    """
    State and Action mapping for Real-World OSM signals with GCN support.
    Groups incoming edges into 4 compass bins and tracks neighboring signal nodes.
    """
    def __init__(self, graph):
        self.graph = graph
        self.signal_configs = {}
        self.MAX_NEIGHBORS = 5 # Fixed size for GCN subgraph batching

    def register_signal(self, node_id):
        """Analyze incoming edges for orientation and find neighboring signal nodes."""
        u_data = self.graph.nodes[node_id]
        u_lat, u_lon = u_data['y'], u_data['x']
        
        incoming = list(self.graph.in_edges(node_id, data=True))
        bins = {'N': [], 'S': [], 'E': [], 'W': []}
        neighbors = []
        
        for v, u, data in incoming:
            v_data = self.graph.nodes[v]
            v_lat, v_lon = v_data['y'], v_data['x']
            
            # Compass grouping
            dy = u_lat - v_lat
            dx = (u_lon - v_lon) * math.cos(math.radians(u_lat))
            angle = math.degrees(math.atan2(dy, dx))
            
            if -45 <= angle <= 45: bins['E'].append((v, u))
            elif 45 < angle <= 135: bins['N'].append((v, u))
            elif -135 <= angle < -45: bins['S'].append((v, u))
            else: bins['W'].append((v, u))
            
            # Neighbor signal discovery
            # If the source node v is also a signal (or we can go further back)
            if v_data.get('is_signal'):
                neighbors.append(v)
            
        self.signal_configs[node_id] = {
            'bins': bins,
            'neighbors': list(set(neighbors))[:self.MAX_NEIGHBORS]
        }

    def _get_node_features(self, node_id, vehicles):
        """Calculates 8D feature vector for a single intersection."""
        if node_id not in self.signal_configs:
            self.register_signal(node_id)
            
        bins = self.signal_configs[node_id]['bins']
        state_local = []
        state_upstream = []
        
        for direction in ['N', 'S', 'E', 'W']:
            count_local = 0
            count_upstream = 0
            edges = bins[direction]
            for v, u in edges:
                for veh in vehicles:
                    if veh['from'] == v and veh['to'] == u:
                        edge_len = veh.get('edge_length', 10)
                        dist_to_intersection = edge_len - veh['pos']
                        if dist_to_intersection < 30:
                            count_local += 1
                        elif dist_to_intersection < 150:
                            count_upstream += 1
            state_local.append(count_local)
            state_upstream.append(count_upstream)
            
        features = state_local + state_upstream
        return np.clip(np.array(features, dtype=np.float32) / 10.0, 0, 1.0)

    def get_state(self, node_id, vehicles):
        """
        Returns a tuple (feature_matrix, adjacency_matrix) for the node's local subgraph.
        X: [N, F], A: [N, N] where N = MAX_NEIGHBORS + 1
        The target node is always at index 0.
        """
        if node_id not in self.signal_configs:
            self.register_signal(node_id)
            
        conf = self.signal_configs[node_id]
        neighbors = conf['neighbors']
        num_active = len(neighbors) + 1
        total_nodes = self.MAX_NEIGHBORS + 1
        
        # Initialize matrices
        X = np.zeros((total_nodes, 8), dtype=np.float32)
        A = np.zeros((total_nodes, total_nodes), dtype=np.float32)
        
        # Self-loops for GCN (A_hat)
        for i in range(total_nodes):
            A[i, i] = 1.0
            
        # 1. Fill central node features
        X[0] = self._get_node_features(node_id, vehicles)
        
        # 2. Fill neighbor features and adjacency
        for i, n_id in enumerate(neighbors):
            idx = i + 1
            X[idx] = self._get_node_features(n_id, vehicles)
            # Add edge from neighbor to center (spatial dependency)
            A[idx, 0] = 1.0
            A[0, idx] = 0.5 # Weaker reverse impact
            
        return (X, A)

    def get_reward(self, node_id, vehicles):
        """Negative congestion penalty including emergency preemption impact."""
        if node_id not in self.signal_configs:
            self.register_signal(node_id)
            
        bins = self.signal_configs[node_id]['bins']
        total_waiting_time = 0
        queue_penalty = 0
        emergency_waiting = False
        
        for direction in ['N', 'S', 'E', 'W']:
            count = 0
            dir_wait = 0
            edges = bins[direction]
            for v, u in edges:
                for veh in vehicles:
                    edge_len = veh.get('edge_length', 10)
                    if veh['from'] == v and veh['to'] == u and (edge_len - veh['pos']) < 30:
                        count += 1
                        dir_wait += veh.get('waiting_time', 0)
                        if veh.get('type') == 'emergency' and veh.get('speed', 20) < 0.5:
                            emergency_waiting = True
            
            queue_penalty += count ** 2
            total_waiting_time += dir_wait

        reward = -(queue_penalty + (total_waiting_time * 0.5))
        if emergency_waiting:
            reward *= 100.0  
            
        return float(reward)

    def get_green_dirs(self, node_id, action):
        """Maps action to compass directions. 0: N-S, 1: E-W"""
        return ['N', 'S'] if action == 0 else ['E', 'W']
