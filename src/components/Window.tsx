"use client";

import { useState, useRef, useEffect, ReactNode } from "react";

interface WindowProps {
  title: string;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  onClose?: () => void;
  className?: string;
}

export function Window({
  title,
  children,
  defaultPosition = { x: 100, y: 100 },
  defaultSize = { width: 300, height: 200 },
  onClose,
  className = "",
}: WindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (windowRef.current) {
      const rect = windowRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  return (
    <div
      ref={windowRef}
      className={`absolute ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: defaultSize.width,
      }}
    >
      {/* Shadow layer (offset down-right) */}
      <div
        className="absolute bg-white/20"
        style={{
          left: 2,
          top: 2,
          right: -2,
          bottom: -2,
          width: defaultSize.width,
          height: defaultSize.height + 24, // account for title bar
        }}
      />
      
      {/* Main window */}
      <div
        className="relative bg-black border border-white"
        style={{ height: defaultSize.height + 24 }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between border-b border-white px-2 py-1 cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="w-4 h-4 border border-white flex items-center justify-center text-xs hover:bg-white hover:text-black"
          >
            ×
          </button>
          
          {/* Title */}
          <span className="text-xs tracking-wider">{title}</span>
          
          {/* Spacer for symmetry */}
          <div className="w-4" />
        </div>

        {/* Content */}
        <div 
          className="p-2 overflow-auto"
          style={{ height: defaultSize.height }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default Window;
