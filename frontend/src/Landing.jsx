import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Map as MapIcon, Cpu, Zap, ArrowRight, Server, Box, Globe, ChevronRight, Database } from 'lucide-react';

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans overflow-x-hidden selection:bg-blue-500/30">
      
      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent ${scrolled ? 'bg-white/80 backdrop-blur-md border-slate-200/50 shadow-sm py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-[#0F172A]">OptiFlow</span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-medium text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors tracking-wide text-sm">Features</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors tracking-wide text-sm">How It Works</a>
            <a href="#impact" className="hover:text-blue-600 transition-colors tracking-wide text-sm">Impact</a>
          </div>
          <Link to="/dashboard" className="px-5 py-2.5 bg-[#0F172A] text-white text-sm font-semibold rounded-full hover:bg-slate-800 transition-all shadow-md hover:shadow-lg flex items-center gap-2 group">
            Open Dashboard
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-24 md:pt-52 md:pb-32 overflow-hidden">
        {/* Massive Background Text */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[15vw] font-black text-slate-200/40 select-none pointer-events-none tracking-tighter mix-blend-multiply z-0">
          OPTIFLOW
        </div>
        
        <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-8">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold tracking-wide uppercase mb-6 animate-fade-in-up">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                OptiFlow OS v2.0 Live
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#0F172A] leading-[1.1] mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                Optimize Traffic. <br />
                <span className="text-blue-600">In Real Time.</span>
              </h1>
              <p className="text-lg md:text-xl text-slate-500 mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                AI-powered traffic signal control that reduces congestion, minimizes emissions, and improves urban mobility through deep reinforcement learning.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                <Link to="/dashboard" className="px-8 py-4 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 w-full sm:w-auto text-center flex items-center justify-center gap-2 group">
                  Get Started
                </Link>
                <a href="#how-it-works" className="px-8 py-4 bg-white text-slate-700 rounded-full font-semibold border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm w-full sm:w-auto text-center flex items-center justify-center gap-2">
                  View Demo
                </a>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="flex-1 w-full animate-fade-in text-center mx-auto" style={{ animationDelay: '400ms' }}>
              <div className="relative mx-auto rounded-2xl bg-white border border-slate-200 shadow-2xl p-2 max-w-lg aspect-square lg:aspect-auto lg:h-[500px] flex items-center justify-center overflow-hidden group">
                <div className="absolute inset-0 bg-[#020617] opacity-5 group-hover:opacity-0 transition-opacity z-10" />
                {/* Abstract Simulation Visual */}
                <div className="w-full h-full rounded-xl bg-[#020617] relative overflow-hidden flex flex-col justify-between p-6">
                  {/* Fake Header */}
                  <div className="flex justify-between items-center opacity-50">
                    <div className="flex gap-2"><div className="w-3 h-3 rounded-full bg-red-500"/><div className="w-3 h-3 rounded-full bg-yellow-500"/><div className="w-3 h-3 rounded-full bg-green-500"/></div>
                    <div className="h-4 w-24 bg-slate-800 rounded" />
                  </div>
                  {/* Grid Lines */}
                  <div className="absolute inset-0 opacity-20 pointer-events-none flex flex-col justify-between p-12">
                     <div className="h-px w-full bg-sky-500/50 my-auto" />
                     <div className="h-px w-full bg-sky-500/50 my-auto" />
                  </div>
                  <div className="absolute inset-0 opacity-20 pointer-events-none flex justify-between p-12">
                     <div className="w-px h-full bg-sky-500/50 mx-auto" />
                     <div className="w-px h-full bg-sky-500/50 mx-auto" />
                  </div>
                  {/* Data Points */}
                  <div className="relative w-full h-48 flex items-center justify-center">
                    <div className="absolute w-24 h-24 rounded-full bg-blue-500/20 animate-pulse flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-blue-500" />
                    </div>
                    <Activity className="absolute text-blue-400 w-12 h-12" />
                  </div>
                  {/* Fake Footer Stats */}
                  <div className="flex justify-between items-center opacity-70">
                    <div className="space-y-1"><div className="h-2 w-12 bg-emerald-500/50 rounded"/><div className="h-2 w-8 bg-slate-700 rounded"/></div>
                    <div className="space-y-1"><div className="h-2 w-16 bg-blue-500/50 rounded"/><div className="h-2 w-10 bg-slate-700 rounded"/></div>
                    <div className="space-y-1"><div className="h-2 w-14 bg-rose-500/50 rounded"/><div className="h-2 w-12 bg-slate-700 rounded"/></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#0F172A] mb-4">Intelligence at Every Intersection</h2>
            <p className="text-lg text-slate-500">OptiFlow moves beyond static timers, dynamically adapting to traffic flows using state-of-the-art Deep Reinforcement Learning.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              icon={<Zap className="w-6 h-6 text-blue-600" />}
              title="Real-time Optimization"
              desc="Microsecond latency adjustments to signal phases based on live congestion data."
            />
            <FeatureCard 
              icon={<Cpu className="w-6 h-6 text-emerald-600" />}
              title="AI Priority Control"
              desc="Deep Q-Networks learn and evolve to handle unpredictable traffic patterns autonomously."
            />
            <FeatureCard 
              icon={<MapIcon className="w-6 h-6 text-indigo-600" />}
              title="Live Map Analytics"
              desc="Visualize flows, heatmaps, and grid performance globally via real-world telemetry."
            />
            <FeatureCard 
              icon={<Globe className="w-6 h-6 text-purple-600" />}
              title="Smart City Scalable"
              desc="Easily expand the simulation or live deployment to encompass entirely mapped cities."
            />
          </div>
        </div>
      </section>

      {/* Product Showcase */}
      <section className="py-32 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-[#0F172A] mb-8">Unprecedented Visibility.</h2>
          <p className="text-lg text-slate-500 mb-16 max-w-2xl mx-auto">Monitor system health, agent decisions, and congestion mitigation through a high-performance React telemetry dashboard.</p>
          
          <div className="relative mx-auto max-w-5xl">
            {/* Simple Laptop Outline */}
            <div className="rounded-t-2xl border-t-[8px] border-x-[8px] border-b-0 border-slate-800 bg-slate-800 p-2 shadow-2xl relative">
              <div className="bg-[#020617] rounded-xl overflow-hidden aspect-[16/10] relative">
                  {/* Simulate Dashboard UI Minimal */}
                  <div className="absolute inset-0 flex">
                     <div className="flex-[3] bg-[#050B14] relative flex items-center justify-center p-8">
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-400 via-transparent to-transparent pointer-events-none" />
                        <div className="text-blue-500/20 font-black text-6xl tracking-widest uppercase">OptiMap view</div>
                        <div className="absolute bottom-4 left-4 flex gap-2">
                           <div className="w-8 h-8 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                           <div className="w-8 h-8 rounded-full bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                        </div>
                     </div>
                     <div className="w-1/4 bg-[#0A111F] border-l border-white/5 p-6 flex flex-col gap-4">
                        <div className="w-full h-8 bg-slate-800 rounded-md" />
                        <div className="w-full h-24 bg-slate-800/50 rounded-xl mt-4" />
                        <div className="w-full h-24 bg-slate-800/50 rounded-xl" />
                        <div className="w-full h-24 bg-slate-800/50 rounded-xl" />
                     </div>
                  </div>
              </div>
            </div>
            <div className="h-4 w-[110%] -hover:translate-x-[5%] -ml-[5%] bg-slate-300 rounded-b-xl shadow-xl z-20 relative border-t border-slate-400" />
            <div className="h-2 w-32 mx-auto bg-slate-200 rounded-b-lg shadow-sm" />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#0F172A] mb-4">How It Works</h2>
            <p className="text-lg text-slate-500">A seamless integration from road reality to algorithmic decision.</p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-12 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-[2px] bg-slate-100 -translate-y-1/2 z-0" />
            
            <StepCard 
              number="01"
              title="Data Ingestion"
              desc="Real-world geometry and vehicle positions are streamed into the backend environment."
              icon={<Database className="w-5 h-5" />}
            />
            <StepCard 
              number="02"
              title="Decision Engine"
              desc="DQN Agents process queue lengths and output optimal phase changes."
              icon={<Server className="w-5 h-5" />}
            />
            <StepCard 
              number="03"
              title="Actuation"
              desc="The simulation applies the green waves, immediately routing traffic efficiently."
              icon={<Box className="w-5 h-5" />}
            />
          </div>
        </div>
      </section>

      {/* Impact */}
      <section id="impact" className="py-24 bg-[#0F172A] text-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6 leading-tight">Tangible Impact. <br/><span className="text-blue-400">Measurable Results.</span></h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                Traditional static timers handle average delays poorly. By transitioning to AI-controlled reinforcement agents, cities can dynamically react to bottlenecks, accidents, and rush-hour spikes.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-3 text-slate-300">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">✓</div>
                  Up to 30% reduction in intersection wait times
                </li>
                <li className="flex items-center gap-3 text-slate-300">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">✓</div>
                  Lower vehicle emissions from reduced idling
                </li>
                <li className="flex items-center gap-3 text-slate-300">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">✓</div>
                  Better coordination through emergent green waves
                </li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 hover:border-blue-500/50 transition-colors">
                <div className="text-4xl font-bold text-white mb-2">-28%</div>
                <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Queue Length</div>
              </div>
              <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 hover:border-blue-500/50 transition-colors mt-8">
                <div className="text-4xl font-bold text-white mb-2">+15%</div>
                <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Throughput</div>
              </div>
              <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 hover:border-blue-500/50 transition-colors">
                <div className="text-4xl font-bold text-white mb-2">24/7</div>
                <div className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Optimization</div>
              </div>
              <div className="bg-blue-600 p-8 rounded-2xl border border-blue-500 mt-8 flex flex-col justify-center items-start shadow-xl shadow-blue-900/50">
                <Activity className="w-8 h-8 text-white mb-4 opacity-80" />
                <div className="text-xl font-bold text-white">Live Data</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 bg-blue-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400 via-blue-600 to-blue-800 opacity-60" />
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-8">Smarter Traffic Starts Here.</h2>
          <p className="text-xl text-blue-100 mb-10">Join the simulation and see how RL agents handle the city grid.</p>
          <Link to="/dashboard" className="px-10 py-5 bg-white text-blue-600 rounded-full font-bold text-lg hover:bg-slate-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 inline-flex items-center gap-2 group">
            Launch Simulation
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0F172A] py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-lg tracking-tight text-white">OptiFlow</span>
          </div>
          <p className="text-slate-500 text-sm">© {new Date().getFullYear()} OptiFlow Labs. Traffic AI Simulation.</p>
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 hover:border-blue-100 hover:bg-white hover:shadow-xl transition-all duration-300 group">
      <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-[#0F172A] mb-3">{title}</h3>
      <p className="text-slate-500 leading-relaxed text-sm">{desc}</p>
    </div>
  );
}

function StepCard({ number, title, desc, icon }) {
  return (
    <div className="flex-1 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative z-10 hover:shadow-lg transition-shadow">
      <div className="text-5xl font-black text-slate-100 mb-6 font-mono -ml-2 select-none tracking-tighter">{number}</div>
      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-[#0F172A] mb-3">{title}</h3>
      <p className="text-slate-500 leading-relaxed text-sm">{desc}</p>
    </div>
  );
}
