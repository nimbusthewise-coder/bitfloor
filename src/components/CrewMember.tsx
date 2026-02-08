"use client";

import { useEffect, useRef, useState } from "react";
import {
  SpriteSheet,
  SpriteAnimator,
  BakedSprite,
  Identity,
  FaceSheet,
  loadSpriteSheet,
  loadFaceSheet,
  bakeIdentitySprites,
  Gravity,
  getGravityAngle,
} from "@/lib/sprites";

interface CrewMemberProps {
  identity: Identity;
  x: number;
  y: number;
  animation?: "Idle" | "Run" | "Jump" | "IdleShoot" | "RunShoot" | "JumpShoot";
  direction?: "left" | "right";
  gravity?: Gravity;
  scale?: number;
  onReady?: () => void;
}

// Global sprite sheet caches
let sheetPromise: Promise<SpriteSheet> | null = null;
let faceSheetPromise: Promise<FaceSheet> | null = null;
const bakedCache = new Map<string, BakedSprite>();

async function getSheet(): Promise<SpriteSheet> {
  if (!sheetPromise) {
    sheetPromise = loadSpriteSheet(
      "/bitfloor/sprites/character-layers.png",
      "/bitfloor/sprites/character-layers.json"
    );
  }
  return sheetPromise;
}

async function getFaceSheet(): Promise<FaceSheet> {
  if (!faceSheetPromise) {
    faceSheetPromise = loadFaceSheet("/bitfloor/sprites/face-32.png");
  }
  return faceSheetPromise;
}

function getBakedSprite(sheet: SpriteSheet, identity: Identity, faceSheet?: FaceSheet): BakedSprite {
  const cacheKey = `${identity.id}_${JSON.stringify(identity.tints)}_${JSON.stringify(identity.faceDNA)}`;
  
  if (!bakedCache.has(cacheKey)) {
    const baked = bakeIdentitySprites(sheet, identity, faceSheet);
    bakedCache.set(cacheKey, baked);
  }
  
  return bakedCache.get(cacheKey)!;
}

export function CrewMember({
  identity,
  x,
  y,
  animation = "Idle",
  direction = "right",
  gravity = "DOWN",
  scale = 1,
  onReady,
}: CrewMemberProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animatorRef = useRef<SpriteAnimator | null>(null);
  const [ready, setReady] = useState(false);
  const lastTimeRef = useRef<number>(0);
  
  // Initialize sprite system
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      try {
        // Load both sheets in parallel
        const [sheet, faceSheet] = await Promise.all([
          getSheet(),
          getFaceSheet(),
        ]);
        if (!mounted) return;
        
        const baked = getBakedSprite(sheet, identity, faceSheet);
        
        const animator = new SpriteAnimator(sheet);
        animator.setBakedSprite(baked);
        animator.setAnimation(animation);
        animatorRef.current = animator;
        
        setReady(true);
        onReady?.();
      } catch (err) {
        console.error("Failed to load sprite sheet:", err);
      }
    }
    
    init();
    
    return () => {
      mounted = false;
    };
  }, [identity.id]);
  
  // Update animation when prop changes
  useEffect(() => {
    if (animatorRef.current) {
      console.log(`[CrewMember ${identity.id}] Setting animation to: ${animation}`);
      animatorRef.current.setAnimation(animation);
    }
  }, [animation, identity.id]);
  
  // Animation loop
  useEffect(() => {
    if (!ready || !canvasRef.current || !animatorRef.current) return;
    
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    
    let rafId: number;
    
    function render(time: number) {
      if (!canvasRef.current || !animatorRef.current) return;
      
      const delta = lastTimeRef.current ? time - lastTimeRef.current : 16;
      lastTimeRef.current = time;
      
      // Update animation
      animatorRef.current.update(delta, identity.speed);
      
      // Clear canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw character
      ctx.save();
      
      // Apply gravity rotation
      if (gravity !== "DOWN") {
        const angle = getGravityAngle(gravity) * (Math.PI / 180);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }
      
      animatorRef.current.draw(ctx, 0, 0, direction === "left", 1);
      
      ctx.restore();
      
      rafId = requestAnimationFrame(render);
    }
    
    rafId = requestAnimationFrame(render);
    
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [ready, direction, gravity, identity.speed]);
  
  const size = 48 * scale;
  
  return (
    <canvas
      ref={canvasRef}
      width={48}
      height={48}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        imageRendering: "pixelated",
        pointerEvents: "none",
      }}
    />
  );
}

// Demo component to show all animations
export function CrewMemberDemo() {
  const [animation, setAnimation] = useState<"Idle" | "Run" | "Jump">("Idle");
  
  const testIdentity: Identity = {
    id: "nimbus",
    name: "Nimbus",
    faceDNA: [0, 2, 3, 4, 8, 7, 7, 1],
    tints: {
      Suit: "#4ade80",     // green-400
      Gloves: "#22c55e",   // green-500
      Boots: "#166534",    // green-800
      Helmet: "#86efac",   // green-300
    },
    speed: 1,
  };
  
  const jpIdentity: Identity = {
    id: "jp",
    name: "JP",
    faceDNA: [0, 6, 0, 2, 8, 3, 8, 5],
    tints: {
      Suit: "#60a5fa",     // blue-400
      Gloves: "#3b82f6",   // blue-500
      Boots: "#1e40af",    // blue-800
      Helmet: "#93c5fd",   // blue-300
    },
    speed: 1,
  };
  
  return (
    <div style={{ 
      background: "#000", 
      padding: 20, 
      fontFamily: "'Press Start 2P', monospace",
      color: "#fff",
      fontSize: 10,
    }}>
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => setAnimation("Idle")} style={{ marginRight: 8 }}>Idle</button>
        <button onClick={() => setAnimation("Run")} style={{ marginRight: 8 }}>Run</button>
        <button onClick={() => setAnimation("Jump")}>Jump</button>
      </div>
      
      <div style={{ position: "relative", width: 200, height: 100 }}>
        <CrewMember
          identity={testIdentity}
          x={20}
          y={20}
          animation={animation}
          direction="right"
        />
        <CrewMember
          identity={jpIdentity}
          x={100}
          y={20}
          animation={animation}
          direction="left"
        />
      </div>
      
      <div style={{ marginTop: 10, fontSize: 8, color: "#888" }}>
        Nimbus (green) | JP (blue)
      </div>
    </div>
  );
}

export default CrewMember;
