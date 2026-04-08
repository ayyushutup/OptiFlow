"""
Configuration for OptiFlow
"""

# ---GRID SETTINGS---
GRID_ROWS = 3
GRID_COLS = 3

# ---SIMULATION SETTING---
SIM_STEPS = 200
VEHICLE_SPAWN_RATE = 0.3

# ---ROAD SETTINGS---
ROAD_LENGTH = 5
LANE_CAPACITY = 10

# ---TRAFFIC LIGHT SETTINGS---
GREEN_DURATION = 5
YELLOW_DURATION = 1
MAX_GREEN_DURATION = 5
NUM_PHASES = 2

# ---VEHICLE SETTINGS---
VEHICLE_SPEED = 1

# ---RL SETTINGS---
ALPHA = 0.001  # Deep Learning LR is typically much smaller than Tabular
GAMMA = 0.95

EPSILON_START = 1.0
EPSILON_MIN = 0.05
EPSILON_DECAY = 0.995
TRAIN_EPISODES = 500

# ---DQN SETTINGS---
BATCH_SIZE = 64
MEMORY_SIZE = 10000
TARGET_UPDATE_FREQ = 10

# ---PER SETTINGS---
PER_ALPHA = 0.6    # Alpha determines how much prioritization is used
PER_BETA = 0.4     # Beta determines how much importance sampling correction is used
PER_BETA_INCREMENT = 0.001
PER_EPSILON = 0.01

# ---RUNTIME SETTINGS (overridden by CLI args in main.py)---
BACKEND = 'grid'   # 'grid' or 'sumo'
VISUALIZE = False

# ---MODEL PERSISTENCE---
MODEL_DIR = 'models'   # directory to save/load trained agent weights
MODEL_SAVE_FREQ = 100  # steps between auto-saves
LOAD_MODEL = True      # load model on startup if exists

# ---TRAINING MODE---
TRAINING_MODE = False  # If True, runs simulation as fast as CPU allows
SPEED_MULTIPLIER = 1   # Default speed multiplier for 'tick' loop
