
import React, { useRef, useEffect } from 'react';

type IngestionPhase = 'INPUT' | 'PROCESSING' | 'EXTRACTION' | 'SYNTHESIS' | 'COMPLETE';

interface Props {
  phase: IngestionPhase;
  pulseIndex?: number;
  variant?: 'default' | 'embryo';
}

interface Node {
  x: number;
  y: number;
  radius: number;
  connections: number[];
  activation: number;
  phaseOffset: number;
}

export const LivingNeuronCanvas: React.FC<Props> = ({ phase, pulseIndex = 0, variant = 'default' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef(0);
  const flashIntensityRef = useRef(0);
  const growthRef = useRef(0); // 0 to 1 progress for embryo

  // Trigger flash when pulseIndex increases
  useEffect(() => {
    if (pulseIndex > pulseRef.current) {
        flashIntensityRef.current = 1.0;
        pulseRef.current = pulseIndex;
    }
  }, [pulseIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width;
    let height = canvas.height;
    let animationId: number;
    let time = 0;
    
    // Neural Network State (Default View)
    const nodes: Node[] = [];

    const initNetwork = () => {
      nodes.length = 0;
      const density = 0.00018; 
      const count = Math.floor(width * height * density);
      const paddingX = width * 0.15;
      const paddingY = height * 0.15;

      for (let i = 0; i < count; i++) {
        let x, y, overlap;
        let attempts = 0;
        do {
            x = paddingX + Math.random() * (width - paddingX * 2);
            y = paddingY + Math.random() * (height - paddingY * 2);
            overlap = false;
            for (const n of nodes) {
                const dx = n.x - x;
                const dy = n.y - y;
                if (Math.sqrt(dx*dx + dy*dy) < 50) overlap = true;
            }
            attempts++;
        } while(overlap && attempts < 50);

        if (!overlap || attempts >= 50) {
            nodes.push({
                x, y,
                radius: 4 + Math.random() * 7, 
                connections: [],
                activation: Math.random() * 0.5, 
                phaseOffset: Math.random() * Math.PI * 2
            });
        }
      }

      nodes.forEach((node, i) => {
         nodes.forEach((target, j) => {
             if (i === j) return;
             const dx = node.x - target.x;
             const dy = node.y - target.y;
             const dist = Math.sqrt(dx*dx + dy*dy);
             if (dist < 180 && Math.random() > 0.5) { 
                 node.connections.push(j);
             }
         });
      });
    };

    const init = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
      if (variant === 'default') initNetwork();
    };

    // --- RENDERERS ---

    const drawLightning = () => {
        if (flashIntensityRef.current <= 0.05) return;
        const count = 3;
        for(let k=0; k<count; k++) {
            const srcIdx = Math.floor(Math.random() * nodes.length);
            const tgtIdx = Math.floor(Math.random() * nodes.length);
            if (srcIdx === tgtIdx) continue;
            
            const n1 = nodes[srcIdx];
            const n2 = nodes[tgtIdx];
            
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            const dist = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2);
            const steps = Math.floor(dist / 15);
            
            for(let i=1; i<steps; i++) {
                const t = i/steps;
                const idealX = n1.x + (n2.x-n1.x)*t;
                const idealY = n1.y + (n2.y-n1.y)*t;
                const offset = 30 * flashIntensityRef.current;
                ctx.lineTo(idealX + (Math.random()-0.5)*offset, idealY + (Math.random()-0.5)*offset);
            }
            ctx.lineTo(n2.x, n2.y);
            
            const alpha = flashIntensityRef.current;
            ctx.strokeStyle = `rgba(220, 255, 255, ${alpha})`;
            ctx.lineWidth = 3 * alpha;
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 30 * alpha;
            ctx.stroke();
            ctx.shadowBlur = 0;
            
            ctx.beginPath();
            ctx.arc(n2.x, n2.y, n2.radius * 4 * alpha, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fill();
        }
    };

    const drawOrganicLine = (x1: number, y1: number, x2: number, y2: number, strength: number, activation: number) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        const midX = (x1 + x2) / 2 + Math.cos(angle + Math.PI/2) * (Math.sin(time * 0.001 + x1) * 15);
        const midY = (y1 + y2) / 2 + Math.sin(angle + Math.PI/2) * (Math.cos(time * 0.001 + y1) * 15);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        
        const flashBoost = flashIntensityRef.current * 0.5;
        const alpha = 0.5 + strength * 0.4 + activation * 0.8 + flashBoost;
        ctx.strokeStyle = `rgba(${180 + activation * 75}, ${230 + flashBoost * 25}, 255, ${Math.min(1, alpha)})`;
        ctx.lineWidth = 1.5 + strength + activation * 2 + flashBoost * 2;
        ctx.stroke();
    };

    const renderDefault = () => {
        if (flashIntensityRef.current > 0) {
            flashIntensityRef.current -= 0.04; 
            if (flashIntensityRef.current < 0) flashIntensityRef.current = 0;
        }
        const flash = flashIntensityRef.current;

        ctx.fillStyle = flash > 0 ? `rgba(10, 20, 45, ${1 - flash * 0.2})` : '#020617';
        ctx.fillRect(0, 0, width, height);
        
        const grad = ctx.createRadialGradient(width/2, height/2, width/2, width/2, height/2, width);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(2, 6, 23, 0.6)');
        
        let globalActivity = 0;
        let connectionGrowth = 0;

        if (phase === 'INPUT') globalActivity = 0.1;
        if (phase === 'PROCESSING') { globalActivity = 0.3; connectionGrowth = 0.4; }
        if (phase === 'EXTRACTION') { globalActivity = 0.6; connectionGrowth = 0.8; }
        if (phase === 'SYNTHESIS') { globalActivity = 0.9; connectionGrowth = 1.0; }
        if (phase === 'COMPLETE') { globalActivity = 0.2; connectionGrowth = 1.0; }
        globalActivity += flash * 0.5;

        nodes.forEach((node, i) => {
            const cx = node.x + Math.sin(time * 0.0005 + node.phaseOffset) * 3;
            const cy = node.y + Math.cos(time * 0.0005 + node.phaseOffset) * 3;

            const active = Math.random() < globalActivity ? 1 : 0;
            node.activation += (active - node.activation) * 0.08; 

            node.connections.forEach(targetIdx => {
                if (targetIdx > i) { 
                    const target = nodes[targetIdx];
                    const tx = target.x + Math.sin(time * 0.0005 + target.phaseOffset) * 3;
                    const ty = target.y + Math.cos(time * 0.0005 + target.phaseOffset) * 3;
                    
                    if (Math.random() < connectionGrowth) {
                        drawOrganicLine(cx, cy, tx, ty, connectionGrowth * 0.5, (node.activation + target.activation)/2);
                    }
                }
            });

            ctx.beginPath();
            const glowSize = node.radius * (2.0 + node.activation + flash);
            ctx.arc(cx, cy, glowSize, 0, Math.PI * 2);
            const nGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
            const r = 220 + flash * 35;
            const g = 240 + flash * 15;
            nGrad.addColorStop(0, `rgba(${r}, ${g}, 255, 1)`);
            nGrad.addColorStop(0.4, `rgba(99, 102, 241, ${0.8 + node.activation})`);
            nGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
            ctx.fillStyle = nGrad;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, node.radius * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        });

        drawLightning();
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,width,height);
    };

    const drawEmbryo = () => {
        const cx = width / 2;
        const cy = height / 2;
        const growth = growthRef.current;

        // Clear with deep void color
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, height);

        // Center glow based on growth
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.6);
        grad.addColorStop(0, `rgba(15, 23, 42, ${0.4 + growth * 0.2})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(cx, cy);
        
        // Gentle rotation/floating
        ctx.rotate(Math.sin(time * 0.0001) * 0.05);

        // Draw Dendrites / Neurites
        // Branch count increases with growth
        const branchCount = 5 + Math.floor(growth * 15);
        const baseRadius = 20 + growth * 30;

        ctx.beginPath();
        for (let i = 0; i < branchCount; i++) {
            const angleBase = (Math.PI * 2 * i) / branchCount;
            // Add organic randomness to angles
            const angle = angleBase + Math.sin(time * 0.0005 + i * 132) * 0.3;
            
            // Length grows
            const maxLength = 30 + growth * 120; // Reduced from 250 to 120
            const currentLength = maxLength * (0.9 + Math.sin(time * 0.002 + i) * 0.1);

            const cp1x = Math.cos(angle - 0.3) * (currentLength * 0.4);
            const cp1y = Math.sin(angle - 0.3) * (currentLength * 0.4);
            const endX = Math.cos(angle) * currentLength;
            const endY = Math.sin(angle) * currentLength;

            // Root on soma
            const startX = Math.cos(angle) * (baseRadius * 0.8);
            const startY = Math.sin(angle) * (baseRadius * 0.8);

            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(cp1x, cp1y, endX, endY);

            // Secondary branches if developed
            if (growth > 0.4) {
                const subBranches = Math.floor(growth * 4);
                for(let k=1; k<=subBranches; k++) {
                    const t = k / (subBranches + 1);
                    const sx = startX + (endX - startX) * t;
                    const sy = startY + (endY - startY) * t;
                    const sa = angle + (k%2===0 ? 0.5 : -0.5);
                    const sl = currentLength * 0.25 * growth;
                    
                    ctx.moveTo(sx, sy);
                    ctx.quadraticCurveTo(
                        sx + Math.cos(sa) * sl * 0.5,
                        sy + Math.sin(sa) * sl * 0.5,
                        sx + Math.cos(sa) * sl,
                        sy + Math.sin(sa) * sl
                    );
                }
            }
        }

        // Styles for dendrites
        const lineAlpha = 0.3 + growth * 0.7;
        ctx.strokeStyle = `rgba(99, 102, 241, ${lineAlpha})`;
        ctx.lineWidth = 1.5 + growth * 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Soma (Cell Body) - Organic Blob
        ctx.beginPath();
        const blobPoints = 16;
        for (let i = 0; i <= blobPoints; i++) {
            const a = (Math.PI * 2 * i) / blobPoints;
            const rOffset = Math.sin(time * 0.002 + a * 4) * (4 + growth * 4);
            const r = baseRadius + rOffset;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();

        const somaGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, baseRadius * 1.5);
        if (growth < 0.3) {
            // Embryo: Pinkish/Pale
            somaGrad.addColorStop(0, '#fce7f3'); // pink-100
            somaGrad.addColorStop(0.6, 'rgba(244, 114, 182, 0.4)'); // pink-400
            somaGrad.addColorStop(1, 'rgba(244, 114, 182, 0)');
        } else if (growth < 0.7) {
            // Growing: Blue/Indigo
            somaGrad.addColorStop(0, '#e0e7ff');
            somaGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.8)');
            somaGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        } else {
            // Mature: Gold/Electric
            somaGrad.addColorStop(0, '#fffbeb'); // amber-50
            somaGrad.addColorStop(0.5, '#fbbf24'); // amber-400
            somaGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        }

        ctx.fillStyle = somaGrad;
        ctx.shadowBlur = 20 * growth + 10;
        ctx.shadowColor = growth > 0.7 ? '#fbbf24' : '#818cf8';
        ctx.fill();
        ctx.shadowBlur = 0;

        // Nucleus
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fill();

        ctx.restore();
    };

    const render = (timestamp: number) => {
      time = timestamp;
      
      if (variant === 'default') {
          renderDefault();
      } else {
          // Update growth interpolation for Embryo
          let target = 0;
          if (phase === 'INPUT') target = 0.05;
          if (phase === 'PROCESSING') target = 0.3;
          if (phase === 'EXTRACTION') target = 0.6;
          if (phase === 'SYNTHESIS') target = 0.85;
          if (phase === 'COMPLETE') target = 1.0;
          
          // Smooth Lerp
          growthRef.current += (target - growthRef.current) * 0.015;
          drawEmbryo();
      }

      animationId = requestAnimationFrame(render);
    };

    window.addEventListener('resize', init);
    init();
    animationId = requestAnimationFrame(render);
    
    return () => {
      window.removeEventListener('resize', init);
      cancelAnimationFrame(animationId);
    };
  }, [phase, variant]); 

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full mix-blend-screen" />;
};
