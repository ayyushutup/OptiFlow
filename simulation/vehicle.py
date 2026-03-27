import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import config

class Vehicle:
    def __init__(self, vehicle_id):
        self.id = vehicle_id
        self.current_pos = None
        self.position = 0
        self.waiting_time = 0
        self.speed = config.VEHICLE_SPEED

    def move(self):
        self.position += self.speed 

    def wait(self):
        self.waiting_time += 1

    def __repr__(self):
        return f"Vehicle(id={self.id}, pos={self.position}, wait={self.waiting_time})"            

if __name__ == "__main__":
    v1 = Vehicle(1)
    v2 = Vehicle(2)
    
    print(v1)               # Vehicle(id=1, pos=0, wait=0)
    v1.move()
    v1.move()
    print(v1)               # Vehicle(id=1, pos=2, wait=0)
    v1.wait()
    v1.wait()
    v1.wait()
    print(v1)               # Vehicle(id=1, pos=2, wait=3)
    print(v2)               # Vehicle(id=2, pos=0, wait=0)
