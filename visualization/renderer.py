import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import pygame  # pyre-ignore[21]
import config  # pyre-ignore[21]

class Renderer:
    def __init__(self):
        pygame.init()
        
        self.cell_size = 40
        self.width = 800
        self.height = 600
        self.screen = pygame.display.set_mode((self.width, self.height))
        pygame.display.set_caption("OptiFlow Multi-Agent RL Simulation")
        self.font = pygame.font.SysFont("Arial", 18)
        self.clock = pygame.time.Clock()
        
        self.bg_color = (30, 30, 30)
        self.road_color = (80, 80, 80)
        self.intersection_color = (100, 100, 100)
        self.vehicle_color = (100, 200, 255)
        
    def render(self, grid, metrics, episode=0, epsilon=0.0):
        self.screen.fill(self.bg_color)
        
        margin_x = 150
        margin_y = 150
        spacing_x = 150
        spacing_y = 150
        
        intersection_rects = {}
        for (r, c), inter in grid.intersections.items():
            cx = margin_x + c * spacing_x
            cy = margin_y + r * spacing_y
            rect = pygame.Rect(cx - 20, cy - 20, 40, 40)
            intersection_rects[inter.id] = (cx, cy)
            
            # Draw intersection box
            pygame.draw.rect(self.screen, self.intersection_color, rect)
            
            # Draw signals
            if inter.signal.is_yellow:
                color = (255, 255, 0)
                # Draw yellow around the center
                pygame.draw.circle(self.screen, color, (cx, cy), 10)
            else:
                green_dirs = inter.signal.get_green_directions()
                ns_color = (0, 255, 0) if "NS" in green_dirs else (255, 0, 0)
                ew_color = (0, 255, 0) if "EW" in green_dirs else (255, 0, 0)
                
                # NS signal (top/bottom)
                pygame.draw.circle(self.screen, ns_color, (cx, cy - 25), 5)
                pygame.draw.circle(self.screen, ns_color, (cx, cy + 25), 5)
                
                # EW signal (left/right)
                pygame.draw.circle(self.screen, ew_color, (cx - 25, cy), 5)
                pygame.draw.circle(self.screen, ew_color, (cx + 25, cy), 5)
                
            # Draw queued vehicles
            for direction, lane in inter.incoming_lanes.items():
                for idx, vehicle in enumerate(lane.queue):
                    vx, vy = cx, cy
                    offset = 30 + idx * 12
                    if direction == "N": # arriving from N, heading S
                        vy = cy - offset
                    elif direction == "S":
                        vy = cy + offset
                    elif direction == "W":
                        vx = cx - offset
                    elif direction == "E":
                        vx = cx + offset
                        
                    pygame.draw.rect(self.screen, self.vehicle_color, (vx-5, vy-5, 10, 10))

        # Draw roads and moving vehicles
        for road in grid.roads:
            # Draw road lines
            from_pos = None
            to_pos = None
            
            if road.from_intersection:
                from_pos = intersection_rects[road.from_intersection.id]
            if road.to_intersection:
                to_pos = intersection_rects[road.to_intersection.id]
                
            if from_pos and to_pos:
                pygame.draw.line(self.screen, self.road_color, from_pos, to_pos, 2)
            
            if not road.vehicles: continue
                
            # Draw vehicles manually computing trajectory
            for vehicle in road.vehicles:
                progress = vehicle.position / config.ROAD_LENGTH
                vx, vy = 0, 0
                
                if from_pos and to_pos:
                    vx = from_pos[0] + (to_pos[0] - from_pos[0]) * progress  # pyre-ignore[16, 58]
                    vy = from_pos[1] + (to_pos[1] - from_pos[1]) * progress  # pyre-ignore[16, 58]
                elif from_pos and not to_pos: # Exit road
                    for d, r in road.from_intersection.outgoing_roads.items():  # pyre-ignore[16]
                        if r == road:
                            dx, dy = 0, 0
                            if d == "N": dy = -1
                            if d == "S": dy = 1
                            if d == "W": dx = -1
                            if d == "E": dx = 1
                            vx = from_pos[0] + dx * progress * spacing_x
                            vy = from_pos[1] + dy * progress * spacing_y
                            # draw exit road line
                            pygame.draw.line(self.screen, self.road_color, from_pos, (vx, vy), 2)
                            break
                            
                pygame.draw.rect(self.screen, self.vehicle_color, (int(vx)-5, int(vy)-5, 10, 10))
                
        # Draw Metrics Sidebar
        sidebar_x = 600
        pygame.draw.rect(self.screen, (40, 40, 40), (sidebar_x, 0, 200, self.height))
        
        if metrics:
            latest = metrics[-1]
            texts = [
                "OptiFlow Metrics",
                f"Episode: {episode}",
                f"Step: {latest.get('step', 0)}",
                f"Active Vehicles: {latest.get('active_vehicles', 0)}",
                f"Queued Vehicles: {latest.get('total_queued', 0)}",
                f"Wait Time: {latest.get('total_waiting_time', 0)}",
                f"Epsilon: {epsilon:.3f}"
            ]
            for i, text in enumerate(texts):
                surf = self.font.render(text, True, (255, 255, 255))
                self.screen.blit(surf, (sidebar_x + 10, 20 + i * 30))

        pygame.display.flip()
        
        # Handle events allows user to exit
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
                
    def wait_tick(self, fps=10):
        self.clock.tick(fps)
