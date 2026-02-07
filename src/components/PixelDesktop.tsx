"use client";

import { useState, useEffect, useRef } from "react";

// Grid unit - all measurements are multiples of this
const UNIT = 8;
const AVATAR_SIZE = 64; // Native sprite size

// Simple pixel avatar using canvas
function PixelAvatar({ 
  config, 
  onClick 
}: { 
  config: number[]; 
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = "/sprites/face.png";
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
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);

    // Draw each feature layer
    for (let f = 1; f < 8; f++) {
      const variantX = (config[f] || 0) * AVATAR_SIZE;
      const featureY = f * AVATAR_SIZE;
      ctx.drawImage(
        spriteRef.current,
        variantX, featureY, AVATAR_SIZE, AVATAR_SIZE,
        0, 0, AVATAR_SIZE, AVATAR_SIZE
      );
    }
  }, [config, loaded]);

  return (
    <canvas
      ref={canvasRef}
      width={AVATAR_SIZE}
      height={AVATAR_SIZE}
      onClick={onClick}
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        cursor: onClick ? "pointer" : "default",
        imageRendering: "pixelated",
      }}
    />
  );
}

function generateRandomFace(): number[] {
  const face: number[] = [];
  for (let f = 0; f < 8; f++) {
    face.push(Math.floor(Math.random() * 10));
  }
  return face;
}

// Pixel-perfect window component
interface PixelWindowProps {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  onClose: () => void;
  onFocus: () => void;
  onDrag: (x: number, y: number) => void;
  children: React.ReactNode;
}

function PixelWindow({
  title,
  x,
  y,
  width,
  height,
  zIndex,
  onClose,
  onFocus,
  onDrag,
  children,
}: PixelWindowProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onFocus();
    setIsDragging(true);
    setDragStart({ x: e.clientX - x, y: e.clientY - y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    // Snap to grid
    const newX = Math.round((e.clientX - dragStart.x) / UNIT) * UNIT;
    const newY = Math.round((e.clientY - dragStart.y) / UNIT) * UNIT;
    onDrag(Math.max(0, newX), Math.max(UNIT * 2, newY));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const titleBarHeight = UNIT * 2; // 16px

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: width,
        zIndex,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={onFocus}
    >
      {/* Layered depth shadow - multiple offset layers */}
      <div
        style={{
          position: "absolute",
          left: 3,
          top: 3,
          width: width,
          height: height + titleBarHeight,
          background: "#222",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 2,
          top: 2,
          width: width,
          height: height + titleBarHeight,
          background: "#444",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: width,
          height: height + titleBarHeight,
          background: "#666",
        }}
      />

      {/* Window */}
      <div
        style={{
          position: "relative",
          width: width,
          height: height + titleBarHeight,
          background: "#000",
          border: "1px solid #fff",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            height: titleBarHeight,
            background: "#fff",
            color: "#000",
            display: "flex",
            alignItems: "center",
            padding: `0 ${UNIT / 2}px`,
            cursor: "move",
            borderBottom: "1px solid #000",
            gap: UNIT,
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Close button - classic Mac style box */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              width: 12,
              height: 12,
              border: "1px solid #000",
              background: "#fff",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />

          {/* Title - centered */}
          <span style={{ 
            flex: 1, 
            textAlign: "center",
            fontSize: "8px", 
            textTransform: "uppercase", 
            letterSpacing: "1px",
            fontFamily: "inherit",
          }}>
            {title}
          </span>

          {/* Spacer for symmetry */}
          <div style={{ width: 12, flexShrink: 0 }} />
        </div>

        {/* Content */}
        <div
          style={{
            height: height,
            padding: UNIT / 2,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Main desktop
type WinType = "identity" | "note" | "about" | "chat";

interface Win {
  id: string;
  type: WinType;
  x: number;
  y: number;
  z: number;
}

export function PixelDesktop() {
  const [windows, setWindows] = useState<Win[]>([
    { id: "identity-1", type: "identity", x: UNIT * 2, y: UNIT * 4, z: 1 },
  ]);
  const [topZ, setTopZ] = useState(1);
  const [time, setTime] = useState("");
  const [avatarConfig, setAvatarConfig] = useState<number[]>(() => generateRandomFace());

  // Clock
  useState(() => {
    const update = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      );
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  });

  const addWindow = (type: WinType) => {
    const newZ = topZ + 1;
    setTopZ(newZ);
    const offset = (windows.length % 4) * UNIT * 2;
    setWindows([
      ...windows,
      {
        id: `${type}-${Date.now()}`,
        type,
        x: UNIT * 8 + offset,
        y: UNIT * 6 + offset,
        z: newZ,
      },
    ]);
  };

  const closeWindow = (id: string) => {
    setWindows(windows.filter((w) => w.id !== id));
  };

  const focusWindow = (id: string) => {
    const newZ = topZ + 1;
    setTopZ(newZ);
    setWindows(windows.map((w) => (w.id === id ? { ...w, z: newZ } : w)));
  };

  const moveWindow = (id: string, x: number, y: number) => {
    setWindows(windows.map((w) => (w.id === id ? { ...w, x, y } : w)));
  };

  const menuBarHeight = UNIT * 2;

  return (
    <div
      style={{
        width: 640,
        height: 360,
        background: "#000",
        position: "relative",
        fontFamily: "'Press Start 2P', monospace",
        fontSize: "8px",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Menu bar */}
      <div
        style={{
          height: menuBarHeight,
          borderBottom: "1px solid #fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${UNIT}px`,
        }}
      >
        <div style={{ display: "flex", gap: UNIT * 2 }}>
          <button
            onClick={() => addWindow("chat")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit" }}
          >
            CHAT
          </button>
          <button
            onClick={() => addWindow("note")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit" }}
          >
            NOTE
          </button>
          <button
            onClick={() => addWindow("about")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit" }}
          >
            ABOUT
          </button>
        </div>
        <div>{time}</div>
      </div>

      {/* Desktop area */}
      <div style={{ position: "relative", height: 360 - menuBarHeight }}>
        {/* Grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.05,
            backgroundImage: `
              repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent ${UNIT}px),
              repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent ${UNIT}px)
            `,
          }}
        />

        {/* Windows */}
        {windows.map((win) => {
          if (win.type === "identity") {
            return (
              <PixelWindow
                key={win.id}
                title="Identity"
                x={win.x}
                y={win.y}
                width={UNIT * 20}
                height={UNIT * 24}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ textAlign: "center" }}>
                  {/* Avatar */}
                  <div
                    style={{
                      border: "1px solid #fff",
                      margin: "0 auto",
                      marginBottom: UNIT,
                      width: AVATAR_SIZE + 2,
                      height: AVATAR_SIZE + 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <PixelAvatar 
                      config={avatarConfig} 
                      onClick={() => setAvatarConfig(generateRandomFace())}
                    />
                  </div>
                  <div style={{ fontSize: "8px", marginBottom: 2 }}>NIMBUS</div>
                  <div style={{ color: "#888", marginBottom: UNIT }}>Chief Strategist</div>
                  <div>● ACTIVE Lv.5</div>
                  <div
                    style={{
                      borderTop: "1px solid #444",
                      marginTop: UNIT,
                      paddingTop: UNIT,
                      display: "flex",
                      justifyContent: "space-around",
                    }}
                  >
                    <div>♡ 42</div>
                    <div>◎ 1337</div>
                    <div>⚡ 7</div>
                  </div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "note") {
            return (
              <PixelWindow
                key={win.id}
                title="Note"
                x={win.x}
                y={win.y}
                width={UNIT * 16}
                height={UNIT * 12}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ color: "#888" }}>Type a note...</div>
              </PixelWindow>
            );
          }
          if (win.type === "about") {
            return (
              <PixelWindow
                key={win.id}
                title="About"
                x={win.x}
                y={win.y}
                width={UNIT * 24}
                height={UNIT * 14}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", marginBottom: UNIT }}>BITFLOOR</div>
                  <div style={{ color: "#888", marginBottom: UNIT }}>v0.1.0</div>
                  <div>A pixel-art digital</div>
                  <div>office where humans</div>
                  <div>and AI coexist.</div>
                  <div style={{ color: "#888", marginTop: UNIT }}>bitfloor.ai</div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "chat") {
            return (
              <PixelWindow
                key={win.id}
                title="Team Chat"
                x={win.x}
                y={win.y}
                width={UNIT * 28}
                height={UNIT * 20}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div style={{ flex: 1, borderBottom: "1px solid #444", marginBottom: UNIT / 2, paddingBottom: UNIT / 2, overflow: "auto" }}>
                    <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>Nimbus:</span> Working on UI...</div>
                    <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>JP:</span> Looks great!</div>
                    <div style={{ marginBottom: 4 }}><span style={{ color: "#888" }}>Nimbus:</span> Adding chat now</div>
                  </div>
                  <div style={{ 
                    border: "1px solid #fff", 
                    padding: "2px 4px",
                    color: "#888",
                  }}>
                    Type here...
                  </div>
                </div>
              </PixelWindow>
            );
          }
          return null;
        })}
      </div>

      {/* Status bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: menuBarHeight,
          borderTop: "1px solid #444",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${UNIT}px`,
          color: "#888",
        }}
      >
        <span>READY</span>
        <span>{windows.length} WINDOW{windows.length !== 1 ? "S" : ""}</span>
      </div>
    </div>
  );
}

export default PixelDesktop;
