"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TILE_SIZE = 64;
const FEATURE_COUNT = 8; // rows in sprite sheet
const VARIANT_COUNT = 10; // columns in sprite sheet

// Feature indices (rows in sprite sheet)
const FEATURES = {
  HEAD: 0,
  EYES: 1,
  MOUTH: 2,
  NOSE: 3,
  HAIR: 4,
  ACCESSORIES: 5, // glasses etc
  EARS: 6,
  // row 7 is example faces, not used for generation
};

export type AvatarConfig = number[]; // 8 feature indices (0-9 each)

function generateRandomFace(): AvatarConfig {
  const face: number[] = [];
  for (let f = 0; f < FEATURE_COUNT; f++) {
    face.push(Math.floor(Math.random() * VARIANT_COUNT));
  }
  return face;
}

function breedFaces(parent1: AvatarConfig, parent2: AvatarConfig): AvatarConfig {
  const child: number[] = [];
  for (let f = 0; f < FEATURE_COUNT; f++) {
    // Randomly pick from either parent
    child.push(Math.random() < 0.5 ? parent1[f] : parent2[f]);
  }
  return child;
}

interface AvatarGeneratorProps {
  size?: number;
  onGenerate?: (config: AvatarConfig) => void;
  initialConfig?: AvatarConfig;
}

export function AvatarGenerator({
  size = 128,
  onGenerate,
  initialConfig,
}: AvatarGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const [face, setFace] = useState<AvatarConfig>(initialConfig || generateRandomFace());
  const [loaded, setLoaded] = useState(false);

  // Load sprite sheet
  useEffect(() => {
    const img = new Image();
    img.src = "/bitfloor/sprites/face.png";
    img.onload = () => {
      spriteRef.current = img;
      setLoaded(true);
    };
  }, []);

  // Draw face on canvas
  useEffect(() => {
    if (!loaded || !canvasRef.current || !spriteRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw each feature layer (skip row 0 which is head outline, start from 1)
    for (let f = 1; f < FEATURE_COUNT; f++) {
      const variantX = face[f] * TILE_SIZE;
      const featureY = f * TILE_SIZE;
      ctx.drawImage(
        spriteRef.current,
        variantX,
        featureY,
        TILE_SIZE,
        TILE_SIZE,
        0,
        0,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }, [face, loaded]);

  const regenerate = useCallback(() => {
    const newFace = generateRandomFace();
    setFace(newFace);
    onGenerate?.(newFace);
  }, [onGenerate]);

  const breed = useCallback(() => {
    const parent1 = generateRandomFace();
    const parent2 = generateRandomFace();
    const child = breedFaces(parent1, parent2);
    setFace(child);
    onGenerate?.(child);
  }, [onGenerate]);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={TILE_SIZE}
        height={TILE_SIZE}
        className="border border-black bg-white"
        style={{
          width: size,
          height: size,
          imageRendering: "pixelated",
        }}
        onClick={regenerate}
        title="Click to regenerate"
      />
      <div className="flex gap-2">
        <button
          onClick={regenerate}
          className="px-3 py-1 bg-black text-white text-sm font-mono hover:bg-gray-800"
        >
          Random
        </button>
        <button
          onClick={breed}
          className="px-3 py-1 bg-black text-white text-sm font-mono hover:bg-gray-800"
        >
          Breed
        </button>
      </div>
    </div>
  );
}

export default AvatarGenerator;
