import sys
import os
import argparse

sys.path.append(os.path.join(os.path.dirname(__file__), 'simulation'))
sys.path.append(os.path.join(os.path.dirname(__file__), 'agents'))

import config
from simulation.sim_runner import SimRunner
from agents.traffic_env import TrafficEnv
from agents.dqn_agent import DQNAgent

def run_baseline(visualize=False):
    """Runs phase 1 with fixed timers"""
    print("="*50)
    print("Running Baseline (Fixed Timers) - Phase 1")
    print("="*50)
    runner = SimRunner()
    
    renderer = None
    if visualize:
        from visualization.renderer import Renderer  # pyre-ignore[21]
        renderer = Renderer()
        
    for _ in range(config.SIM_STEPS):
        runner.step()
        if renderer:
            renderer.render(runner.grid, runner.metrics, episode=0, epsilon=0.0)  # pyre-ignore[16]
            renderer.wait_tick(10)  # pyre-ignore[16]
    
    if runner.metrics:
        final = runner.metrics[-1]
        print(f"Final State: Active={final['active_vehicles']}, Queued={final['total_queued']}, Waiting Time={final['total_waiting_time']}")

def train_agent():
    """Trains the Q-Learning Agents across dozens of episodes"""
    print("="*50)
    print("Training Multi-Agent System - Phase 3")
    print("="*50)
    
    env = TrafficEnv()
    
    # Dynamically determine the size of the tensor input array
    initial_states = env.reset()
    state_size = len(list(initial_states.values())[0])
    action_size = getattr(config, 'NUM_PHASES', 2)
    
    # Initialize PyTorch agents dynamically
    agents = {}
    for inter in env.agent_intersections:
        agents[inter.id] = DQNAgent(state_size, action_size)
    
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
                agent.remember(states[agent_id], actions[agent_id], rewards[agent_id], next_states[agent_id], done)
                total_system_reward += rewards[agent_id]
            
            states = next_states
            
        for agent in agents.values():
            agent.replay(config.BATCH_SIZE)
            agent.decay_epsilon()
            
        if (episode + 1) % config.TARGET_UPDATE_FREQ == 0:
            for agent in agents.values():
                agent.update_target_model()
            
        if (episode + 1) % 100 == 0 or episode == 0:
            print(f"Episode {episode + 1}/{config.TRAIN_EPISODES} | Total System Reward: {total_system_reward:.2f} | Epsilon: {list(agents.values())[0].epsilon:.3f}")
        
    return agents

def eval_agent(agents, visualize=False):
    """Evaluates the trained agents with no randomness (epsilon=0)"""
    print("="*50)
    print("Evaluating Trained Multi-Agent System")
    print("="*50)
    
    env = TrafficEnv()
    states = env.reset()
    done = False
    
    renderer = None
    if visualize:
        from visualization.renderer import Renderer  # pyre-ignore[21]
        renderer = Renderer()
    
    while not done:
        actions = {}
        for agent_id, agent in agents.items():
            actions[agent_id] = agent.choose_action(states[agent_id], evaluate=True)
        states, _, done = env.step(actions)
        
        if renderer:
            renderer.render(env.grid, env.sim.metrics, episode=config.TRAIN_EPISODES, epsilon=0.0)  # pyre-ignore[16]
            renderer.wait_tick(10)  # pyre-ignore[16]
        
    final = env.sim.metrics[-1]
    print(f"Evaluation Complete!")
    print(f"Final State: Active={final['active_vehicles']}, Queued={final['total_queued']}, Waiting Time={final['total_waiting_time']}")

def main():
    parser = argparse.ArgumentParser(description="OptiFlow Traffic Simulation")
    parser.add_argument('--mode', choices=['baseline', 'train'], default='baseline')
    parser.add_argument('--visualize', action='store_true', help="Enable PyGame Visualization during evaluation/baseline mode")
    args = parser.parse_args()
    
    if args.mode == 'baseline':
        run_baseline(visualize=args.visualize)
    elif args.mode == 'train':
        trained_agent = train_agent()
        print("\n--- Training Complete! Starting Evaluation against Baseline... ---\n")
        eval_agent(trained_agent, visualize=args.visualize)
        print("\n--- Running Baseline for Comparison... ---\n")
        run_baseline(visualize=args.visualize)

if __name__ == "__main__":
    main()
