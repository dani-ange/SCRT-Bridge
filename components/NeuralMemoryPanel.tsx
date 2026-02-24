
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SCRTStore, SCRTInferenceResult, SCRTNode } from '../types';

interface Props {
  store: SCRTStore;
  inferenceResults: SCRTInferenceResult[];
  isReasoningMode?: boolean;
  activeTokenIndex?: number; 
}

interface NeuronEntity {
  id: string;
  x: number;
  y: number;
  vx: number; // Velocity X
  vy: number; // Velocity Y
  radius: number;
  data: SCRTNode;
  conceptIds: Set<string>;
  score: number;
  dendriteOffsets: number[]; 
  creationTime?: number;
}

interface Connection {
  sourceId: string;
  targetId: string;
  sharedConcepts: { id: string, label: string }[];
  strength: number; 
  midX: number;
  midY: number;
}

interface SignalParticle {
  id: number;
  sourceId: string;
  targetId: string;
  startTime: number;
  duration: number;
  color: string;
}

function getQuadraticBezierPoint(t: number, x1: number, y1: number, cpX: number, cpY: number, x2: number, y2: number) {
  const invT = 1 - t;
  const x = invT * invT * x1 + 2 * invT * t * cpX + t * t * x2;
  const y = invT * invT * y1 + 2 * invT * t * cpY + t * t * x2;
  return { x, y };
}

export const NeuralMemoryPanel: React.FC<Props> = ({ store, inferenceResults, isReasoningMode = false, activeTokenIndex = -1 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const neuronsRef = useRef<NeuronEntity[]>([]);
  const connectionsRef = useRef<Connection[]>([]);
  const signalsRef = useRef<SignalParticle[]>([]);
  
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<Connection | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [reactionPulse, setReactionPulse] = useState(0);

  const cameraRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const timeRef = useRef(0);

  const getConceptIds = (node: SCRTNode): Set<string> => {
      const s = node.clinique?.symptomes?.map(x => x.concept_id) || [];
      const si = node.clinique?.signes?.map(x => x.concept_id) || [];
      const synd = node.syndromes || [];
      return new Set([...s, ...si, ...synd]);
  };

  const getConceptLabel = (id: string): string => {
      const fromStore = store.concept_store?.concepts?.find(c => c.concept_id === id);
      if (fromStore) return fromStore.label;
      return id; 
  };

  useEffect(() => {
    if (activeTokenIndex >= 0) {
      setReactionPulse(1.0);
    }
  }, [activeTokenIndex]);

  // Sync Neurons
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    const currentIds = new Set(store.nodes.map(n => n.node_id));
    // Remove deleted
    neuronsRef.current = neuronsRef.current.filter(n => currentIds.has(n.id));

    store.nodes.forEach(node => {
        let entity = neuronsRef.current.find(n => n.id === node.node_id);
        const score = inferenceResults.find(r => r.node.node_id === node.node_id)?.score || 0;
        const conceptIds = getConceptIds(node);

        if (!entity) {
            // Initial Placement: Try to avoid immediate overlap
            const radius = 32 + Math.random() * 8;
            let x = Math.random() * (width - 100) + 50;
            let y = Math.random() * (height - 100) + 50;

            entity = {
                id: node.node_id,
                x, y,
                vx: (Math.random() - 0.5) * 0.2, // Very low initial velocity
                vy: (Math.random() - 0.5) * 0.2,
                radius: radius, 
                data: node,
                conceptIds,
                score,
                dendriteOffsets: Array.from({length: 15}, () => Math.random() * Math.PI * 2),
                creationTime: timeRef.current
            };
            neuronsRef.current.push(entity);
            if (neuronsRef.current.length > 1) setReactionPulse(0.5);
        } else {
            entity.data = node;
            entity.conceptIds = conceptIds;
            entity.score = score;
        }
    });

    const newConnections: Connection[] = [];
    const entities = neuronsRef.current;
    
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const n1 = entities[i];
            const n2 = entities[j];
            const sharedLabels: { id: string, label: string }[] = [];
            n1.conceptIds.forEach(id => {
                if (n2.conceptIds.has(id)) {
                    sharedLabels.push({ id, label: getConceptLabel(id) });
                }
            });

            if (sharedLabels.length > 0) {
                newConnections.push({
                    sourceId: n1.id,
                    targetId: n2.id,
                    sharedConcepts: sharedLabels,
                    strength: Math.min(sharedLabels.length / 3, 1),
                    midX: (n1.x + n2.x) / 2,
                    midY: (n1.y + n2.y) / 2
                });
            }
        }
    }
    connectionsRef.current = newConnections;
  }, [store.nodes, inferenceResults]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let signalIdCounter = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      setMousePos({ x: mouseX, y: mouseY }); 
      
      const testX = mouseX - cameraRef.current.x;
      const testY = mouseY - cameraRef.current.y;

      let foundNode: string | null = null;
      // Reverse check for z-index (top first)
      for (let i = neuronsRef.current.length - 1; i >= 0; i--) {
          const n = neuronsRef.current[i];
          if ((n.x - testX) ** 2 + (n.y - testY) ** 2 < (n.radius * 2) ** 2) { 
             foundNode = n.id;
             break;
          }
      }
      setHoveredNodeId(foundNode);

      if (!foundNode) {
          let foundConn: Connection | null = null;
          for (const conn of connectionsRef.current) {
              const dx = conn.midX - testX;
              const dy = conn.midY - testY;
              if (Math.sqrt(dx*dx + dy*dy) < 40) {
                  foundConn = conn;
                  break;
              }
          }
          setHoveredConnection(foundConn);
      } else {
          setHoveredConnection(null);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    const spawnSignal = (sourceId: string, targetId: string, color: string) => {
        signalIdCounter++;
        signalsRef.current.push({
            id: signalIdCounter,
            sourceId,
            targetId,
            startTime: timeRef.current,
            duration: 800 + Math.random() * 400,
            color
        });
    };

    const updatePhysics = (width: number, height: number) => {
        const entities = neuronsRef.current;
        const repulsionRadius = 100;
        const k = 0.05; // Repulsion constant

        // 1. Collision & Repulsion
        for (let i = 0; i < entities.length; i++) {
            for (let j = i + 1; j < entities.length; j++) {
                const n1 = entities[i];
                const n2 = entities[j];
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const minDist = n1.radius + n2.radius + 20; // Margin

                if (dist < minDist && dist > 0) {
                    // Collision resolution: Push apart
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    
                    const force = overlap * 0.05; // Gentle push
                    
                    n1.vx -= nx * force;
                    n1.vy -= ny * force;
                    n2.vx += nx * force;
                    n2.vy += ny * force;
                }
            }
        }

        // 2. Wall bounds (Soft boundaries)
        const margin = 80;
        entities.forEach(n => {
            if (n.x < margin) n.vx += 0.05;
            if (n.x > width - margin) n.vx -= 0.05;
            if (n.y < margin) n.vy += 0.05;
            if (n.y > height - margin) n.vy -= 0.05;

            // Apply Velocity
            n.x += n.vx;
            n.y += n.vy;

            // Damping (Friction)
            n.vx *= 0.92;
            n.vy *= 0.92;

            // Cap extremely slow movement to strictly static if desired, 
            // but keeping tiny drift ("living") is requested.
            // Add very subtle organic noise
            n.x += (Math.random() - 0.5) * 0.1;
            n.y += (Math.random() - 0.5) * 0.1;
        });
    };

    const drawRealisticNeuron = (n: NeuronEntity, timestamp: number, isActive: boolean, isHovered: boolean) => {
        const x = n.x + cameraRef.current.x;
        const y = n.y + cameraRef.current.y;
        const radius = n.radius;
        const isFocus = isActive || isHovered;
        
        // Supernova bloom for new arrival
        const age = timestamp - (n.creationTime || 0);
        const bloom = age < 3000 ? (1 - age / 3000) * 3 : 0;

        const pulseSpeed = isActive ? 0.008 : 0.002;
        const pulse = Math.sin(timestamp * pulseSpeed + (n.x * 0.01)) * 0.05 + 1; // Randomized phase by position
        const currentRadius = Math.max(0.1, radius * pulse * (isFocus ? 1.1 : 1));

        // Dendrites rendering (organic)
        if (isReasoningMode) {
            ctx.beginPath();
            const dendriteCount = 12; 
            for (let i = 0; i < dendriteCount; i++) {
                const angleBase = (i / dendriteCount) * Math.PI * 2;
                const sway = Math.sin(timestamp * 0.001 + n.dendriteOffsets[i]) * 0.15; 
                const angle = angleBase + sway;
                const len = currentRadius * (isActive ? 3.5 : 2.0); 
                
                const startX = x + Math.cos(angle) * (currentRadius * 0.3);
                const startY = y + Math.sin(angle) * (currentRadius * 0.3);
                
                const cp1X = x + Math.cos(angle - 0.15) * (len * 0.5);
                const cp1Y = y + Math.sin(angle - 0.15) * (len * 0.5);
                
                const endX = x + Math.cos(angle) * len;
                const endY = y + Math.sin(angle) * len;
                
                ctx.moveTo(startX, startY);
                ctx.quadraticCurveTo(cp1X, cp1Y, endX, endY);
            }
            ctx.strokeStyle = isActive ? `rgba(251, 191, 36, ${0.8 + bloom})` : (isFocus ? 'rgba(129, 140, 248, 0.6)' : 'rgba(148, 163, 184, 0.1)');
            ctx.lineWidth = isActive ? 2.5 : 1;
            ctx.stroke();
        }

        // Bio-Soma (Main Body)
        ctx.save();
        if (bloom > 0) {
            ctx.shadowBlur = 50 * bloom;
            ctx.shadowColor = 'rgba(99, 102, 241, 0.8)';
        }
        
        ctx.beginPath();
        ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(x - currentRadius*0.3, y - currentRadius*0.3, 0.01, x, y, currentRadius * 1.5);
        
        if (isActive) {
            grad.addColorStop(0, '#fef3c7'); grad.addColorStop(0.5, '#f59e0b'); grad.addColorStop(1, 'rgba(180, 83, 9, 0)');
        } else if (isFocus) {
            grad.addColorStop(0, '#e0e7ff'); grad.addColorStop(0.5, '#6366f1'); grad.addColorStop(1, 'rgba(67, 56, 202, 0)');
        } else {
            grad.addColorStop(0, '#1e293b'); grad.addColorStop(0.5, '#0f172a'); grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        }
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Nucleus
        ctx.beginPath();
        ctx.arc(x, y, currentRadius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)';
        ctx.fill();

        if (isFocus || (isActive && isReasoningMode)) {
            ctx.font = `bold ${isActive ? '14px' : '11px'} "Plus Jakarta Sans", sans-serif`;
            ctx.textAlign = 'center';
            const text = n.data.pathology;
            const metrics = ctx.measureText(text);
            const w = metrics.width + 16;
            ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
            ctx.beginPath();
            ctx.roundRect(x - w/2, y + currentRadius + 15, w, 24, 6);
            ctx.fill();
            ctx.fillStyle = isActive ? '#fbbf24' : '#e2e8f0';
            ctx.fillText(text, x, y + currentRadius + 32);
        }
    };

    const render = (timestamp: number) => {
      if (!containerRef.current) return;
      timeRef.current = timestamp;
      const width = canvas.width = containerRef.current.clientWidth;
      const height = canvas.height = containerRef.current.clientHeight;

      updatePhysics(width, height);

      const activeNeurons = neuronsRef.current.filter(n => n.score > 0);
      if (isReasoningMode && activeNeurons.length > 0) {
          const sumX = activeNeurons.reduce((acc, n) => acc + n.x, 0);
          const sumY = activeNeurons.reduce((acc, n) => acc + n.y, 0);
          cameraRef.current.targetX = width / 2 - sumX / activeNeurons.length;
          cameraRef.current.targetY = height / 2 - sumY / activeNeurons.length;
      } else {
          cameraRef.current.targetX = 0;
          cameraRef.current.targetY = 0;
      }
      
      cameraRef.current.x += (cameraRef.current.targetX - cameraRef.current.x) * 0.08;
      cameraRef.current.y += (cameraRef.current.targetY - cameraRef.current.y) * 0.08;

      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      // Global Shockwave
      if (reactionPulse > 0) {
          ctx.beginPath();
          const pRadius = 50 + (1.5 - reactionPulse) * (Math.min(width, height) * 0.9);
          ctx.arc(width/2, height/2, pRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(99, 102, 241, ${reactionPulse * 0.4})`;
          ctx.lineWidth = 2 + reactionPulse * 10;
          ctx.stroke();
          setReactionPulse(p => Math.max(0, p - 0.02));
      }

      // Synaptic Connections
      connectionsRef.current.forEach(conn => {
          const n1 = neuronsRef.current.find(n => n.id === conn.sourceId);
          const n2 = neuronsRef.current.find(n => n.id === conn.targetId);
          if (!n1 || !n2) return;
          const isActive = n1.score > 0 && n2.score > 0;
          const isHov = hoveredConnection === conn;
          const n1x = n1.x + cameraRef.current.x;
          const n1y = n1.y + cameraRef.current.y;
          const n2x = n2.x + cameraRef.current.x;
          const n2y = n2.y + cameraRef.current.y;
          
          const dx = n2x - n1x; const dy = n2y - n1y; const dist = Math.sqrt(dx*dx + dy*dy); const angle = Math.atan2(dy, dx);
          const curveAmount = 30 + dist * 0.1;
          const cpX = (n1x + n2x) / 2 + Math.cos(angle - Math.PI/2) * curveAmount;
          const cpY = (n1y + n2y) / 2 + Math.sin(angle - Math.PI/2) * curveAmount;
          
          conn.midX = (n1x + n2x) / 2 + Math.cos(angle - Math.PI/2) * (curveAmount/2) - cameraRef.current.x;
          conn.midY = (n1y + n2y) / 2 + Math.sin(angle - Math.PI/2) * (curveAmount/2) - cameraRef.current.y;

          ctx.beginPath();
          ctx.moveTo(n1x, n1y);
          ctx.quadraticCurveTo(cpX, cpY, n2x, n2y);
          if (isActive) {
              ctx.strokeStyle = `rgba(251, 191, 36, 0.8)`; ctx.lineWidth = 3 + conn.strength * 4;
              ctx.shadowBlur = 8; ctx.shadowColor = '#fbbf24';
              if (Math.random() > 0.95) spawnSignal(n1.id, n2.id, '#fbbf24');
          } else if (isHov) {
              ctx.strokeStyle = `rgba(99, 102, 241, 0.8)`; ctx.lineWidth = 4;
          } else {
              ctx.strokeStyle = `rgba(148, 163, 184, ${0.05 + conn.strength * 0.1})`; ctx.lineWidth = 1 + conn.strength;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
      });

      // Bio-Signals
      signalsRef.current = signalsRef.current.filter(s => timeRef.current - s.startTime < s.duration);
      signalsRef.current.forEach(s => {
          const n1 = neuronsRef.current.find(n => n.id === s.sourceId);
          const n2 = neuronsRef.current.find(n => n.id === s.targetId);
          if (!n1 || !n2) return;
          const progress = (timeRef.current - s.startTime) / s.duration;
          const dx = n2.x - n1.x; const dy = n2.y - n1.y; const dist = Math.sqrt(dx*dx + dy*dy); const angle = Math.atan2(dy, dx);
          const curveAmount = 30 + dist * 0.1;
          const cpX = (n1.x + n2.x) / 2 + Math.cos(angle - Math.PI/2) * curveAmount;
          const cpY = (n1.y + n2.y) / 2 + Math.sin(angle - Math.PI/2) * curveAmount;
          const pos = getQuadraticBezierPoint(progress, n1.x + cameraRef.current.x, n1.y + cameraRef.current.y, cpX + cameraRef.current.x, cpY + cameraRef.current.y, n2.x + cameraRef.current.x, n2.y + cameraRef.current.y);
          ctx.shadowBlur = 10; ctx.shadowColor = s.color; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      });

      // Z-Sort so hovered is on top
      const sortedNeurons = [...neuronsRef.current].sort((a, b) => {
          if (a.id === hoveredNodeId) return 1;
          if (b.id === hoveredNodeId) return -1;
          return 0;
      });

      sortedNeurons.forEach(n => drawRealisticNeuron(n, timeRef.current, n.score > 0, n.id === hoveredNodeId));
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => {
        cancelAnimationFrame(animationId);
        canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isReasoningMode, reactionPulse, hoveredConnection]);

  const hoveredNeuron = useMemo(() => neuronsRef.current.find(n => n.id === hoveredNodeId), [hoveredNodeId]);

  return (
    <div ref={containerRef} className="h-full w-full relative bg-[#020617] overflow-hidden flex flex-col">
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair" />
      
      {/* Bio-Neuron Detailed Tooltip */}
      {hoveredNeuron && (
          <div className="absolute z-50 pointer-events-none p-8 glass bg-slate-900/95 rounded-[3.5rem] border border-indigo-500/40 text-white w-[26rem] shadow-[0_0_80px_rgba(99,102,241,0.25)] animate-in"
               style={{ left: Math.min(mousePos.x + 30, window.innerWidth - 450), top: Math.min(mousePos.y + 30, window.innerHeight - 300) }}>
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Semantic Network</span>
                <span className="text-[10px] font-black text-white/30 tracking-[0.2em]">{hoveredNeuron.id.substring(0, 10)}...</span>
              </div>
              <div className="text-3xl font-black mb-4 text-white tracking-tighter leading-tight">{hoveredNeuron.data.pathology}</div>
              <div className="h-px bg-white/10 my-6"></div>
              <div className="text-[12px] leading-relaxed text-slate-300 italic mb-6 font-medium line-clamp-4">
                  {hoveredNeuron.data.contexte?.definition || "Structural data analysis in progress."}
              </div>
              <div className="flex flex-wrap gap-2.5">
                  <span className="text-[10px] bg-indigo-600/60 px-4 py-2 rounded-xl font-black uppercase border border-indigo-400/30 tracking-widest">{hoveredNeuron.data.specialty}</span>
                  {hoveredNeuron.score > 0 && <span className="text-[10px] bg-amber-600/60 px-4 py-2 rounded-xl font-black uppercase border border-amber-400/30 tracking-widest text-amber-50">Score: {hoveredNeuron.score.toFixed(1)}</span>}
              </div>
          </div>
      )}

      {/* Connection / Synapse Tooltip */}
      {hoveredConnection && (
          <div className="absolute z-50 pointer-events-none p-7 glass bg-indigo-950/90 rounded-[3rem] border border-indigo-400/40 text-white w-80 shadow-[0_0_60px_rgba(99,102,241,0.3)] animate-in"
               style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}>
              <div className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] mb-4">Synaptic Bridge</div>
              <div className="text-[10px] text-white/50 mb-3 font-bold">Shared concepts:</div>
              <div className="flex flex-wrap gap-2 mb-4">
                  {hoveredConnection.sharedConcepts.slice(0, 5).map(c => (
                      <span key={c.id} className="text-[9px] bg-indigo-500/40 text-white px-2 py-1 rounded-lg border border-white/10 font-black uppercase tracking-wide">{c.label}</span>
                  ))}
                  {hoveredConnection.sharedConcepts.length > 5 && <span className="text-[9px] text-white/50 px-2 py-1">+{hoveredConnection.sharedConcepts.length - 5}</span>}
              </div>
          </div>
      )}

      {/* Brain Static UI */}
      <div className="absolute top-6 left-6 pointer-events-none">
          <div className="bg-slate-900/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 flex items-center gap-3">
              <i className="fas fa-brain text-indigo-500 animate-pulse"></i>
              <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Semantic Cortex v12</span>
          </div>
      </div>

      {/* NEW: Visual Legend */}
      <div className="absolute top-6 right-6 z-40 group pointer-events-auto">
        <div className="bg-slate-900/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 flex items-center gap-3 cursor-help hover:bg-slate-800/60 transition-colors shadow-lg">
            <i className="fas fa-info-circle text-slate-400 group-hover:text-indigo-400 transition-colors"></i>
            <span className="text-[10px] font-black text-slate-400 group-hover:text-white uppercase tracking-widest transition-colors">Visual Legend</span>
        </div>

        <div className="absolute right-0 top-12 w-72 bg-slate-950/95 p-6 rounded-3xl border border-white/10 shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto transform translate-y-2 group-hover:translate-y-0 backdrop-blur-xl">
            <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-4 border-b border-white/10 pb-2">Neural Encoding</h4>
            
            <div className="space-y-4">
                <div className="flex gap-3 items-start">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-200 to-amber-600 shadow-[0_0_8px_rgba(251,191,36,0.6)] flex-shrink-0 mt-0.5"></div>
                    <div>
                        <div className="text-[10px] font-black text-amber-400 uppercase">Active Node</div>
                        <p className="text-[9px] text-slate-400 leading-relaxed font-medium">Pathology with high inference score based on input.</p>
                    </div>
                </div>

                <div className="flex gap-3 items-start">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-300 to-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.6)] flex-shrink-0 mt-0.5"></div>
                    <div>
                        <div className="text-[10px] font-black text-indigo-400 uppercase">Focused Node</div>
                        <p className="text-[9px] text-slate-400 leading-relaxed font-medium">Currently hovered entity for inspection.</p>
                    </div>
                </div>

                <div className="flex gap-3 items-start">
                    <div className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 flex-shrink-0 mt-0.5"></div>
                    <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase">Latent Node</div>
                        <p className="text-[9px] text-slate-500 leading-relaxed font-medium">Dormant knowledge in long-term memory.</p>
                    </div>
                </div>

                <div className="h-px bg-white/5 my-2"></div>

                <div className="flex gap-3 items-start">
                    <div className="w-4 flex items-center justify-center flex-shrink-0 mt-1.5">
                        <div className="w-full h-0.5 bg-amber-500 rounded-full shadow-[0_0_4px_rgba(251,191,36,0.8)]"></div>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-white uppercase">Synaptic Link</div>
                        <p className="text-[9px] text-slate-400 leading-relaxed font-medium">Thickness = Semantic strength (shared symptoms).</p>
                    </div>
                </div>

                <div className="flex gap-3 items-start">
                    <div className="w-4 flex items-center justify-center flex-shrink-0 mt-1">
                        <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_4px_white]"></div>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-white uppercase">Signal Impulse</div>
                        <p className="text-[9px] text-slate-400 leading-relaxed font-medium">Active reasoning flow transferring activation.</p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
