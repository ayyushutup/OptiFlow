import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScroll, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';

const GRID_UNITS = 12; // 12x12 grid
const BLOCK_SIZE = 8;
const BOUND = (GRID_UNITS * BLOCK_SIZE) / 2; // 48

const BUILDING_COUNT = (GRID_UNITS - 1) * (GRID_UNITS - 1);
const INTERSECTION_COUNT = GRID_UNITS * GRID_UNITS;
const TRAFFIC_COUNT = 800;

const STATE_COLORS = {
    GREEN: new THREE.Color("#00FFC6"),
    YELLOW: new THREE.Color("#EAB308"), // Yellow
    RED: new THREE.Color("#FF0055"), // Red
};

export default function CinematicScene() {
    const scroll = useScroll(); 
    
    // Meshes
    const coreRef = useRef();
    const coreMatRef = useRef();
    const buildingsRef = useRef();
    const intersectionsRef = useRef();
    const roadsRef = useRef();

    const [coreHovered, setCoreHovered] = useState(false);

    // 1. Generate City Grid (Roads & Intersections)
    const { roadPositions, intersectionPositions, intersectionStates, intersectionColors } = useMemo(() => {
        const rPos = [];
        const iPos = new Float32Array(INTERSECTION_COUNT * 3);
        const iStates = new Int32Array(INTERSECTION_COUNT); // 0: Green, 1: Yellow, 2: Red
        const iColors = new Float32Array(INTERSECTION_COUNT * 3); // Pre-allocate colors

        let iIdx = 0;
        for (let x = 0; x < GRID_UNITS; x++) {
            for (let z = 0; z < GRID_UNITS; z++) {
                const px = x * BLOCK_SIZE - BOUND + BLOCK_SIZE/2;
                const pz = z * BLOCK_SIZE - BOUND + BLOCK_SIZE/2;
                
                iPos[iIdx*3] = px;
                iPos[iIdx*3+1] = 0.1; // Slightly above road
                iPos[iIdx*3+2] = pz;
                
                // Seed random states (mostly green, some yellow/red)
                const rand = Math.random();
                iStates[iIdx] = rand > 0.85 ? 2 : (rand > 0.7 ? 1 : 0); 
                
                const cObj = iStates[iIdx] === 0 ? STATE_COLORS.GREEN : (iStates[iIdx] === 1 ? STATE_COLORS.YELLOW : STATE_COLORS.RED);
                iColors[iIdx*3] = cObj.r;
                iColors[iIdx*3+1] = cObj.g;
                iColors[iIdx*3+2] = cObj.b;
                
                iIdx++;
            }
        }

        // Horizontal lines (along x)
        for (let z = 0; z < GRID_UNITS; z++) {
            const pz = z * BLOCK_SIZE - BOUND + BLOCK_SIZE/2;
            rPos.push(-BOUND, 0, pz, BOUND, 0, pz);
        }
        // Vertical lines (along z)
        for (let x = 0; x < GRID_UNITS; x++) {
            const px = x * BLOCK_SIZE - BOUND + BLOCK_SIZE/2;
            rPos.push(px, 0, -BOUND, px, 0, BOUND);
        }

        return { 
            roadPositions: new Float32Array(rPos), 
            intersectionPositions: iPos,
            intersectionStates,
            intersectionColors
        };
    }, []);

    // 2. Generate Buildings (InstancedMesh)
    const [buildingsReady, setBuildingsReady] = useState(false);
    
    useEffect(() => {
        if (!buildingsRef.current) return;
        const dummy = new THREE.Object3D();
        let idx = 0;
        
        for (let x = 0; x < GRID_UNITS - 1; x++) {
            for (let z = 0; z < GRID_UNITS - 1; z++) {
                const px = x * BLOCK_SIZE - BOUND + BLOCK_SIZE;
                const pz = z * BLOCK_SIZE - BOUND + BLOCK_SIZE;
                
                // Keep the absolute center open for the AI Core
                if (Math.abs(px) < 10 && Math.abs(pz) < 10) continue;

                // Cyberpunk building procedural logic
                const height = Math.random() * 15 + 2;
                // Add some random scaling so they aren't perfect cubes
                const width = Math.random() * (BLOCK_SIZE * 0.7) + (BLOCK_SIZE * 0.2);
                const depth = Math.random() * (BLOCK_SIZE * 0.7) + (BLOCK_SIZE * 0.2);
                
                dummy.position.set(px, height / 2, pz);
                dummy.scale.set(width, height, depth);
                dummy.updateMatrix();
                
                buildingsRef.current.setMatrixAt(idx, dummy.matrix);
                idx++;
            }
        }
        buildingsRef.current.count = idx; // Update actual count
        buildingsRef.current.instanceMatrix.needsUpdate = true;
        setBuildingsReady(true);
    }, []);

    // 3. Initial Traffic States
    // Let's hold traffic logic in a ref to persist across frames
    const trafficData = useRef(
        Array.from({ length: TRAFFIC_COUNT }).map(() => {
            const axis = Math.random() > 0.5 ? 0 : 2; // 0 for X, 2 for Z
            const direction = Math.random() > 0.5 ? 1 : -1;
            // Snapped to random lane
            const lineIdx = Math.floor(Math.random() * GRID_UNITS);
            const linePos = lineIdx * BLOCK_SIZE - BOUND + BLOCK_SIZE/2;
            
            const px = axis === 0 ? (Math.random() * BOUND * 2 - BOUND) : linePos;
            const pz = axis === 2 ? (Math.random() * BOUND * 2 - BOUND) : linePos;
            
            return {
                position: [px, 0.2, pz], // Slightly above intersections
                axis, // 0 for moving on X, 2 for moving on Z
                direction, // 1 or -1
                speed: Math.random() * 10 + 5,
                baseSpeed: Math.random() * 15 + 8
            };
        })
    );

    const trafficGeomRef = useRef();
    const trafficInitialPositions = useMemo(() => {
        const positions = new Float32Array(TRAFFIC_COUNT * 3);
        trafficData.current.forEach((v, i) => {
            positions[i * 3] = v.position[0];
            positions[i * 3 + 1] = v.position[1];
            positions[i * 3 + 2] = v.position[2];
        });
        return positions;
    }, []);

    // INTERSECTION LOGIC UPDATE
    useFrame((state, delta) => {
        const offset = scroll.offset; 

        // CAMERA RIGGING: Isometric City Scale
        const targetZ = THREE.MathUtils.lerp(50, 20, offset); 
        const targetY = THREE.MathUtils.lerp(35, 60, offset);
        
        const parallaxX = state.pointer.x * 5;
        const parallaxY = state.pointer.y * 5;
        
        // Panning the isometric tilt
        state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, parallaxX, 2, delta);
        state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, targetZ, 4, delta);
        state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, targetY - parallaxY, 4, delta);
        state.camera.lookAt(parallaxX * 0.5, 0, 0);

        // STAGE 1: CORE (Only visible at start)
        if (coreRef.current) {
            const rotationSpeedMultiplier = coreHovered ? 4.0 : 1.0;
            coreRef.current.rotation.y += delta * 0.3 * rotationSpeedMultiplier;
            coreRef.current.rotation.x += delta * 0.1 * rotationSpeedMultiplier;

            const coreBreakdown = Math.max(0, (offset - 0.05) * 5); 
            const baseScale = coreHovered ? 1.2 : 1.0;
            const targetScale = Math.max(0, baseScale - coreBreakdown);
            coreRef.current.scale.setScalar(THREE.MathUtils.damp(coreRef.current.scale.x, targetScale, 6, delta));
            
            if (coreMatRef.current) {
                const baseOpacity = coreHovered ? 1.0 : 0.9;
                coreMatRef.current.opacity = Math.max(0, baseOpacity - coreBreakdown * 2);
                coreMatRef.current.color.set(coreHovered ? "#FFFFFF" : "#00FFC6");
            }
        }

        // Fades for elements based on scroll (Network Awakens)
        const cityAlpha = Math.min(1, Math.max(0, (offset - 0.1) * 3));
        if (buildingsRef.current) buildingsRef.current.material.opacity = cityAlpha * 0.25; // Subtle geometric depth
        if (roadsRef.current) roadsRef.current.material.opacity = cityAlpha * 0.4;
        
        // INTERSECTIONS LOGIC
        // Every frame, occasionally swap states to simulate traffic light cycle and AI actions
        const time = state.clock.elapsedTime;
        if (intersectionsRef.current && intersectionsRef.current.geometry) {
            intersectionsRef.current.material.opacity = cityAlpha * 0.9;
            const colors = intersectionsRef.current.geometry.attributes.color;
            if (colors && colors.array) {
                for (let i = 0; i < INTERSECTION_COUNT; i++) {
                    // Randomly swap states (super simplified traffic light cycle)
                    if (Math.random() < 0.002) {
                         intersectionStates[i] = (intersectionStates[i] + 1) % 3;
                    }
                    
                    const stateVal = intersectionStates[i];
                    const colorObj = stateVal === 0 ? STATE_COLORS.GREEN : (stateVal === 1 ? STATE_COLORS.YELLOW : STATE_COLORS.RED);
                    
                    // Pulse intensity depending on state
                    const pulse = stateVal === 2 
                        ? (Math.sin(time * 5 + i) * 0.2) + 0.8 // Fast red flashing
                        : (Math.sin(time * 2 + i) * 0.1) + 0.9; // Smooth green
                        
                    colors.array[i*3] = colorObj.r * pulse;
                    colors.array[i*3+1] = colorObj.g * pulse;
                    colors.array[i*3+2] = colorObj.b * pulse;
                }
                colors.needsUpdate = true;
            }
        }

        // TRAFFIC LOGIC
        if (trafficGeomRef.current?.geometry?.attributes?.position) {
            const positions = trafficGeomRef.current.geometry.attributes.position.array;
            
            for(let i = 0; i < TRAFFIC_COUNT; i++) {
                const vehicle = trafficData.current[i];
                if (!vehicle) continue;

                const vPosIdx = i * 3;
                if (vPosIdx + 2 >= positions.length) continue;
                
                // Very basic 1D distance check along its axis of movement
                let speedMult = 1.0;
                
                const currPos = vehicle.position[vehicle.axis];
                const snappedNodeCoord = Math.round((currPos + BOUND - BLOCK_SIZE/2) / BLOCK_SIZE) * BLOCK_SIZE - BOUND + BLOCK_SIZE/2;
                
                // Distance to next node in direction of travel
                const distToNode = (snappedNodeCoord - currPos) * vehicle.direction;
                
                if (distToNode > 0 && distToNode < 3.0) {
                    const nodeX = vehicle.axis === 0 ? snappedNodeCoord : vehicle.position[0];
                    const nodeZ = vehicle.axis === 2 ? snappedNodeCoord : vehicle.position[2];
                    
                    // Decode node coordinate to index
                    const gridX = Math.round((nodeX + BOUND - BLOCK_SIZE/2) / BLOCK_SIZE);
                    const gridZ = Math.round((nodeZ + BOUND - BLOCK_SIZE/2) / BLOCK_SIZE);
                    
                    if (gridX >= 0 && gridX < GRID_UNITS && gridZ >= 0 && gridZ < GRID_UNITS) {
                        const stateIdx = gridX * GRID_UNITS + gridZ;
                        if (stateIdx >= 0 && stateIdx < intersectionStates.length) {
                             const nState = intersectionStates[stateIdx];
                             
                             if (nState === 2) { // RED (Congestion)
                                 // Smoothly decelerate as it approaches
                                 speedMult = Math.max(0, distToNode - 0.5); 
                             } else if (nState === 1) { // YELLOW 
                                 speedMult = 0.5;
                             } else { // GREEN
                                 speedMult = 1.5; // Accelerate through
                             }
                        }
                    }
                }

                // Move vehicle
                vehicle.position[vehicle.axis] += delta * vehicle.direction * vehicle.baseSpeed * speedMult;
                
                // Wrap around
                if (vehicle.position[vehicle.axis] > BOUND) vehicle.position[vehicle.axis] = -BOUND;
                if (vehicle.position[vehicle.axis] < -BOUND) vehicle.position[vehicle.axis] = BOUND;
                
                // Update geometry buffer
                positions[vPosIdx] = vehicle.position[0];
                positions[vPosIdx+1] = vehicle.position[1];
                positions[vPosIdx+2] = vehicle.position[2];
            }
            trafficGeomRef.current.geometry.attributes.position.needsUpdate = true;
        }
    });

    return (
        <group>
            {/* AMBIENCE */}
            <ambientLight intensity={0.5} color="#00FFC6" />
            <pointLight position={[0, 20, 0]} intensity={5} color="#FF00FF" distance={100} />
            <pointLight position={[0, -5, 0]} intensity={5} color="#00FFC6" distance={100} />

            {/* STAGE 1: Sub-surface AI Core */}
            <mesh 
                ref={coreRef} 
                position={[0, 4, 0]}
                onPointerOver={() => {
                    setCoreHovered(true);
                    document.body.style.cursor = 'crosshair';
                }}
                onPointerOut={() => {
                    setCoreHovered(false);
                    document.body.style.cursor = 'auto';
                }}
            >
                <icosahedronGeometry args={[4, 2]} />
                <meshBasicMaterial ref={coreMatRef} color="#00FFC6" wireframe transparent opacity={0.9} />
                
                {/* Interactive Tooltip shown only when hovered */}
                <Html 
                    position={[5, 2, 0]} 
                    center 
                    style={{ opacity: coreHovered ? 1 : 0, transition: 'opacity 0.3s ease-in-out', pointerEvents: 'none' }}
                >
                    <div className="bg-black/90 border border-[#00FFC6] p-4 backdrop-blur-xl w-56 shadow-[0_0_30px_rgba(0,255,198,0.5)]">
                        <h4 className="text-[#00FFC6] font-black font-mono tracking-widest text-sm mb-3 uppercase flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#00FFC6] animate-ping"></span>
                            CITY BRAIN
                        </h4>
                        <div className="font-mono text-xs text-white leading-loose">
                            <div className="flex justify-between border-b border-white/10 pb-1">
                                <span className="text-slate-500">STATE:</span> 
                                <span className="text-[#00FFC6]">OPTIMIZING</span>
                            </div>
                            <div className="flex justify-between border-b border-white/10 pb-1 pt-1">
                                <span className="text-slate-500">CONGESTION:</span> 
                                <span className="text-yellow-400">12.4%</span>
                            </div>
                            <div className="flex justify-between pt-1">
                                <span className="text-slate-500">THROUGHPUT:</span> 
                                <span className="text-[#00FFC6]">4.2k v/h</span>
                            </div>
                        </div>
                    </div>
                </Html>
            </mesh>

            {/* STAGE 2: Road Network Lines */}
            <lineSegments ref={roadsRef} position={[0, 0, 0]}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={roadPositions.length / 3} array={roadPositions} itemSize={3} />
                </bufferGeometry>
                <lineBasicMaterial color="#00FFC6" transparent opacity={0.1} />
            </lineSegments>

            {/* STAGE 2: Intersections (Glowing Nodes) */}
            <points ref={intersectionsRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={INTERSECTION_COUNT} array={intersectionPositions} itemSize={3} />
                    <bufferAttribute attach="attributes-color" count={INTERSECTION_COUNT} array={intersectionColors} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial transparent opacity={0} blending={THREE.AdditiveBlending} size={1.2} vertexColors sizeAttenuation />
            </points>

            {/* STAGE 3: Buildings */}
            <instancedMesh ref={buildingsRef} args={[null, null, BUILDING_COUNT]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#00FFC6" transparent opacity={0} metalness={1} roughness={0} wireframe />
            </instancedMesh>

            {/* STAGE 4: Traffic Points */}
            <points ref={trafficGeomRef}>
                <bufferGeometry>
                    <bufferAttribute 
                        attach="attributes-position" 
                        count={TRAFFIC_COUNT} 
                        array={trafficInitialPositions} 
                        itemSize={3} 
                    />
                </bufferGeometry>
                <pointsMaterial color="#FF00FF" size={0.5} transparent opacity={0.8} blending={THREE.AdditiveBlending} />
            </points>

            {/* Atmospheric Depth */}
            <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
        </group>
    );
}
