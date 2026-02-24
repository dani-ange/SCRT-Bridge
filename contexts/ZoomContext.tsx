
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ZoomContextType {
  zoomIn: (elementRef: React.RefObject<HTMLElement>, label?: string) => void;
  zoomInRect: (rect: DOMRect, label?: string) => void;
  zoomOut: () => void;
  isZoomed: boolean;
  activeId: string | null;
}

const ZoomContext = createContext<ZoomContextType | undefined>(undefined);

export const useZoom = () => {
  const context = useContext(ZoomContext);
  if (!context) {
    throw new Error('useZoom must be used within a ZoomProvider');
  }
  return context;
};

interface ZoomProviderProps {
  children: ReactNode;
}

export const ZoomProvider: React.FC<ZoomProviderProps> = ({ children }) => {
  const [activeRect, setActiveRect] = useState<DOMRect | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeRef, setActiveRef] = useState<React.RefObject<HTMLElement> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const zoomIn = (elementRef: React.RefObject<HTMLElement>, label?: string) => {
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      setActiveRect(rect);
      setActiveRef(elementRef);
      setActiveLabel(label || null);
      setActiveId(Math.random().toString(36).substr(2, 9));
      
      // Apply Focus Styles
      const el = elementRef.current;
      // We set a high z-index, but the visibility is primarily ensured by the 4-part mask overlay
      el.style.zIndex = "50"; 
      el.style.position = "relative"; 
      el.style.transition = "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s, color 0.3s";
      el.style.transform = "scale(1.02)"; // Slight pop
      
      // Ensure high contrast reading mode
      el.style.backgroundColor = "#ffffff";
      el.style.color = "#0f172a"; // Slate-900
      el.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
      
      // Optional: Add a class for forcing child text colors if needed
      el.classList.add("zoomed-content");
    }
  };

  const zoomInRect = (rect: DOMRect, label?: string) => {
    setActiveRect(rect);
    setActiveRef(null);
    setActiveLabel(label || null);
    setActiveId(Math.random().toString(36).substr(2, 9));
  };

  const zoomOut = () => {
    if (activeRef?.current) {
      const el = activeRef.current;
      el.style.zIndex = "";
      el.style.position = "";
      el.style.transform = "";
      el.style.backgroundColor = "";
      el.style.color = "";
      el.style.boxShadow = "";
      el.classList.remove("zoomed-content");
    }
    setActiveRect(null);
    setActiveRef(null);
    setActiveLabel(null);
    setActiveId(null);
  };

  useEffect(() => {
    const handleUpdate = () => {
      if (activeRef?.current) {
        // Keep tracking the element position
        setActiveRect(activeRef.current.getBoundingClientRect());
      } else if (activeRect) {
        // If it was a static rect (like text selection), we might want to close on scroll
        // or just keep it static. For now, let's close on scroll for static rects to avoid misalignment
        // zoomOut(); 
      }
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [activeRef, activeRect]); // Added activeRect to dep to refresh if needed

  return (
    <ZoomContext.Provider value={{ zoomIn, zoomInRect, zoomOut, isZoomed: !!activeRect, activeId }}>
      {children}
      {activeRect && (
        <ZoomOverlay 
          rect={activeRect} 
          label={activeLabel} 
          onDismiss={zoomOut} 
        />
      )}
    </ZoomContext.Provider>
  );
};

const ZoomOverlay: React.FC<{ rect: DOMRect; label: string | null; onDismiss: () => void }> = ({ rect, label, onDismiss }) => {
  // 4-part mask to create a hole
  // Fixed overlay is z-[9998]
  
  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      
      {/* 1. Top Mask */}
      <div 
        className="absolute bg-slate-950/90 backdrop-blur-[2px] pointer-events-auto cursor-zoom-out transition-all duration-300 ease-out"
        style={{ top: 0, left: 0, right: 0, height: rect.top }}
        onClick={onDismiss}
      ></div>

      {/* 2. Bottom Mask */}
      <div 
        className="absolute bg-slate-950/90 backdrop-blur-[2px] pointer-events-auto cursor-zoom-out transition-all duration-300 ease-out"
        style={{ top: rect.bottom, left: 0, right: 0, bottom: 0 }}
        onClick={onDismiss}
      ></div>

      {/* 3. Left Mask */}
      <div 
        className="absolute bg-slate-950/90 backdrop-blur-[2px] pointer-events-auto cursor-zoom-out transition-all duration-300 ease-out"
        style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
        onClick={onDismiss}
      ></div>

      {/* 4. Right Mask */}
      <div 
        className="absolute bg-slate-950/90 backdrop-blur-[2px] pointer-events-auto cursor-zoom-out transition-all duration-300 ease-out"
        style={{ top: rect.top, left: rect.right, right: 0, height: rect.height }}
        onClick={onDismiss}
      ></div>

      {/* Decorative Frame around the hole */}
      <div 
        className="absolute pointer-events-none transition-all duration-300 ease-out z-[9999]"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      >
        {/* Border / Glow */}
        <div className="absolute inset-[-4px] border-2 border-indigo-500/50 rounded-lg animate-pulse"></div>

        {/* Active Corners */}
        <div className="absolute -top-3 -left-3 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg"></div>
        <div className="absolute -top-3 -right-3 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg"></div>
        <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg"></div>
        <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg"></div>
        
        {/* Label */}
        {label && (
           <div className="absolute -top-16 left-1/2 -translate-x-1/2 whitespace-nowrap z-50 animate-in slide-in-from-bottom-4 duration-500">
               <div className="bg-indigo-600 text-white px-5 py-2 rounded-full font-black uppercase tracking-[0.2em] text-[10px] shadow-xl border border-indigo-400/30 flex items-center gap-3">
                   <i className="fas fa-eye animate-pulse"></i>
                   {label}
               </div>
               <div className="w-0.5 h-6 bg-indigo-500/50 mx-auto"></div>
           </div>
        )}
      </div>

       {/* Scanlines Effect (Optional, overlaid on masks via fixed div if needed, but keeping it simple for clarity now) */}
    </div>
  );
};
