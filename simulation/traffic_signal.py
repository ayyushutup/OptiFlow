import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import config

class TrafficSignal:
    def __init__(self):
        #configuration
        self.num_phases = config.NUM_PHASES
        self.green_duration = config.GREEN_DURATION
        self.yellow_duration = config.YELLOW_DURATION

        #state
        self.current_phase = 0
        self.is_yellow = False
        self.timer = self.green_duration

    def tick(self):
        """
        Called every time step.
        Handles countdown and phase transitions.
        """
        self.timer -= 1

        if self.timer <= 0:
            if self.is_yellow:
                # Yellow finished → switch to next phase
                self.switch_phase()
                self.timer = self.green_duration
                self.is_yellow = False
            else:
                # Green finished → go to yellow
                self.is_yellow = True
                self.timer = self.yellow_duration

    def switch_phase(self):
        """
        Move to next phase (circular).
        """
        self.current_phase = (self.current_phase + 1) % self.num_phases

    def get_green_directions(self):
        """
        Returns which directions are allowed to move.
        """
        if self.is_yellow:
            return []

        if self.current_phase == 0:
            return ["NS"]  # North-South
        elif self.current_phase == 1:
            return ["EW"]  # East-West

        return []

    def __repr__(self):
        return f"Signal(phase={self.current_phase}, timer={self.timer}, yellow={self.is_yellow})"   


if __name__ == "__main__":
    signal = TrafficSignal()
    for step in range(15):
        print(f"Step {step}: {signal}  Green: {signal.get_green_directions()}")
        signal.tick()


