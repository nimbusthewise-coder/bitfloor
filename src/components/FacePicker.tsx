"use client";

import { useState, useEffect, useRef } from "react";

const AVATAR_SIZE = 64;

interface FacePickerProps {
  initialConfig?: number[];
  onSelect?: (config: number[]) => void;
  onClose?: () => void;
}

export function FacePicker({ initialConfig, onSelect, onClose }: FacePickerProps) {
  const [config, setConfig] = useState<number[]>(initialConfig || [0, 0, 0, 0, 0, 0, 0, 0]);
  const [selectedFeature, setSelectedFeature] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const featureNames = [
    "Base",      // 0
    "Head",      // 1
    "Eyes",      // 2
    "Nose",      // 3
    "Mouth",     // 4
    "Hair",      // 5
    "Extra 1",   // 6
    "Extra 2",   // 7
  ];

  useEffect(() => {
    const img = new Image();
    img.src = "/bitfloor/sprites/face.png";
    img.onload = () => {
      spriteRef.current = img;
      setLoaded(true);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !canvasRef.current || !spriteRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, AVATAR_SIZE * 2, AVATAR_SIZE * 2);

    // Draw face at 2x scale
    for (let f = 1; f < 8; f++) {
      const variantX = (config[f] || 0) * AVATAR_SIZE;
      const featureY = f * AVATAR_SIZE;
      ctx.drawImage(
        spriteRef.current,
        variantX, featureY, AVATAR_SIZE, AVATAR_SIZE,
        0, 0, AVATAR_SIZE * 2, AVATAR_SIZE * 2
      );
    }
  }, [config, loaded]);

  const updateFeature = (featureIndex: number, delta: number) => {
    const newConfig = [...config];
    newConfig[featureIndex] = (newConfig[featureIndex] + delta + 10) % 10;
    setConfig(newConfig);
  };

  const randomize = () => {
    const newConfig = config.map(() => Math.floor(Math.random() * 10));
    setConfig(newConfig);
  };

  return (
    <div style={{
      background: "#000",
      border: "1px solid #fff",
      padding: 16,
      fontFamily: "'Press Start 2P', monospace",
      fontSize: "8px",
      color: "#fff",
      width: 280,
    }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: "1px solid #444",
      }}>
        <span>CHOOSE YOUR FACE</span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid #fff",
              color: "#fff",
              cursor: "pointer",
              padding: "2px 6px",
              fontFamily: "inherit",
              fontSize: "8px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Face preview */}
        <div style={{ 
          border: "1px solid #fff",
          background: "#000",
        }}>
          <canvas
            ref={canvasRef}
            width={AVATAR_SIZE * 2}
            height={AVATAR_SIZE * 2}
            style={{
              width: AVATAR_SIZE * 2,
              height: AVATAR_SIZE * 2,
              imageRendering: "pixelated",
            }}
          />
        </div>

        {/* Feature controls */}
        <div style={{ flex: 1 }}>
          {featureNames.slice(1).map((name, i) => {
            const featureIdx = i + 1;
            const isSelected = selectedFeature === featureIdx;
            return (
              <div
                key={featureIdx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginBottom: 4,
                  opacity: isSelected ? 1 : 0.6,
                  background: isSelected ? "#222" : "transparent",
                  padding: "2px 4px",
                }}
                onClick={() => setSelectedFeature(featureIdx)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); updateFeature(featureIdx, -1); }}
                  style={{
                    background: "none",
                    border: "1px solid #666",
                    color: "#fff",
                    width: 16,
                    height: 16,
                    cursor: "pointer",
                    fontSize: "10px",
                    padding: 0,
                  }}
                >
                  ◀
                </button>
                <span style={{ flex: 1, fontSize: "6px" }}>{name}</span>
                <span style={{ color: "#0f0", width: 12, textAlign: "center" }}>{config[featureIdx]}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); updateFeature(featureIdx, 1); }}
                  style={{
                    background: "none",
                    border: "1px solid #666",
                    color: "#fff",
                    width: 16,
                    height: 16,
                    cursor: "pointer",
                    fontSize: "10px",
                    padding: 0,
                  }}
                >
                  ▶
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* DNA display */}
      <div style={{ 
        marginTop: 12, 
        paddingTop: 8, 
        borderTop: "1px solid #444",
        fontSize: "7px",
        color: "#888",
      }}>
        DNA: [{config.join(", ")}]
      </div>

      {/* Action buttons */}
      <div style={{ 
        display: "flex", 
        gap: 8, 
        marginTop: 12,
      }}>
        <button
          onClick={randomize}
          style={{
            flex: 1,
            background: "none",
            border: "1px solid #fff",
            color: "#fff",
            padding: "6px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "7px",
          }}
        >
          🎲 RANDOM
        </button>
        <button
          onClick={() => onSelect?.(config)}
          style={{
            flex: 1,
            background: "#0f0",
            border: "1px solid #0f0",
            color: "#000",
            padding: "6px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "7px",
          }}
        >
          ✓ SELECT
        </button>
      </div>
    </div>
  );
}

export default FacePicker;
