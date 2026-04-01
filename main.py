import sys
import os
import argparse
import torch

sys.path.append(os.path.join(os.path.dirname(__file__), 'simulation'))
sys.path.append(os.path.join(os.path.dirname(__file__), 'agents'))

import config
from simulation.sim_runner import SimRunner
from agents.traffic_env import TrafficEnv
from agents.dqn_agent import DQNAgent


def save_agents(agents, path=None):
    """Saves each agent's primary network weights to disk."""
    save_dir = path or config.MODEL_DIR
    os.makedirs(save_dir, exist_ok=True)
    for agent_id, agent in agents.items():
        filepath = os.path.join(save_dir, f"agent_{agent_id}.pt")
        torch.save(agent.model.state_dict(), filepath)
    print(f"[Save] {len(agents)} agent(s) saved to '{save_dir}/'")


def load_agents(agents, path=None):
    """Loads saved weights into each agent's primary and target networks."""
    save_dir = path or config.MODEL_DIR
    loaded = 0
    for agent_id, agent in agents.items():
        filepath = os.path.join(save_dir, f"agent_{agent_id}.pt")
        if os.path.exists(filepath):
            state_dict = torch.load(filepath, map_location=agent.device)
            agent.model.load_state_dict(state_dict)
            agent.update_target_model()   # keep target in sync
            agent.epsilon = agent.epsilon_min  # skip exploration when evaluating
            loaded += 1
        else:
            print(f"[Load] Warning: no checkpoint for agent {agent_id} at '{filepath}'")
    print(f"[Load] {loaded}/{len(agents)} agent(s) loaded from '{save_dir}/'")
    return agents

def run_baseline(visualize=False):
    """Runs phase 1 with fixed timers"""
    print("="*50)
    print("Running Baseline (Fixed Timers) - Phase 1")
    print("="*50)
    
    if config.BACKEND == 'sumo':
        from agents.sumo_env import SumoEnv
        env = SumoEnv(use_gui=visualize)
        states = env.reset()
        done = False
        while not done:
            # Baseline is fixed alternations, sumo handles default traffic lights.
            # But wait, does it? Yes, sumo defaults to fixed timers if we don't set phases explicitly often. 
            # Or we can just let it step.
            _, _, done = env.step({}) # Empty dict means no RL action
            if visualize: # For sumo-gui, rendering is builtin
                pass 
        runner = env.sim
    else:
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
    if config.BACKEND == 'sumo':
        from agents.sumo_env import SumoEnv
        env = SumoEnv(use_gui=config.VISUALIZE)
    else:
        env = TrafficEnv()
    
    # Dynamically determine the size of the tensor input array
    initial_states = env.reset()
    state_size = len(list(initial_states.values())[0])
    action_size = getattr(config, 'NUM_PHASES', 2)
    
    # Initialize PyTorch agents dynamically
    agents = {}
    for inter in env.agent_intersections:
        agents[inter.id] = DQNAgent(state_size, action_size)
    
    step_counter = 0

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
                agent.remember(
                    states[agent_id],
                    actions[agent_id],
                    rewards[agent_id],
                    next_states[agent_id],
                    done
                )
                total_system_reward += rewards[agent_id]

            # ---- FIX: train every step, not once per episode ----
            for agent in agents.values():
                agent.replay(config.BATCH_SIZE)

            step_counter += 1

            # Sync target network every N *steps*, not every N episodes
            if step_counter % config.TARGET_UPDATE_FREQ == 0:
                for agent in agents.values():
                    agent.update_target_model()

            states = next_states

        # Decay epsilon once per episode (not per step — keeps exploration gradual)
        for agent in agents.values():
            agent.decay_epsilon()
            
        if (episode + 1) % 10 == 0 or episode == 0:
            print(
                f"Episode {episode + 1:>4}/{config.TRAIN_EPISODES} "
                f"| Reward: {total_system_reward:>10.2f} "
                f"| ε: {list(agents.values())[0].epsilon:.4f} "
                f"| Steps: {step_counter}"
            )
        
    return agents

def eval_agent(agents, visualize=False):
    """Evaluates the trained agents with no randomness (epsilon=0)"""
    print("="*50)
    print("Evaluating Trained Multi-Agent System")
    print("="*50)
    if config.BACKEND == 'sumo':
        from agents.sumo_env import SumoEnv
        env = SumoEnv(use_gui=visualize)
    else:
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
    parser.add_argument('--backend', choices=['grid', 'sumo'], default='grid')
    parser.add_argument('--visualize', action='store_true', help="Enable PyGame Visualization during evaluation/baseline mode")
    parser.add_argument('--save-model', metavar='DIR', default=None,
                        help="After training, save agent weights to this directory (default: config.MODEL_DIR)")
    parser.add_argument('--load-model', metavar='DIR', default=None,
                        help="Before evaluation, load pre-trained weights from this directory")
    args = parser.parse_args()
    
    config.BACKEND = args.backend
    config.VISUALIZE = args.visualize
    
    if args.mode == 'baseline':
        run_baseline(visualize=args.visualize)

    elif args.mode == 'train':
        trained_agents = train_agent()

        # Always auto-save after training
        save_agents(trained_agents, path=args.save_model)

        print("\n--- Training Complete! Starting Evaluation against Baseline... ---\n")
        eval_agent(trained_agents, visualize=args.visualize)
        print("\n--- Running Baseline for Comparison... ---\n")
        run_baseline(visualize=args.visualize)


if __name__ == "__main__":
    main()
