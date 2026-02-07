"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

const BASE_WIDTH = 640;
const BASE_HEIGHT = 360;

interface PixelScreenProps {
  children: ReactNode;
}

export function PixelScreen({ children }: PixelScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      
      const parent = containerRef.current.parentElement;
      if (!parent) return;

      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;

      // Calculate scale to fit while maintaining aspect ratio
      // Use floor to ensure we get integer scaling for pixel-perfect rendering
      const scaleX = Math.floor(parentWidth / BASE_WIDTH) || 1;
      const scaleY = Math.floor(parentHeight / BASE_HEIGHT) || 1;
      const newScale = Math.min(scaleX, scaleY);

      setScale(Math.max(1, newScale));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden">
      <div
        ref={containerRef}
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          imageRendering: "pixelated",
        }}
        className="bg-black relative"
      >
        {children}
      </div>
    </div>
  );
}

export default PixelScreen;
