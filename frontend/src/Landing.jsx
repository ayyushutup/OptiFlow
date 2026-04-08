import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  ArrowRight,
  Terminal,
  Cpu,
  Zap,
  Activity,
  Globe
} from 'lucide-react';
import CyberGrid3D from './CyberGrid3D';

/* ─── High-Tech Preloader ─── */
const SystemPreloader = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("INITIALIZING_KERNELS...");

  const statuses = [
    "LOADING_MAP_GEOMETRY...",
    "CONNECTING_TO_DQN_AGENTS...",
    "HANDSHAKE_COMPLETE.",
    "SYSTEM_READY."
  ];

  useEffect(() => {
    let interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return 100;
        }
        const next = prev + Math.random() * 15;
        const statusIdx = Math.min(Math.floor((next / 100) * statuses.length), statuses.length - 1);
        setStatus(statuses[statusIdx]);
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#02040a] z-[10000] flex flex-col items-center justify-center p-12"
    >
      <div className="relative w-full max-w-sm">
        <div className="flex justify-between items-end mb-2 font-mono">
          <div className="text-[#00FFC6] text-[10px] tracking-widest uppercase font-bold">{status}</div>
          <div className="text-[#00FFC6] text-xs font-bold">{Math.floor(progress)}%</div>
        </div>
        <div className="h-[2px] w-full bg-white/5 relative overflow-hidden">
          <motion.div 
            className="absolute top-0 left-0 h-full bg-[#00FFC6] shadow-[0_0_10px_#00FFC6]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
};

/* ─── HUD Navbar ─── */
const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-[1000] px-12 py-10 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="text-[#00FFC6] font-black text-xl tracking-tighter flex items-center gap-2">
            <span className="opacity-50 tracking-normal">{'>_'}</span>
            <span className="text-cyber-glow-cyan tracking-widest uppercase italic">OptiFlow</span>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-12">
        <a href="#Specs" className="hud-tag text-white/50 hover:text-white transition-colors">System_Specs</a>
        <a href="#Architecture" className="hud-tag text-white/50 hover:text-white transition-colors">Architecture</a>
      </div>

      <Link to="/dashboard" className="px-5 py-2 border border-[#FF00FF] text-[#FF00FF] text-[10px] font-black uppercase tracking-widest hover:bg-[#FF00FF] hover:text-white transition-all shadow-[0_0_15px_rgba(255,0,255,0.2)] flex items-center gap-3 group">
        Init_Link
        <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
      </Link>
    </nav>
  );
};

export default function Landing() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="min-h-screen bg-[#02040a] text-white font-sans selection:bg-[#00FFC6] selection:text-black relative overflow-hidden">
      <AnimatePresence>
        {loading && <SystemPreloader onComplete={() => setLoading(false)} />}
      </AnimatePresence>

      <Navbar />

      <main className="max-w-7xl mx-auto px-12 pt-48 pb-32">
        <div className="flex flex-col lg:flex-row items-center gap-20">
          
          {/* Left Content */}
          <div className="flex-[1.5] relative z-10">
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="inline-flex items-center gap-3 px-3 py-1.5 rounded-xs border border-[#00FFC6]/60 bg-[#00FFC6]/10 text-[#00FFC6] hud-tag mb-12"
             >
                <div className="w-2 h-2 rounded-full bg-[#00FFC6] animate-pulse" />
                OptiFlow V2.0 Neural Net Online
             </motion.div>

             <motion.h1 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.1 }}
               className="text-7xl md:text-8xl font-black leading-[0.9] mb-12 uppercase italic"
             >
                Optimize the <br />
                <span className="text-[#FF00FF] text-cyber-glow-magenta">Grid.</span>
             </motion.h1>

             <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white/50 text-lg max-w-xl leading-relaxed mb-12 font-medium"
             >
                <span className="text-[#00FFC6] mr-2">{'>'}</span> 
                Injecting autonomous Deep Reinforcement Learning agents into the city's nervous system. 
                Optimizing traffic flow, overriding static signals, and forming emergency green corridors.
             </motion.p>

             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="flex flex-wrap items-center gap-6"
             >
                <Link to="/dashboard" className="px-10 py-4 border-cyber-cyan text-[#00FFC6] font-black uppercase tracking-[0.2em] text-xs hover:bg-[#00FFC6]/10 transition-all">
                    Enter_Matrix
                </Link>
                <button className="px-10 py-4 bg-white/5 text-white/50 font-black uppercase tracking-[0.2em] text-xs hover:bg-white/10 hover:text-white transition-all">
                    View_Docs
                </button>
             </motion.div>
          </div>

          {/* Right Visual */}
          <div className="flex-1 w-full h-[600px] relative">
            <div className="absolute inset-0 border border-[#FF00FF]/20 glass-card p-1">
                <CyberGrid3D />
                {/* HUD Details */}
                <div className="absolute top-6 left-6 text-[9px] font-mono text-[#00FFC6]/50 flex gap-4 uppercase font-bold tracking-widest">
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /></span>
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500" /></span>
                    <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /></span>
                </div>
                <div className="absolute top-6 right-6 text-[9px] font-mono text-white/30 uppercase font-black tracking-widest">
                    Sim_Engine.exe
                </div>
                <div className="absolute bottom-6 left-6 right-6 h-1 flex gap-4 px-4">
                    <div className="flex-1 bg-[#00FFC6]/60 shadow-[0_0_10px_#00FFC6]" />
                    <div className="flex-1 bg-white/5" />
                    <div className="flex-1 bg-[#FF00FF]/60 shadow-[0_0_10px_#FF00FF]" />
                </div>
            </div>
          </div>
        </div>

        {/* Global Footer Decoration */}
        <div className="mt-32 border-t border-white/5 pt-12">
            <div className="text-[#00FFC6] text-4xl font-black italic tracking-[0.3em] text-cyber-glow-cyan opacity-80 uppercase selection:bg-white selection:text-black">
                /// AI Systems
            </div>
        </div>
      </main>
    </div>
  );
}
