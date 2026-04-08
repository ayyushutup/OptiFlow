import torch
import torch.nn as nn
import torch.optim as optim
import random
import os
import numpy as np
from collections import deque
import config

class SumTree:
    """A binary tree data structure where parent nodes are the sum of their children."""
    def __init__(self, capacity):
        self.capacity = capacity
        self.tree = np.zeros(2 * capacity - 1)
        self.data = np.zeros(capacity, dtype=object)
        self.n_entries = 0
        self.write = 0

    def _propagate(self, idx, change):
        parent = (idx - 1) // 2
        self.tree[parent] += change
        if parent != 0:
            self._propagate(parent, change)

    def _retrieve(self, idx, s):
        left = 2 * idx + 1
        right = left + 1
        if left >= len(self.tree):
            return idx
        if s <= self.tree[left]:
            return self._retrieve(left, s)
        else:
            return self._retrieve(right, s - self.tree[left])

    def total(self):
        return self.tree[0]

    def add(self, p, data):
        idx = self.write + self.capacity - 1
        self.data[self.write] = data
        self.update(idx, p)
        self.write = (self.write + 1) % self.capacity
        if self.n_entries < self.capacity:
            self.n_entries += 1

    def update(self, idx, p):
        change = p - self.tree[idx]
        self.tree[idx] = p
        self._propagate(idx, change)

    def get(self, s):
        idx = self._retrieve(0, s)
        data_idx = idx - self.capacity + 1
        return idx, self.tree[idx], self.data[data_idx]

class PrioritizedMemory:
    """Prioritized Experience Replay memory implementation."""
    def __init__(self, capacity):
        self.tree = SumTree(capacity)
        self.capacity = capacity
        self.e = config.PER_EPSILON
        self.a = config.PER_ALPHA
        self.beta = config.PER_BETA
        self.beta_increment = config.PER_BETA_INCREMENT

    def _get_priority(self, error):
        return (np.abs(error) + self.e) ** self.a

    def add(self, error, sample):
        p = self._get_priority(error)
        self.tree.add(p, sample)

    def sample(self, n):
        batch = []
        idxs = []
        segment = self.tree.total() / n
        priorities = []

        self.beta = np.min([1., self.beta + self.beta_increment])

        for i in range(n):
            a = segment * i
            b = segment * (i + 1)
            s = random.uniform(a, b)
            idx, p, data = self.tree.get(s)
            priorities.append(p)
            batch.append(data)
            idxs.append(idx)

        sampling_probabilities = np.array(priorities) / self.tree.total()
        is_weight = np.power(self.tree.n_entries * sampling_probabilities, -self.beta)
        is_weight /= (is_weight.max() + 1e-10)

        return batch, idxs, is_weight

    def update(self, idx, error):
        p = self._get_priority(error)
        self.tree.update(idx, p)

class DuelingDQN(nn.Module):
    def __init__(self, input_dim, output_dim):
        super(DuelingDQN, self).__init__()
        # Shared feature extractor
        self.feature = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
            nn.ReLU()
        )
        
        # Value stream (V(s))
        self.value_stream = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1)
        )
        
        # Advantage stream (A(s, a))
        self.advantage_stream = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, output_dim)
        )
        
    def forward(self, x):
        features = self.feature(x)
        value = self.value_stream(features)
        advantages = self.advantage_stream(features)
        # Combined Q-value with centering to improve identifiability
        q_values = value + (advantages - advantages.mean(dim=1, keepdim=True))
        return q_values

class DQNAgent:
    def __init__(self, state_size, action_size):
        self.state_size = state_size
        self.action_size = action_size
        self.memory = PrioritizedMemory(capacity=getattr(config, 'MEMORY_SIZE', 10000))
        
        self.gamma = config.GAMMA
        self.epsilon = config.EPSILON_START
        self.epsilon_min = config.EPSILON_MIN
        self.epsilon_decay = config.EPSILON_DECAY
        self.learning_rate = getattr(config, 'ALPHA', 0.001)
        
        self.device = torch.device("cpu")
        
        # Upgrade to DuelingDQN
        self.model = DuelingDQN(state_size, action_size).to(self.device)
        self.target_model = DuelingDQN(state_size, action_size).to(self.device)
        self.update_target_model()
        
        self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)
        self.criterion = nn.MSELoss()

    def save_weights(self, path):
        """Persists model weights and optimizer state to disk."""
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'epsilon': self.epsilon
        }, path)
        print(f"[DQNAgent] Weights saved to {path}")

    def load_weights(self, path):
        """Loads model weights and resumes epsilon decay."""
        if not os.path.exists(path):
            print(f"[DQNAgent] No weights found at {path}")
            return False
            
        try:
            checkpoint = torch.load(path, map_location=self.device)
            self.model.load_state_dict(checkpoint['model_state_dict'])
            self.target_model.load_state_dict(checkpoint['model_state_dict'])
            self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
            self.epsilon = checkpoint.get('epsilon', self.epsilon)
            print(f"[DQNAgent] Weights loaded from {path}")
            return True
        except RuntimeError as e:
            print(f"[DQNAgent] Weights dimension mismatch, starting fresh. Error: {e}")
            return False

    def update_target_model(self):
        self.target_model.load_state_dict(self.model.state_dict())

    def remember(self, state, action, reward, next_state, done):
        # Assign maximum priority to new experience so it's definitely sampled once
        sample = (state, action, reward, next_state, done)
        self.memory.add(10.0, sample)  # 10.0 is an arbitrary high initial error

    def choose_action(self, state, evaluate=False):
        if not evaluate and np.random.rand() <= self.epsilon:
            return random.randrange(self.action_size)
        
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            q_values = self.model(state_tensor)
        return torch.argmax(q_values[0]).item()

    def replay(self, batch_size):
        if self.memory.tree.n_entries < batch_size:
            return
            
        minibatch, idxs, is_weights = self.memory.sample(batch_size)
        
        states = torch.FloatTensor(np.array([m[0] for m in minibatch])).to(self.device)
        actions = torch.LongTensor(np.array([m[1] for m in minibatch])).unsqueeze(1).to(self.device)
        rewards = torch.FloatTensor(np.array([m[2] for m in minibatch])).unsqueeze(1).to(self.device)
        next_states = torch.FloatTensor(np.array([m[3] for m in minibatch])).to(self.device)
        dones = torch.FloatTensor(np.array([m[4] for m in minibatch])).unsqueeze(1).to(self.device)
        is_weights = torch.FloatTensor(is_weights).unsqueeze(1).to(self.device)
        
        # --- Double DQN Logic ---
        # 1. Use primary model to pick the best action for next_state
        # 2. Use target model to evaluate that action's Q-value
        current_q = self.model(states).gather(1, actions)
        
        with torch.no_grad():
            # Pick action using primary model
            next_actions = self.model(next_states).argmax(1).unsqueeze(1)
            # Evaluate action using target model
            next_q = self.target_model(next_states).gather(1, next_actions)
            target_q = rewards + (self.gamma * next_q * (1 - dones))
            
        # Compute TD Error for priority updates
        td_errors = torch.abs(target_q - current_q).detach().cpu().numpy()
        for i in range(batch_size):
            self.memory.update(idxs[i], td_errors[i][0])
            
        # Apply Importance Sampling weights to the loss
        loss = (is_weights * (current_q - target_q).pow(2)).mean()
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

    def decay_epsilon(self):
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
