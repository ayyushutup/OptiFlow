import torch
import torch.nn as nn
import torch.optim as optim
import random
import numpy as np
from collections import deque
import config

class DQN(nn.Module):
    def __init__(self, input_dim, output_dim):
        super(DQN, self).__init__()
        self.fc1 = nn.Linear(input_dim, 64)
        self.fc2 = nn.Linear(64, 64)
        self.out = nn.Linear(64, output_dim)
        
    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return self.out(x)

class DQNAgent:
    def __init__(self, state_size, action_size):
        self.state_size = state_size
        self.action_size = action_size
        self.memory = deque(maxlen=getattr(config, 'MEMORY_SIZE', 10000))
        
        self.gamma = config.GAMMA
        self.epsilon = config.EPSILON_START
        self.epsilon_min = config.EPSILON_MIN
        self.epsilon_decay = config.EPSILON_DECAY
        self.learning_rate = getattr(config, 'ALPHA', 0.001)
        
        # Use CPU for tiny networks to avoid PCI-e transfer overhead
        self.device = torch.device("cpu")
        
        self.model = DQN(state_size, action_size).to(self.device)
        self.target_model = DQN(state_size, action_size).to(self.device)
        self.update_target_model()
        
        self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)
        self.criterion = nn.MSELoss()

    def update_target_model(self):
        """Syncs the target network weights with the primary network."""
        self.target_model.load_state_dict(self.model.state_dict())

    def remember(self, state, action, reward, next_state, done):
        """Stores experience in the replay buffer for later training."""
        self.memory.append((state, action, reward, next_state, done))

    def choose_action(self, state, evaluate=False):
        """Selects an action via epsilon-greedy policy using the Neural Network."""
        if not evaluate and np.random.rand() <= self.epsilon:
            return random.randrange(self.action_size)
        
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            q_values = self.model(state_tensor)
        return torch.argmax(q_values[0]).item()

    def replay(self, batch_size):
        """Samples a mini-batch from memory and runs a gradient descent step."""
        if len(self.memory) < batch_size:
            return
            
        minibatch = random.sample(self.memory, batch_size)
        
        states = torch.FloatTensor(np.array([m[0] for m in minibatch])).to(self.device)
        actions = torch.LongTensor(np.array([m[1] for m in minibatch])).unsqueeze(1).to(self.device)
        rewards = torch.FloatTensor(np.array([m[2] for m in minibatch])).unsqueeze(1).to(self.device)
        next_states = torch.FloatTensor(np.array([m[3] for m in minibatch])).to(self.device)
        dones = torch.FloatTensor(np.array([m[4] for m in minibatch])).unsqueeze(1).to(self.device)
        
        # Predict Q values for the actions actually taken
        current_q = self.model(states).gather(1, actions)
        
        # Target Q values using the secondary Target Network for stability
        with torch.no_grad():
            next_q = self.target_model(next_states).max(1)[0].unsqueeze(1)
            target_q = rewards + (self.gamma * next_q * (1 - dones))
            
        loss = self.criterion(current_q, target_q)
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

    def decay_epsilon(self):
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
