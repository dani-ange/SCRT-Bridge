
import React, { useRef } from 'react';
import { useZoom } from '../contexts/ZoomContext';

interface Props {
  children: React.ReactNode;
  label: string;
  className?: string;
  as?: any;
}

export const Zoomable: React.FC<Props> = ({ children, label, className = "", as: Component = 'div' }) => {
  const ref = useRef<HTMLElement>(null);
  const { zoomIn } = useZoom();

  return (
    <Component ref={ref} className={`relative group/zoom transition-all duration-300 ${className}`}>
      {children}
      <button
        onClick={(e) => {
          e.stopPropagation();
          zoomIn(ref, label);
        }}
        className="absolute -left-8 top-0 opacity-0 group-hover/zoom:opacity-100 transition-opacity duration-300 p-2 text-indigo-400 hover:text-indigo-600 hover:scale-110 cursor-zoom-in z-10"
        title={`Focus sur ${label}`}
        aria-label={`Focus sur ${label}`}
      >
        <i className="fas fa-search-plus text-sm"></i>
      </button>
    </Component>
  );
};
