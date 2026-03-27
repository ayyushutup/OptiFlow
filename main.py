import sys
import os
import argparse

sys.path.append(os.path.join(os.path.dirname(__file__), 'simulation'))
sys.path.append(os.path.join(os.path.dirname(__file__), 'agents'))

import config
from simulation.sim_runner import SimRunner
from agents.traffic_env import TrafficEnv
from agents.q_agent import QAgent

def run_baseline():
    """Runs phase 1 with fixed timers"""
    print("="*50)
    print("Running Baseline (Fixed Timers) - Phase 1")
    print("="*50)
    runner = SimRunner()
    runner.run(config.SIM_STEPS)
    
    if runner.metrics:
        final = runner.metrics[-1]
        print(f"Final State: Active={final['active_vehicles']}, Queued={final['total_queued']}, Waiting Time={final['total_waiting_time']}")

def train_agent():
    """Trains the Q-Learning Agents across dozens of episodes"""
    print("="*50)
    print("Training Multi-Agent System - Phase 3")
    print("="*50)
    
    env = TrafficEnv()
    
    # Initialize dictionary of agents, one per intersection
    agents = {inter.id: QAgent() for inter in env.agent_intersections}
    
    for episode in range(config.TRAIN_EPISODES):
        states = env.reset()
        done = False
        total_system_reward: float = 0.0
        
        while not done:
            actions = {}
            for agent_id, agent in agents.items():
                actions[agent_id] = agent.choose_action(states[agent_id])
                
            next_states, rewards, done = env.step(actions)
            
            for agent_id, agent in agents.items():
                agent.update(states[agent_id], actions[agent_id], rewards[agent_id], next_states[agent_id])
                total_system_reward += rewards[agent_id]
            
            states = next_states
            
        # Decay epsilon for all agents
        for agent in agents.values():
            agent.decay_epsilon()
            
        print(f"Episode {episode + 1}/{config.TRAIN_EPISODES} | Total System Reward: {total_system_reward:.2f} | Epsilon: {list(agents.values())[0].epsilon:.3f}")
        
    return agents

def eval_agent(agents):
    """Evaluates the trained agents with no randomness (epsilon=0)"""
    print("="*50)
    print("Evaluating Trained Multi-Agent System")
    print("="*50)
    
    env = TrafficEnv()
    states = env.reset()
    done = False
    
    while not done:
        actions = {}
        for agent_id, agent in agents.items():
            actions[agent_id] = agent.choose_action(states[agent_id], evaluate=True)
        states, _, done = env.step(actions)
        
    final = env.sim.metrics[-1]
    print(f"Evaluation Complete!")
    print(f"Final State: Active={final['active_vehicles']}, Queued={final['total_queued']}, Waiting Time={final['total_waiting_time']}")

def main():
    parser = argparse.ArgumentParser(description="OptiFlow Traffic Simulation")
    parser.add_argument('--mode', choices=['baseline', 'train'], default='baseline')
    args = parser.parse_args()
    
    if args.mode == 'baseline':
        run_baseline()
    elif args.mode == 'train':
        trained_agent = train_agent()
        print("\n--- Training Complete! Starting Evaluation against Baseline... ---\n")
        eval_agent(trained_agent)
        print("\n--- Running Baseline for Comparison... ---\n")
        run_baseline()

if __name__ == "__main__":
    main()
