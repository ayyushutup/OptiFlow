import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import random
import config

class QAgent:
    def __init__(self):
        self.q_table = {}  # Dictionary mapping state_tuple -> [q_keep, q_switch]
        self.alpha = config.ALPHA
        self.gamma = config.GAMMA
        self.epsilon = config.EPSILON_START

    def get_q_values(self, state):
        """Fetch Q-values, initializing to 0 if the state hasn't been seen yet."""
        if state not in self.q_table:
            self.q_table[state] = [0.0, 0.0]  # [Action 0, Action 1]
        return self.q_table[state]

    def choose_action(self, state, evaluate=False):
        """Decide what to do: random exploration vs. calculated exploitation"""
        # If we are training, we occasionally take a random action to explore
        if not evaluate and random.random() < self.epsilon:
            return random.choice([0, 1])
        
        # Otherwise, exploit (pick the action with the highest Q-value)
        q_values = self.get_q_values(state)
        return 0 if q_values[0] >= q_values[1] else 1

    def update(self, state, action, reward, next_state):
        """Bellman equation updates the Q-table based on the reward received."""
        q_values = self.get_q_values(state)
        next_q_values = self.get_q_values(next_state)
        
        best_next_q = max(next_q_values)
        td_target = reward + self.gamma * best_next_q
        td_error = td_target - q_values[action]
        
        q_values[action] += self.alpha * td_error

    def decay_epsilon(self):
        """Lower the chance of random exploration over time."""
        if self.epsilon > config.EPSILON_MIN:
            self.epsilon *= config.EPSILON_DECAY
