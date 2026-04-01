import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import pygame  # pyre-ignore[21]
import config  # pyre-ignore[21]

class Renderer:
    def __init__(self):
        pygame.init()
        
        self.width = 850
        self.height = 650
        self.screen = pygame.display.set_mode((self.width, self.height))
        pygame.display.set_caption("OptiFlow RL Simulation - Cyberpunk Overhaul")
        
        # Cyberpunk / Modern Dark Mode Colors
        self.bg_color = (13, 17, 23)        # Very dark blue/grey
        self.road_color = (30, 41, 59)      # Slate grey for asphalt
        self.lane_color = (71, 85, 105)     # Dashed lane divider
        self.intersection_color = (15, 23, 42) # Darker slate for junction
        
        self.vehicle_color = (56, 189, 248) # Neon Cyan
        self.hud_bg = (15, 23, 42, 230)     # Translucent dark slate
        self.hud_border = (56, 189, 248)
        
        # Glow Colors
        self.red_color = (239, 68, 68)
        self.green_color = (34, 197, 94)
        self.yellow_color = (234, 179, 8)
        
        # Fonts
        self.font_title = pygame.font.SysFont("Trebuchet MS", 26, bold=True)
        self.font = pygame.font.SysFont("Trebuchet MS", 18)
        self.clock = pygame.time.Clock()
        
    def _draw_dashed_line(self, surface, color, start_pos, end_pos, width=2, dash_length=15):
        # Math to draw dashed lines for roads
        import math
        x1, y1 = start_pos
        x2, y2 = end_pos
        dl = math.hypot(x2 - x1, y2 - y1)
        if dl == 0: return
        dashes = int(dl / dash_length)
        for i in range(dashes):
            if i % 2 == 0:
                p1 = (x1 + (x2 - x1) * i / dashes, y1 + (y2 - y1) * i / dashes)
                p2 = (x1 + (x2 - x1) * (i + 1) / dashes, y1 + (y2 - y1) * (i + 1) / dashes)
                pygame.draw.line(surface, color, p1, p2, width)

    def _draw_neon_glow(self, surface, pos, color, radius=12):
        # Create a surface with alpha capability
        glow_surf = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
        # Draw multiple faint circles
        for r in range(radius, 0, -2):
            alpha = int(255 * (1 - r / radius))
            c_alpha = (*color[:3], alpha // 3)
            pygame.draw.circle(glow_surf, c_alpha, (radius, radius), r)
        # Draw solid inner core
        pygame.draw.circle(glow_surf, color, (radius, radius), radius // 2)
        surface.blit(glow_surf, (pos[0] - radius, pos[1] - radius))

    def render(self, grid, metrics, episode=0, epsilon=0.0):
        self.screen.fill(self.bg_color)
        
        # Layout config
        margin_x = 180
        margin_y = 150
        spacing_x = 160
        spacing_y = 160
        
        # Base Road Layer (Thick Asphalt)
        intersection_rects = {}
        for (r, c), inter in grid.intersections.items():
            cx = margin_x + c * spacing_x
            cy = margin_y + r * spacing_y
            intersection_rects[inter.id] = (cx, cy)
            
        for road in grid.roads:
            if road.from_intersection and road.to_intersection:
                p1 = intersection_rects[road.from_intersection.id]
                p2 = intersection_rects[road.to_intersection.id]
                pygame.draw.line(self.screen, self.road_color, p1, p2, 40)
                self._draw_dashed_line(self.screen, self.lane_color, p1, p2, width=2)
            elif road.from_intersection and not road.to_intersection:
                # Exit road
                p1 = intersection_rects[road.from_intersection.id]
                for d, r_check in road.from_intersection.outgoing_roads.items():
                    if r_check == road:
                        dx, dy = 0, 0
                        if d == "N": dy = -1
                        elif d == "S": dy = 1
                        elif d == "E": dx = 1
                        elif d == "W": dx = -1
                        p2 = (p1[0] + dx * spacing_x, p1[1] + dy * spacing_y)
                        pygame.draw.line(self.screen, self.road_color, p1, p2, 40)
                        self._draw_dashed_line(self.screen, self.lane_color, p1, p2, width=2)
                        
        # Intersections & Signals & Vehicles
        for (r, c), inter in grid.intersections.items():
            cx, cy = intersection_rects[inter.id]
            
            # Intersection dark box
            rect = pygame.Rect(cx - 20, cy - 20, 40, 40)
            pygame.draw.rect(self.screen, self.intersection_color, rect, border_radius=4)
            pygame.draw.rect(self.screen, self.lane_color, rect, width=1, border_radius=4)
            
            # Draw Neon Signals
            if inter.signal.is_yellow:
                self._draw_neon_glow(self.screen, (cx, cy), self.yellow_color, 20)
            else:
                green_dirs = inter.signal.get_green_directions()
                ns_color = self.green_color if "NS" in green_dirs else self.red_color
                ew_color = self.green_color if "EW" in green_dirs else self.red_color
                
                self._draw_neon_glow(self.screen, (cx, cy - 25), ns_color, 12)
                self._draw_neon_glow(self.screen, (cx, cy + 25), ns_color, 12)
                self._draw_neon_glow(self.screen, (cx - 25, cy), ew_color, 12)
                self._draw_neon_glow(self.screen, (cx + 25, cy), ew_color, 12)
                
            # Draw Queued Vehicles (Cyberpunk cyan boxes with slight glow)
            for direction, lane in inter.incoming_lanes.items():
                for idx, vehicle in enumerate(lane.queue):
                    vx, vy = cx, cy
                    offset = 30 + idx * 12
                    if direction == "N": vy = cy - offset
                    elif direction == "S": vy = cy + offset
                    elif direction == "W": vx = cx - offset
                    elif direction == "E": vx = cx + offset
                        
                    v_rect = pygame.Rect(vx-4, vy-4, 8, 8)
                    pygame.draw.rect(self.screen, self.vehicle_color, v_rect, border_radius=3)
                    
        # Draw Moving Vehicles manually computing trajectory
        for road in grid.roads:
            if not road.vehicles: continue
            
            from_pos = None
            to_pos = None
            if road.from_intersection:
                from_pos = intersection_rects[road.from_intersection.id]
            if road.to_intersection:
                to_pos = intersection_rects[road.to_intersection.id]
            
            for vehicle in road.vehicles:
                progress = vehicle.position / config.ROAD_LENGTH
                vx, vy = 0, 0
                
                if from_pos and to_pos:
                    vx = from_pos[0] + (to_pos[0] - from_pos[0]) * progress
                    vy = from_pos[1] + (to_pos[1] - from_pos[1]) * progress
                elif from_pos and not to_pos: # Exit road
                    for d, r_check in road.from_intersection.outgoing_roads.items():
                        if r_check == road:
                            dx, dy = 0, 0
                            if d == "N": dy = -1
                            elif d == "S": dy = 1
                            elif d == "E": dx = 1
                            elif d == "W": dx = -1
                            vx = from_pos[0] + dx * progress * spacing_x
                            vy = from_pos[1] + dy * progress * spacing_y
                            break
                            
                v_rect = pygame.Rect(int(vx)-4, int(vy)-4, 8, 8)
                pygame.draw.rect(self.screen, self.vehicle_color, v_rect, border_radius=3)

        # Draw Sleek Translucent HUD Panel
        hud_surface = pygame.Surface((220, self.height - 40), pygame.SRCALPHA)
        pygame.draw.rect(hud_surface, self.hud_bg, (0, 0, 220, self.height - 40), border_radius=15)
        pygame.draw.rect(hud_surface, self.hud_border, (0, 0, 220, self.height - 40), width=2, border_radius=15)
        self.screen.blit(hud_surface, (self.width - 240, 20))
        
        if metrics:
            latest = metrics[-1]
            title = self.font_title.render("OptiFlow HUD", True, self.vehicle_color)
            self.screen.blit(title, (self.width - 220, 35))
            
            texts = [
                ("Episode", f"{episode}"),
                ("Sim Step", f"{latest.get('step', 0)}"),
                ("Active Cars", f"{latest.get('active_vehicles', 0)}"),
                ("Traffic Jam", f"{latest.get('total_queued', 0)}"),
                ("Wait Time", f"{latest.get('total_waiting_time', 0)}"),
                ("Epsilon", f"{epsilon:.3f}")
            ]
            
            y_offset = 80
            for label, val in texts:
                label_surf = self.font.render(label, True, (148, 163, 184))
                val_surf = self.font.render(val, True, (241, 245, 249))
                self.screen.blit(label_surf, (self.width - 220, y_offset))
                self.screen.blit(val_surf, (self.width - 80, y_offset))
                y_offset += 35

        pygame.display.flip()
        
        # Handle events allows user to exit
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
                
    def wait_tick(self, fps=20):
        # Slightly faster for smoother appearance
        self.clock.tick(fps)
