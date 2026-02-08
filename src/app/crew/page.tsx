"use client";

import { useState, useEffect, useRef } from "react";
import {
  loadSpriteSheet,
  loadFaceSheet,
  bakeIdentitySprites,
  SpriteSheet,
  FaceSheet,
  BakedSprite,
  Identity,
} from "@/lib/sprites";

const nimbus: Identity = {
  id: "nimbus",
  name: "Nimbus",
  faceDNA: [0, 2, 3, 4, 8, 7, 7, 1],
  tints: {
    Suit: "#4ade80",
    Gloves: "#22c55e",
    Boots: "#166534",
    Helmet: "#86efac",
  },
  faceTints: {
    skin: "#ffd5b5",
    hair: "#4a3728",
    background: "#d4fcd4",
  },
  speed: 1,
};

const jp: Identity = {
  id: "jp",
  name: "JP",
  faceDNA: [0, 6, 0, 2, 8, 3, 8, 5],
  tints: {
    Suit: "#60a5fa",
    Gloves: "#3b82f6",
    Boots: "#1e40af",
    Helmet: "#93c5fd",
  },
  faceTints: {
    skin: "#ffd5b5",
    hair: "#ffd5b5",    // Shaved head - matches skin
    background: "#d4e8fc",
  },
  speed: 1,
};

const codex: Identity = {
  id: "codex",
  name: "Codex",
  faceDNA: [0, 1, 2, 3, 4, 5, 0, 0],
  tints: {
    Suit: "#fb923c",
    Gloves: "#f97316",
    Boots: "#c2410c",
    Helmet: "#fdba74",
  },
  faceTints: {
    skin: "#ffd5b5",
    hair: "#8b4513",
    background: "#fde8d4",
  },
  speed: 1.2,
};

const crew = [nimbus, jp, codex];

export default function CrewTestPage() {
  const [bakedSprites, setBakedSprites] = useState<Map<string, BakedSprite>>(new Map());
  const [sheet, setSheet] = useState<SpriteSheet | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [animation, setAnimation] = useState<"Run" | "Idle" | "Jump">("Run");
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Load and bake all crew on mount
  useEffect(() => {
    async function load() {
      const [spriteSheet, faceSheet] = await Promise.all([
        loadSpriteSheet(
          "/bitfloor/sprites/character-layers.png",
          "/bitfloor/sprites/character-layers.json"
        ),
        loadFaceSheet("/bitfloor/sprites/face-32.png"),
      ]);
      
      setSheet(spriteSheet);
      
      const baked = new Map<string, BakedSprite>();
      for (const identity of crew) {
        baked.set(identity.id, bakeIdentitySprites(spriteSheet, identity, faceSheet));
      }
      setBakedSprites(baked);
    }
    load();
  }, []);

  // Get frame range for current animation
  const getFrameRange = () => {
    if (!sheet) return { from: 0, to: 7 };
    const tag = sheet.tags.find(t => t.name === animation);
    return tag ? { from: tag.from, to: tag.to } : { from: 0, to: 7 };
  };

  // Animate within current tag's frame range
  useEffect(() => {
    const range = getFrameRange();
    setCurrentFrame(range.from);
    
    const interval = setInterval(() => {
      setCurrentFrame(f => {
        const next = f + 1;
        return next > range.to ? range.from : next;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [animation, sheet]);

  // Draw current frame for each crew member
  useEffect(() => {
    if (bakedSprites.size === 0) return;
    
    for (const identity of crew) {
      const canvas = canvasRefs.current.get(identity.id);
      const baked = bakedSprites.get(identity.id);
      if (!canvas || !baked) continue;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 96, 96);
      
      ctx.drawImage(
        baked.canvas,
        currentFrame * 48, 0, 48, 48,
        0, 0, 96, 96
      );
    }
  }, [bakedSprites, currentFrame]);

  const range = getFrameRange();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      padding: 20,
      fontFamily: "'Press Start 2P', monospace",
      color: "#fff",
      fontSize: 10,
    }}>
      <h1 style={{ fontSize: 14, color: "#0f0", marginBottom: 20 }}>
        BITSHIP CREW
      </h1>

      {/* Animation buttons */}
      <div style={{ marginBottom: 20 }}>
        {["Run", "Idle", "Jump"].map(anim => (
          <button
            key={anim}
            onClick={() => setAnimation(anim as any)}
            style={{
              marginRight: 8,
              padding: "4px 8px",
              background: animation === anim ? "#0f0" : "#333",
              color: animation === anim ? "#000" : "#fff",
              border: "1px solid #0f0",
              cursor: "pointer",
            }}
          >
            {anim.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Crew display */}
      <div style={{ 
        display: "flex", 
        gap: 40,
        marginBottom: 20,
      }}>
        {crew.map(identity => (
          <div key={identity.id} style={{ textAlign: "center" }}>
            <canvas
              ref={el => { if (el) canvasRefs.current.set(identity.id, el); }}
              width={96}
              height={96}
              style={{
                border: `2px solid ${identity.tints.Suit}`,
                imageRendering: "pixelated",
                background: "#111",
              }}
            />
            <div style={{ 
              marginTop: 8, 
              color: identity.tints.Suit,
              fontSize: 10,
            }}>
              {identity.name.toUpperCase()}
            </div>
            <div style={{ 
              marginTop: 2, 
              color: "#666",
              fontSize: 8,
            }}>
              {identity.id === "nimbus" ? "AI Agent" : 
               identity.id === "jp" ? "Human" : "Sub-agent"}
            </div>
          </div>
        ))}
      </div>

      {/* Status */}
      <div style={{ marginBottom: 10, color: "#888" }}>
        Animation: <span style={{ color: "#0f0" }}>{animation}</span> | 
        Frame: <span style={{ color: "#0f0" }}>{currentFrame}</span> | 
        Range: <span style={{ color: "#0f0" }}>{range.from}-{range.to}</span>
      </div>

      {/* Legend */}
      <div style={{ fontSize: 8, color: "#666" }}>
        🟢 Green = AI Agents | 🔵 Blue = Humans | 🟠 Orange = Sub-agents
      </div>
    </div>
  );
}
