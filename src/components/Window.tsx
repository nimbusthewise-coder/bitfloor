"use client";

import { useState, useRef, useEffect, ReactNode } from "react";

interface WindowProps {
  title: string;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  onClose?: () => void;
  onFocus?: () => void;
  zIndex?: number;
  className?: string;
}

export function Window({
  title,
  children,
  defaultPosition = { x: 100, y: 100 },
  defaultSize = { width: 300, height: 200 },
  onClose,
  onFocus,
  zIndex = 1,
  className = "",
}: WindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, winX: 0, winY: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;
      setPosition({
        x: dragStartRef.current.winX + deltaX,
        y: dragStartRef.current.winY + deltaY,
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
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      winX: position.x,
      winY: position.y,
    };
    setIsDragging(true);
    onFocus?.();
  };

  const handleWindowClick = () => {
    onFocus?.();
  };

  return (
    <div
      className={`absolute ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: defaultSize.width,
        zIndex,
      }}
      onMouseDown={handleWindowClick}
    >
      {/* Shadow layer (offset down-right) */}
      <div
        className="absolute bg-white/30"
        style={{
          left: 3,
          top: 3,
          width: defaultSize.width,
          height: defaultSize.height + 24,
        }}
      />
      
      {/* Main window */}
      <div
        className="relative bg-black border border-white"
        style={{ height: defaultSize.height + 24 }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between border-b border-white px-2 py-1 cursor-move select-none bg-white text-black"
          onMouseDown={handleMouseDown}
        >
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="w-4 h-4 border border-black flex items-center justify-center text-xs hover:bg-black hover:text-white"
          >
            ×
          </button>
          
          {/* Title */}
          <span className="text-xs tracking-wider uppercase">{title}</span>
          
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
