import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Float, Stars, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Data Particles that float around the abstract core
function DataSwarm() {
  const ref = useRef();
  
  // Generate random clustered positions for particles
  const [positions, speeds] = useMemo(() => {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Cluster around the center with some spread
      const radius = 2 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 6;
      
      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * radius;
      
      speeds[i] = 0.5 + Math.random() * 2;
    }
    return [positions, speeds];
  }, []);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.1;
      
      // Gentle bobbing effect for the entire swarm
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.5;
    }
  });

  return (
    <Points ref={ref} positions={positions} frustumCulled={false}>
      <PointMaterial 
        transparent 
        color="#00FFC6" 
        size={0.05} 
        sizeAttenuation={true} 
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// Emissive Wireframe Core representing the Master Agent
function CoreHologram() {
  const coreRef = useRef();
  const ringRef = useRef();

  useFrame((state, delta) => {
    if (coreRef.current) {
      coreRef.current.rotation.x += delta * 0.2;
      coreRef.current.rotation.y += delta * 0.5;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * 0.3;
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={2}>
        <mesh ref={coreRef}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color="#FF00FF" wireframe={true} transparent opacity={0.6} />
        </mesh>
      </Float>
      
      <mesh ref={ringRef}>
        <torusGeometry args={[2.5, 0.02, 16, 100]} />
        <meshBasicMaterial color="#00FFC6" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// Moving Grid floor
function InfiniteGrid() {
  const gridRef = useRef();

  useFrame((state, delta) => {
    if (gridRef.current) {
      // Move the grid towards the camera to simulate forward movement
      gridRef.current.position.z = (state.clock.elapsedTime * 2) % 2;
    }
  });

  return (
    <group ref={gridRef}>
      <Grid 
        position={[0, -3, 0]} 
        args={[50, 50]} 
        cellSize={0.5} 
        cellThickness={1} 
        cellColor="#FF00FF" 
        sectionSize={2} 
        sectionThickness={1.5} 
        sectionColor="#00FFC6" 
        fadeDistance={25} 
        fadeStrength={1} 
      />
    </group>
  );
}

export default function CyberGrid3D() {
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
      <Canvas camera={{ position: [0, 2, 8], fov: 45 }}>
        <fog attach="fog" args={['#050510', 5, 25]} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[0, 0, 0]} intensity={2} color="#FF00FF" />
        
        <CoreHologram />
        <DataSwarm />
        <InfiniteGrid />
        
        {/* Distant background stars for depth */}
        <Stars radius={50} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
      </Canvas>
    </div>
  );
}
