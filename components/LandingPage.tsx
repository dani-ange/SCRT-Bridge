
import React, { useState } from 'react';
import { LivingNeuronCanvas } from './LivingNeuronCanvas';

interface Props {
  onEnter: () => void;
}

export const LandingPage: React.FC<Props> = ({ onEnter }) => {
  const [exiting, setExiting] = useState(false);

  const handleStart = () => {
    setExiting(true);
    setTimeout(onEnter, 800); // Wait for animation
  };

  return (
    <div className={`fixed inset-0 z-[100] bg-[#020617] overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${exiting ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'}`}>
      
      {/* Background Neural Network - Elegant & Desaturated via CSS */}
      <div className="absolute inset-0 opacity-20 saturate-0 mix-blend-screen transition-opacity duration-1000">
        <LivingNeuronCanvas phase="PROCESSING" />
      </div>

      {/* Atmospheric Gradients */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020617]/80 to-[#020617] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020617_100%)] pointer-events-none"></div>

      {/* Floating Particles (CSS Only for lightweight atmosphere) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[128px] animate-[pulse_6s_infinite] mix-blend-screen pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] animate-[pulse_8s_infinite] delay-1000 mix-blend-screen pointer-events-none"></div>

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
        
        {/* Central Identity - Floating Animation */}
        <div className="relative mb-16 group animate-float">
            {/* Soft Glow behind logo */}
            <div className="absolute inset-0 bg-white/5 blur-[60px] rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
            
            <div className="relative w-28 h-28 mx-auto bg-white/5 backdrop-blur-2xl rounded-[2rem] border border-white/10 flex items-center justify-center shadow-2xl transition-transform duration-700 group-hover:scale-105 group-hover:border-white/20">
                <i className="fas fa-brain text-5xl text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"></i>
            </div>
            
            {/* Decorative Rings */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] border border-white/5 rounded-full animate-[spin_30s_linear_infinite]"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[180%] border border-white/5 rounded-full animate-[spin_40s_linear_infinite_reverse] opacity-50"></div>
        </div>

        {/* Typography - Cleaner & More Elegant with Staggered Entrance */}
        <div className="space-y-6 max-w-4xl relative">
            <h1 className="text-7xl md:text-8xl font-thin text-white tracking-tighter mb-2 animate-in" style={{ animationDelay: '200ms' }}>
              SCRT <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-slate-400 animate-pulse">vNext</span>
            </h1>
            
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent mx-auto animate-in" style={{ animationDelay: '400ms' }}></div>

            <p className="text-slate-400 text-sm md:text-base uppercase tracking-[0.4em] font-medium leading-relaxed animate-in" style={{ animationDelay: '600ms' }}>
              Semantic Convolutional Reasoning Tree
            </p>
        </div>

        {/* Start Button - Minimalist with Entrance Animation */}
        <div className="mt-20 relative animate-in" style={{ animationDelay: '800ms' }}>
            <button 
              onClick={handleStart}
              className="group relative px-16 py-6 bg-transparent overflow-hidden rounded-full transition-all duration-500 hover:tracking-widest"
            >
              <div className="absolute inset-0 border border-white/10 group-hover:border-white/30 rounded-full transition-colors duration-500"></div>
              <div className="absolute inset-0 bg-white/5 group-hover:bg-white/10 transition-colors duration-500 rounded-full blur-sm"></div>
              
              <span className="relative flex items-center gap-4 text-white/90 text-xs font-bold uppercase tracking-[0.25em] z-10 group-hover:text-white">
                Initialize
                <i className="fas fa-arrow-right text-[10px] opacity-50 group-hover:opacity-100 group-hover:translate-x-2 transition-all"></i>
              </span>
            </button>
            <p className="mt-6 text-[9px] text-slate-600 font-bold uppercase tracking-widest animate-in" style={{ animationDelay: '1000ms' }}>
                MedGemma Powered
            </p>
        </div>

      </div>
      
      {/* Bottom Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-8 flex justify-between items-end text-[10px] font-bold text-slate-700 uppercase tracking-widest pointer-events-none animate-in" style={{ animationDelay: '1200ms' }}>
          <div className="flex gap-4">
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> Secure Connection</span>
              <span className="text-slate-800">/</span>
              <span>Latency: 12ms</span>
          </div>
          <div className="text-right">
              System Ready
          </div>
      </div>
    </div>
  );
};
