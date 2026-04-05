import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { ScrollControls, Scroll } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Cpu, Box, Activity, Network } from 'lucide-react';
import CinematicScene from './CinematicCanvas';

// 0. The Pre-loader Screen
function Preloader({ onComplete }) {
  const [text, setText] = useState('');
  const fullText = ">\n> INITIALIZING OPTIFLOW CORE... \n> CONNECTING TO CITY GRID... \n> LOADING RL AGENTS...\n> SYSTEM READY.";
  
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setText(fullText.slice(0, index));
      index++;
      if (index > fullText.length) {
        clearInterval(interval);
        setTimeout(onComplete, 800); // Wait briefly after finishing
      }
    }, 25);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: 'easeInOut' }}
      className="fixed inset-0 bg-black z-50 flex items-center justify-center p-8"
    >
      <div className="w-full max-w-xl">
        <Terminal className="w-8 h-8 text-[#00FFC6] mb-4 animate-pulse" />
        <pre className="text-[#00FFC6] font-mono text-sm leading-relaxed whitespace-pre-wrap font-bold drop-shadow-[0_0_10px_rgba(0,255,198,0.8)]">
          {text}
          <span className="animate-pulse">_</span>
        </pre>
      </div>
    </motion.div>
  );
}

// 1. Full Landing Page Component
export default function Landing() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden selection:bg-[#FF00FF]/30">
      
      <AnimatePresence>
        {loading && <Preloader onComplete={() => setLoading(false)} />}
      </AnimatePresence>

      <Canvas camera={{ position: [0, 2, 12], fov: 45 }}>
        {/* Atmosphere: Blends into background to give infinite depth feeling */}
        <color attach="background" args={['#010204']} />
        <fog attach="fog" args={['#010204', 30, 90]} />

        {/* Global Post Processing Glows */}
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.4} mipmapBlur intensity={0.8} />
        </EffectComposer>

        {/* The 3D Scroll Rig (6 virtual screen heights to scroll through) */}
        {!loading && (
          <ScrollControls pages={6} damping={0.1}>
            <CinematicScene />

            {/* The HTML Overlay perfectly synced to the 3D scroll */}
            <Scroll html style={{ width: '100%', height: '100%' }}>
              
              {/* PAGE 1: HERO (0-100vh) */}
              <div className="w-screen h-screen flex flex-col items-center justify-center pointer-events-none relative">
                 <motion.div 
                   initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 1 }}
                   className="text-center px-6"
                 >
                   <h1 className="text-6xl md:text-8xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]" style={{textShadow: '0 0 15px rgba(255,255,255,0.5)'}}>
                     Optimize <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF00FF] to-[#00FFC6]">The Grid.</span>
                   </h1>
                   <p className="text-[#00FFC6] font-mono tracking-widest uppercase text-xs md:text-sm max-w-lg mx-auto bg-black/50 p-2 border border-[#00FFC6]/30 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,198,0.2)]">
                     &gt; Injecting intelligence into urban flow systems.
                   </p>
                 </motion.div>
                 <div className="absolute bottom-10 left-1/2 -translate-x-1/2 font-mono text-[10px] text-slate-500 uppercase tracking-widest animate-bounce">
                   scroll_down
                 </div>
              </div>

              {/* PAGE 2: NETWORK AWAKENS (100vh-200vh) */}
              <div className="w-screen h-screen flex items-center justify-start py-24 px-12 pointer-events-none">
                 <div className="max-w-md bg-black/60 border border-[#FF00FF]/40 p-8 backdrop-blur-xl shadow-[0_0_30px_rgba(255,0,255,0.2)]">
                    <Network className="w-8 h-8 text-[#FF00FF] mb-6 drop-shadow-[0_0_10px_#FF00FF]" />
                    <h2 className="text-3xl font-black text-white uppercase mb-4 tracking-tight">The Network Awakens</h2>
                    <p className="font-mono text-xs text-slate-400 leading-relaxed uppercase tracking-widest">
                       Mapping the physical topology into mathematical vectors. Every intersection becomes a neural node. Every vehicle becomes a floating particle tensor.
                    </p>
                 </div>
              </div>

              {/* PAGE 3: TRAFFIC SIMULATION (200vh-300vh) */}
              <div className="w-screen h-screen flex items-center justify-end py-24 px-12 pointer-events-none relative">
                 {/* Live Overlay Stats pinned to the top right of this section */}
                 <div className="absolute top-20 right-12 flex gap-4">
                    <div className="bg-[#00FFC6]/10 border border-[#00FFC6]/50 p-4 w-32 backdrop-blur-md">
                      <div className="text-[#00FFC6] font-black text-2xl mb-1">-28%</div>
                      <div className="font-mono text-[9px] uppercase tracking-widest text-slate-300">Avg Delay</div>
                    </div>
                    <div className="bg-[#FF00FF]/10 border border-[#FF00FF]/50 p-4 w-32 backdrop-blur-md">
                      <div className="text-[#FF00FF] font-black text-2xl mb-1">+40%</div>
                      <div className="font-mono text-[9px] uppercase tracking-widest text-slate-300">Throughput</div>
                    </div>
                 </div>

                 <div className="max-w-md bg-black/60 border border-[#00FFC6]/40 p-8 backdrop-blur-xl shadow-[0_0_30px_rgba(0,255,198,0.2)]">
                    <Activity className="w-8 h-8 text-[#00FFC6] mb-6 drop-shadow-[0_0_10px_#00FFC6]" />
                    <h2 className="text-3xl font-black text-white uppercase mb-4 tracking-tight">Vehicle Particle Flows</h2>
                    <p className="font-mono text-xs text-slate-400 leading-relaxed uppercase tracking-widest">
                       Real-time telemetry streams into the WebGL renderer. Watch congestions form organic red waves, mitigated instantly by PyTorch agents.
                    </p>
                 </div>
              </div>

              {/* PAGE 4 & 5: AI DECISIONS (300vh-500vh) */}
              <div className="w-screen h-[200vh] flex items-center justify-start px-12 pointer-events-none">
                 <div className="max-w-md bg-black/60 border border-yellow-500/40 p-8 backdrop-blur-xl shadow-[0_0_30px_rgba(234,179,8,0.2)] sticky top-1/2 -translate-y-1/2">
                    <Cpu className="w-8 h-8 text-yellow-500 mb-6 drop-shadow-[0_0_10px_#EAB308]" />
                    <h2 className="text-3xl font-black text-white uppercase mb-4 tracking-tight">EVP Override</h2>
                    <p className="font-mono text-xs text-slate-400 leading-relaxed uppercase tracking-widest mb-6">
                       The camera pushes out into the extruded map. Deep Q-Networks identify high-priority emergency corridors, forcefully preempting signals to form continuous Green Waves.
                    </p>
                    <div className="h-1 w-full bg-slate-800"><div className="h-full bg-yellow-500 w-full animate-pulse"/></div>
                 </div>
              </div>

              {/* PAGE 6: FINAL CTA PORTAL (500vh-600vh) */}
              <div className="w-screen h-screen flex flex-col items-center justify-center pointer-events-none">
                 <h2 className="text-5xl font-black text-white uppercase mb-8 tracking-widest drop-shadow-[0_0_20px_#FF00FF]">System Linked.</h2>
                 <a 
                   href="/dashboard" 
                   className="pointer-events-auto px-16 py-6 border-2 border-[#00FFC6] bg-[#00FFC6]/20 hover:bg-[#00FFC6]/40 text-[#00FFC6] font-mono text-xl uppercase tracking-widest font-black transition-all shadow-[0_0_30px_rgba(0,255,198,0.4)] hover:shadow-[0_0_50px_rgba(0,255,198,0.6)] backdrop-blur-md"
                 >
                   ENTER_MATRIX
                 </a>
                 <p className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mt-6">
                   &gt; Admin _Access _Granted
                 </p>
              </div>

            </Scroll>
          </ScrollControls>
        )}
      </Canvas>
      
    </div>
  );
}
