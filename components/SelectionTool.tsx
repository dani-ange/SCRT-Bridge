
import React, { useState, useEffect, useCallback } from 'react';
import { useZoom } from '../contexts/ZoomContext';

export const SelectionTool: React.FC = () => {
  const { zoomInRect, isZoomed } = useZoom();
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Check if selection is visible and has dimensions
      if (rect.width > 0 && rect.height > 0) {
        setSelectionRect(rect);
        return;
      }
    }
    setSelectionRect(null);
  }, []);

  useEffect(() => {
    // Listen for selection changes and mouse/keyboard interactions
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    document.addEventListener('selectionchange', handleSelection);
    
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, [handleSelection]);

  if (!selectionRect || isZoomed) return null;

  return (
    <div 
      className="fixed z-[9999] pointer-events-auto animate-in slide-in-from-bottom-2 duration-300"
      style={{
        left: selectionRect.left + selectionRect.width / 2,
        top: selectionRect.top - 10,
        transform: 'translateX(-50%) translateY(-100%)'
      }}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          zoomInRect(selectionRect, "Focus sur la sélection");
          window.getSelection()?.removeAllRanges();
          setSelectionRect(null);
        }}
        className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl border border-white/10 flex items-center gap-2 hover:bg-indigo-600 transition-all hover:scale-110 cursor-pointer"
      >
        <i className="fas fa-search-plus text-indigo-400"></i>
        Focus Selection
      </button>
      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900 mx-auto"></div>
    </div>
  );
};
