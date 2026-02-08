"use client";

import { useState, useEffect, useRef } from "react";

const AVATAR_SIZE = 64;
// basePath for sprites - matches next.config.ts
const BASE_PATH = "/bitfloor";

export default function IdentityCardApp() {
  const [config, setConfig] = useState<number[]>([0, 2, 3, 4, 8, 7, 7, 1]); // Start with Nimbus's face
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [step, setStep] = useState<"face" | "info" | "card">("face");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const featureNames = ["Base", "Head", "Eyes", "Mouth", "Nose", "Hair", "Glasses", "Ears"];

  useEffect(() => {
    const img = new Image();
    img.src = `${BASE_PATH}/sprites/face.png`;
    img.onload = () => {
      spriteRef.current = img;
      setLoaded(true);
    };
    img.onerror = () => {
      // Fallback for local dev without basePath
      img.src = "/sprites/face.png";
    };
  }, []);

  useEffect(() => {
    if (!loaded || !canvasRef.current || !spriteRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    
    // White background fill
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, AVATAR_SIZE * 2, AVATAR_SIZE * 2);
    
    // Draw background tile scaled to fill the box
    ctx.drawImage(
      spriteRef.current,
      64, 576, AVATAR_SIZE, AVATAR_SIZE, // tile at (1, 9) on sprite sheet
      0, 0, AVATAR_SIZE * 2, AVATAR_SIZE * 2
    );

    // Draw face features
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
    setConfig(config.map(() => Math.floor(Math.random() * 10)));
  };

  const dnaString = `[${config.join(", ")}]`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      fontFamily: "'Press Start 2P', monospace",
      color: "#fff",
    }}>
      <h1 style={{ fontSize: "12px", marginBottom: 8, color: "#0f0" }}>
        BITFLOOR
      </h1>
      <p style={{ fontSize: "8px", marginBottom: 24, color: "#888" }}>
        Identity Card Generator
      </p>

      {step === "face" && (
        <div style={{
          background: "#111",
          border: "1px solid #333",
          padding: 16,
          maxWidth: 320,
        }}>
          <div style={{ fontSize: "8px", color: "#888", marginBottom: 12 }}>
            STEP 1: CHOOSE YOUR FACE
          </div>
          
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ border: "1px solid #fff" }}>
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

            <div style={{ flex: 1 }}>
              {featureNames.slice(1).map((fname, i) => {
                const idx = i + 1;
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <button
                      onClick={() => updateFeature(idx, -1)}
                      style={{ background: "none", border: "1px solid #444", color: "#fff", width: 20, height: 20, cursor: "pointer", fontSize: "10px" }}
                    >◀</button>
                    <span style={{ flex: 1, fontSize: "6px" }}>{fname}</span>
                    <span style={{ color: "#0f0", fontSize: "8px", width: 12 }}>{config[idx]}</span>
                    <button
                      onClick={() => updateFeature(idx, 1)}
                      style={{ background: "none", border: "1px solid #444", color: "#fff", width: 20, height: 20, cursor: "pointer", fontSize: "10px" }}
                    >▶</button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ fontSize: "6px", color: "#666", marginTop: 8 }}>
            DNA: {dnaString}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={randomize}
              style={{ flex: 1, background: "none", border: "1px solid #fff", color: "#fff", padding: 8, cursor: "pointer", fontFamily: "inherit", fontSize: "7px" }}
            >
              🎲 RANDOM
            </button>
            <button
              onClick={() => setStep("info")}
              style={{ flex: 1, background: "#0f0", border: "none", color: "#000", padding: 8, cursor: "pointer", fontFamily: "inherit", fontSize: "7px" }}
            >
              NEXT →
            </button>
          </div>
        </div>
      )}

      {step === "info" && (
        <div style={{
          background: "#111",
          border: "1px solid #333",
          padding: 16,
          maxWidth: 320,
          width: "100%",
        }}>
          <div style={{ fontSize: "8px", color: "#888", marginBottom: 12 }}>
            STEP 2: YOUR INFO
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: "7px", color: "#888", display: "block", marginBottom: 4 }}>NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              style={{
                width: "100%",
                background: "#000",
                border: "1px solid #fff",
                color: "#fff",
                padding: 8,
                fontFamily: "inherit",
                fontSize: "10px",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: "7px", color: "#888", display: "block", marginBottom: 4 }}>ROLE</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Developer, Designer, Agent"
              maxLength={30}
              style={{
                width: "100%",
                background: "#000",
                border: "1px solid #fff",
                color: "#fff",
                padding: 8,
                fontFamily: "inherit",
                fontSize: "10px",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setStep("face")}
              style={{ flex: 1, background: "none", border: "1px solid #fff", color: "#fff", padding: 8, cursor: "pointer", fontFamily: "inherit", fontSize: "7px" }}
            >
              ← BACK
            </button>
            <button
              onClick={() => setStep("card")}
              disabled={!name.trim()}
              style={{ 
                flex: 1, 
                background: name.trim() ? "#0f0" : "#333", 
                border: "none", 
                color: name.trim() ? "#000" : "#666", 
                padding: 8, 
                cursor: name.trim() ? "pointer" : "not-allowed", 
                fontFamily: "inherit", 
                fontSize: "7px" 
              }}
            >
              CREATE →
            </button>
          </div>
        </div>
      )}

      {step === "card" && (
        <div>
          {/* The ID Card */}
          <div 
            ref={cardRef}
            style={{
              background: "#000",
              border: "2px solid #fff",
              padding: 16,
              width: 280,
              position: "relative",
            }}
          >
            {/* Header */}
            <div style={{ 
              borderBottom: "1px solid #444", 
              paddingBottom: 8, 
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: "10px", color: "#0f0" }}>BITFLOOR</span>
              <span style={{ fontSize: "6px", color: "#666" }}>ID CARD</span>
            </div>

            {/* Content */}
            <div style={{ display: "flex", gap: 12 }}>
              {/* Avatar */}
              <div style={{ 
                width: 72, 
                height: 72, 
                border: "1px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#000",
              }}>
                <canvas
                  ref={(el) => {
                    if (el && spriteRef.current) {
                      const ctx = el.getContext("2d");
                      if (ctx) {
                        ctx.imageSmoothingEnabled = false;
                        // White background with tiled pattern
                        ctx.fillStyle = "#fff";
                        ctx.fillRect(0, 0, 64, 64);
                        ctx.drawImage(spriteRef.current, 64, 576, 64, 64, 0, 0, 64, 64);
                        // Draw face features
                        for (let f = 1; f < 8; f++) {
                          const variantX = (config[f] || 0) * AVATAR_SIZE;
                          const featureY = f * AVATAR_SIZE;
                          ctx.drawImage(
                            spriteRef.current,
                            variantX, featureY, AVATAR_SIZE, AVATAR_SIZE,
                            0, 0, 64, 64
                          );
                        }
                      }
                    }
                  }}
                  width={64}
                  height={64}
                  style={{ width: 64, height: 64, imageRendering: "pixelated" }}
                />
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", marginBottom: 4 }}>{name.toUpperCase()}</div>
                <div style={{ fontSize: "8px", color: "#888", marginBottom: 8 }}>{role || "Team Member"}</div>
                <div style={{ fontSize: "6px", color: "#0f0" }}>● ACTIVE</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ 
              borderTop: "1px solid #444", 
              marginTop: 12, 
              paddingTop: 8,
              display: "flex",
              justifyContent: "space-between",
            }}>
              <span style={{ fontSize: "5px", color: "#666" }}>DNA: {dnaString}</span>
              <span style={{ fontSize: "5px", color: "#666" }}>bitfloor.ai</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => setStep("info")}
              style={{ flex: 1, background: "none", border: "1px solid #fff", color: "#fff", padding: 8, cursor: "pointer", fontFamily: "inherit", fontSize: "7px" }}
            >
              ← EDIT
            </button>
            <button
              onClick={() => {
                setName("");
                setRole("");
                setConfig([0, 0, 0, 0, 0, 0, 0, 0]);
                setStep("face");
              }}
              style={{ flex: 1, background: "none", border: "1px solid #fff", color: "#fff", padding: 8, cursor: "pointer", fontFamily: "inherit", fontSize: "7px" }}
            >
              NEW CARD
            </button>
          </div>
          
          <p style={{ fontSize: "6px", color: "#666", marginTop: 16, textAlign: "center" }}>
            Screenshot to save your ID card!
          </p>
        </div>
      )}
    </div>
  );
}
