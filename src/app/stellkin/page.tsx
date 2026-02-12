"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// === STELLKIN SHIP EDITOR ===
// A clean, focused ship builder for the Stellkin
// Press E to toggle editor mode

const TILE = 32;
const DEFAULT_SHIP_W = 48;  // Wider ship canvas
const DEFAULT_SHIP_H = 32;  // Taller ship canvas

// Tile types and colors (Moebius palette)
const TILES = {
  space: { color: "#000000", solid: false, name: "Space" },
  hull: { color: "#00ffff", solid: true, name: "Hull" },
  hullLight: { color: "#ffffff", solid: true, name: "Hull Light" },
  interior: { color: "#1a1a3a", solid: false, name: "Interior" },
  floor: { color: "#00cccc", solid: true, name: "Floor" },
  window: { color: "#66ffff", solid: false, name: "Window" },
  console: { color: "#ff0066", solid: true, name: "Console" },
  door: { color: "#00ff88", solid: false, name: "Door" },
  bed: { color: "#9966ff", solid: true, name: "Bed" },
  table: { color: "#ff9900", solid: true, name: "Table" },
} as const;

type TileType = keyof typeof TILES;

// Initialize empty grid
function createEmptyGrid(w: number, h: number): TileType[][] {
  return Array(h).fill(null).map(() => Array(w).fill("space" as TileType));
}

export default function StellkinPage() {
  // Grid state
  const [grid, setGrid] = useState<TileType[][]>(() => createEmptyGrid(DEFAULT_SHIP_W, DEFAULT_SHIP_H));
  const [shipW] = useState(DEFAULT_SHIP_W);
  const [shipH] = useState(DEFAULT_SHIP_H);
  
  // View state (pan & zoom)
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Editor state
  const [editorMode, setEditorMode] = useState(true);  // Start in editor mode
  const [selectedTile, setSelectedTile] = useState<TileType>("floor");
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<"place" | "erase">("place");
  
  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "e" && !e.repeat) {
        setEditorMode(prev => !prev);
      }
      if (e.key.toLowerCase() === "g" && !e.repeat) {
        setShowGrid(prev => !prev);
      }
      // Arrow keys for panning
      const panSpeed = 20 / zoom;
      if (e.key === "ArrowLeft") setPanX(p => p + panSpeed);
      if (e.key === "ArrowRight") setPanX(p => p - panSpeed);
      if (e.key === "ArrowUp") setPanY(p => p + panSpeed);
      if (e.key === "ArrowDown") setPanY(p => p - panSpeed);
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoom]);
  
  // Mouse wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.min(Math.max(z * zoomFactor, 0.25), 4));
    };
    
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);
  
  // Convert screen coords to grid coords
  const screenToGrid = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    
    // Account for pan and zoom (centered)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const worldX = (canvasX - centerX) / zoom - panX + (shipW * TILE) / 2;
    const worldY = (canvasY - centerY) / zoom - panY + (shipH * TILE) / 2;
    
    const tileX = Math.floor(worldX / TILE);
    const tileY = Math.floor(worldY / TILE);
    
    if (tileX >= 0 && tileX < shipW && tileY >= 0 && tileY < shipH) {
      return { x: tileX, y: tileY };
    }
    return null;
  }, [zoom, panX, panY, shipW, shipH]);
  
  // Place or erase tile
  const modifyTile = useCallback((screenX: number, screenY: number, mode: "place" | "erase") => {
    const gridPos = screenToGrid(screenX, screenY);
    if (!gridPos) return;
    
    setGrid(prev => {
      const newGrid = prev.map(row => [...row]);
      newGrid[gridPos.y][gridPos.x] = mode === "place" ? selectedTile : "space";
      return newGrid;
    });
  }, [screenToGrid, selectedTile]);
  
  // Mouse handlers for drawing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editorMode) return;
    
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click = pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX * zoom, y: e.clientY - panY * zoom });
    } else if (e.button === 0) {
      // Left click = place
      setIsDrawing(true);
      setDrawMode("place");
      modifyTile(e.clientX, e.clientY, "place");
    } else if (e.button === 2) {
      // Right click = erase
      setIsDrawing(true);
      setDrawMode("erase");
      modifyTile(e.clientX, e.clientY, "erase");
    }
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanX((e.clientX - panStart.x) / zoom);
      setPanY((e.clientY - panStart.y) / zoom);
    } else if (isDrawing && editorMode) {
      modifyTile(e.clientX, e.clientY, drawMode);
    }
  };
  
  const handleMouseUp = () => {
    setIsDrawing(false);
    setIsPanning(false);
  };
  
  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    // Full screen canvas
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Transform for pan & zoom (centered)
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(panX, panY);
    ctx.translate(-(shipW * TILE) / 2, -(shipH * TILE) / 2);
    
    // Draw tiles
    for (let y = 0; y < shipH; y++) {
      for (let x = 0; x < shipW; x++) {
        const tile = grid[y][x];
        const tileData = TILES[tile];
        
        ctx.fillStyle = tileData.color;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        
        // Grid lines
        if (showGrid && editorMode) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
          ctx.lineWidth = 1 / zoom;
          ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
    
    // Draw ship boundary
    ctx.strokeStyle = editorMode ? "#00ffff" : "#333";
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, shipW * TILE, shipH * TILE);
    
    ctx.restore();
    
    // HUD - Ship name
    ctx.font = "bold 16px 'Press Start 2P', monospace";
    ctx.fillStyle = "#00ffff";
    ctx.textAlign = "center";
    ctx.fillText("STELLKIN", canvas.width / 2, 30);
    
    // Mode indicator
    ctx.font = "10px 'Press Start 2P', monospace";
    ctx.fillStyle = editorMode ? "#00ff88" : "#888";
    ctx.textAlign = "left";
    ctx.fillText(editorMode ? "✏️ EDITOR MODE" : "🎮 PLAY MODE", 20, 30);
    
    // Zoom indicator
    ctx.fillStyle = "#888";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(zoom * 100)}%`, canvas.width - 20, 30);
    
  }, [grid, zoom, panX, panY, shipW, shipH, showGrid, editorMode]);
  
  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  // Save/Load
  const saveShip = () => {
    const data = JSON.stringify({ grid, shipW, shipH, version: 1 });
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stellkin-ship.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const loadShip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.grid) {
          setGrid(data.grid);
        }
      } catch (err) {
        console.error("Failed to load ship:", err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div 
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0a0a0f",
        position: "relative",
        fontFamily: "'Press Start 2P', monospace",
      }}
    >
      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          display: "block",
          cursor: isPanning ? "grabbing" : editorMode ? "crosshair" : "default",
          imageRendering: "pixelated",
        }}
      />
      
      {/* Tile Palette (Editor Mode) */}
      {editorMode && (
        <div style={{
          position: "absolute",
          left: 20,
          top: 60,
          background: "rgba(10, 10, 20, 0.95)",
          border: "1px solid #00ffff",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: "calc(100vh - 100px)",
          overflowY: "auto",
        }}>
          <div style={{ color: "#00ffff", fontSize: 8, marginBottom: 4 }}>TILES</div>
          {Object.entries(TILES).map(([key, tile]) => (
            <button
              key={key}
              onClick={() => setSelectedTile(key as TileType)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: selectedTile === key ? "#00ffff" : "transparent",
                color: selectedTile === key ? "#000" : "#fff",
                border: `1px solid ${selectedTile === key ? "#00ffff" : "#444"}`,
                cursor: "pointer",
                fontSize: 8,
                fontFamily: "inherit",
              }}
            >
              <div style={{
                width: 16,
                height: 16,
                background: tile.color,
                border: "1px solid #666",
              }} />
              {tile.name}
            </button>
          ))}
          
          <div style={{ borderTop: "1px solid #333", marginTop: 8, paddingTop: 8 }}>
            <button
              onClick={saveShip}
              style={{
                width: "100%",
                padding: "8px",
                background: "#0066ff",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 8,
                fontFamily: "inherit",
                marginBottom: 4,
              }}
            >
              💾 SAVE
            </button>
            <label style={{
              display: "block",
              width: "100%",
              padding: "8px",
              background: "#006644",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 8,
              fontFamily: "inherit",
              textAlign: "center",
            }}>
              📂 LOAD
              <input
                type="file"
                accept=".json"
                onChange={loadShip}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>
      )}
      
      {/* Controls hint */}
      <div style={{
        position: "absolute",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        color: "#666",
        fontSize: 8,
        textAlign: "center",
      }}>
        {editorMode ? (
          <>Left-click: place | Right-click: erase | Scroll: zoom | Alt+drag: pan | E: toggle mode | G: grid</>
        ) : (
          <>WASD: move | E: toggle editor</>
        )}
      </div>
    </div>
  );
}
