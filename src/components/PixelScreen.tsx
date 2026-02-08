"use client";

import { useEffect, useRef, useState, ReactNode, useCallback } from "react";

// Minimum dimensions to ensure usability
const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;

interface PixelScreenProps {
  children: ReactNode | ((dimensions: { width: number; height: number; scale: number }) => ReactNode);
  defaultScale?: number;
  showControls?: boolean;
}

export function PixelScreen({ children, defaultScale = 2, showControls = true }: PixelScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(defaultScale);
  const [dimensions, setDimensions] = useState({ width: 640, height: 360 });

  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return;
    
    const parent = containerRef.current.parentElement;
    if (!parent) return;

    const parentWidth = parent.clientWidth;
    const parentHeight = parent.clientHeight;

    // Calculate virtual resolution based on scale
    // The entire viewport is used - no letterboxing
    const virtualWidth = Math.max(MIN_WIDTH, Math.floor(parentWidth / scale));
    const virtualHeight = Math.max(MIN_HEIGHT, Math.floor(parentHeight / scale));

    setDimensions({ width: virtualWidth, height: virtualHeight });
  }, [scale]);

  useEffect(() => {
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [updateDimensions]);

  const handleScaleChange = (newScale: number) => {
    setScale(newScale);
  };

  return (
    <div className="w-full h-full bg-black overflow-hidden relative">
      {/* Scale controls */}
      {showControls && (
        <div 
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1000,
            display: "flex",
            gap: 4,
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {[1, 2, 3, 4].map(s => (
            <button
              key={s}
              onClick={() => handleScaleChange(s)}
              style={{
                padding: "4px 8px",
                background: scale === s ? "#0f0" : "#333",
                color: scale === s ? "#000" : "#0f0",
                border: "1px solid #0f0",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              {s}x
            </button>
          ))}
          <span style={{ color: "#666", padding: "4px 8px" }}>
            {dimensions.width}×{dimensions.height}
          </span>
        </div>
      )}
      
      {/* Scaled content container */}
      <div
        ref={containerRef}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          imageRendering: "pixelated",
        }}
        className="bg-black relative"
      >
        {typeof children === "function" 
          ? children({ ...dimensions, scale }) 
          : children
        }
      </div>
    </div>
  );
}

export default PixelScreen;
