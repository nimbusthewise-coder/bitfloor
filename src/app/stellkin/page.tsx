"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// === STELLKIN SHIP EDITOR ===
// A clean, focused ship builder for the Stellkin
// Press E to toggle editor mode

const TILE = 32;
const DEFAULT_SHIP_W = 96;  // Doubled for larger ship
const DEFAULT_SHIP_H = 64;  // Doubled for larger ship

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

// Generate EPCOT/Flower-inspired ship layout
function generateStellkinLayout(w: number, h: number): TileType[][] {
  const grid = createEmptyGrid(w, h);
  
  const centerX = Math.floor(w / 2);
  const centerY = Math.floor(h / 2);
  
  // Helper to set tile safely
  const setTile = (x: number, y: number, tile: TileType) => {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      grid[y][x] = tile;
    }
  };
  
  // Helper to fill rectangle
  const fillRect = (x1: number, y1: number, x2: number, y2: number, tile: TileType) => {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setTile(x, y, tile);
      }
    }
  };
  
  // Helper to draw hull outline
  const hullRect = (x1: number, y1: number, x2: number, y2: number) => {
    for (let x = x1; x <= x2; x++) {
      setTile(x, y1, "hull");
      setTile(x, y2, "hull");
    }
    for (let y = y1; y <= y2; y++) {
      setTile(x1, y, "hull");
      setTile(x2, y, "hull");
    }
  };
  
  // === CENTRAL HUB (Bridge) ===
  // 12x12 central room
  const hubSize = 6;
  fillRect(centerX - hubSize, centerY - hubSize, centerX + hubSize, centerY + hubSize, "interior");
  hullRect(centerX - hubSize, centerY - hubSize, centerX + hubSize, centerY + hubSize);
  // Floor at bottom
  fillRect(centerX - hubSize + 1, centerY + hubSize - 1, centerX + hubSize - 1, centerY + hubSize - 1, "floor");
  // Consoles
  setTile(centerX - 3, centerY + hubSize - 2, "console");
  setTile(centerX + 3, centerY + hubSize - 2, "console");
  setTile(centerX, centerY + hubSize - 2, "console");
  // Windows at top
  for (let x = centerX - 4; x <= centerX + 4; x += 2) {
    setTile(x, centerY - hubSize, "window");
  }
  
  // === RADIAL CORRIDORS (4 directions) ===
  const corridorLength = 18;
  const corridorWidth = 3;
  
  // North corridor (to Observatory)
  fillRect(centerX - corridorWidth/2 |0, centerY - hubSize - corridorLength, centerX + corridorWidth/2 |0, centerY - hubSize, "interior");
  hullRect(centerX - corridorWidth/2 |0 - 1, centerY - hubSize - corridorLength, centerX + corridorWidth/2 |0 + 1, centerY - hubSize);
  // Floor/ceiling for gravity play
  fillRect(centerX - corridorWidth/2 |0, centerY - hubSize - corridorLength, centerX + corridorWidth/2 |0, centerY - hubSize - corridorLength, "floor");
  
  // South corridor (to Landing Bay)  
  fillRect(centerX - corridorWidth/2 |0, centerY + hubSize, centerX + corridorWidth/2 |0, centerY + hubSize + corridorLength, "interior");
  hullRect(centerX - corridorWidth/2 |0 - 1, centerY + hubSize, centerX + corridorWidth/2 |0 + 1, centerY + hubSize + corridorLength);
  fillRect(centerX - corridorWidth/2 |0, centerY + hubSize + corridorLength, centerX + corridorWidth/2 |0, centerY + hubSize + corridorLength, "floor");
  
  // East corridor (to Games/Crew)
  fillRect(centerX + hubSize, centerY - corridorWidth/2 |0, centerX + hubSize + corridorLength, centerY + corridorWidth/2 |0, "interior");
  hullRect(centerX + hubSize, centerY - corridorWidth/2 |0 - 1, centerX + hubSize + corridorLength, centerY + corridorWidth/2 |0 + 1);
  // Floors on sides for LEFT/RIGHT gravity
  for (let x = centerX + hubSize; x <= centerX + hubSize + corridorLength; x++) {
    setTile(x, centerY + corridorWidth/2 |0 + 1, "floor");
  }
  
  // West corridor (to Engineering)
  fillRect(centerX - hubSize - corridorLength, centerY - corridorWidth/2 |0, centerX - hubSize, centerY + corridorWidth/2 |0, "interior");
  hullRect(centerX - hubSize - corridorLength, centerY - corridorWidth/2 |0 - 1, centerX - hubSize, centerY + corridorWidth/2 |0 + 1);
  for (let x = centerX - hubSize - corridorLength; x <= centerX - hubSize; x++) {
    setTile(x, centerY + corridorWidth/2 |0 + 1, "floor");
  }
  
  // === PETAL ROOMS ===
  
  // NORTH PETAL: Observatory/Lounge (best view of stars)
  const petalW = 14;
  const petalH = 10;
  const northY = centerY - hubSize - corridorLength - petalH;
  fillRect(centerX - petalW/2, northY, centerX + petalW/2, northY + petalH, "interior");
  hullRect(centerX - petalW/2, northY, centerX + petalW/2, northY + petalH);
  // Big windows
  for (let x = centerX - petalW/2 + 2; x <= centerX + petalW/2 - 2; x++) {
    setTile(x, northY, "window");
  }
  // Floor
  fillRect(centerX - petalW/2 + 1, northY + petalH - 1, centerX + petalW/2 - 1, northY + petalH - 1, "floor");
  // Comfortable seating (tables)
  setTile(centerX - 3, northY + petalH - 2, "table");
  setTile(centerX + 3, northY + petalH - 2, "table");
  
  // SOUTH PETAL: Landing Bay (large, open)
  const southY = centerY + hubSize + corridorLength;
  const bayW = 20;
  const bayH = 12;
  fillRect(centerX - bayW/2, southY, centerX + bayW/2, southY + bayH, "interior");
  hullRect(centerX - bayW/2, southY, centerX + bayW/2, southY + bayH);
  // Large door at bottom
  for (let x = centerX - 4; x <= centerX + 4; x++) {
    setTile(x, southY + bayH, "door");
  }
  // Floor
  fillRect(centerX - bayW/2 + 1, southY + bayH - 1, centerX + bayW/2 - 1, southY + bayH - 1, "floor");
  // Platform for ships (elevated)
  fillRect(centerX - 6, southY + bayH - 4, centerX + 6, southY + bayH - 4, "floor");
  
  // EAST PETAL: Crew Quarters (3 bunks)
  const eastX = centerX + hubSize + corridorLength;
  const crewW = 16;
  const crewH = 14;
  fillRect(eastX, centerY - crewH/2, eastX + crewW, centerY + crewH/2, "interior");
  hullRect(eastX, centerY - crewH/2, eastX + crewW, centerY + crewH/2);
  // Floor
  fillRect(eastX + 1, centerY + crewH/2 - 1, eastX + crewW - 1, centerY + crewH/2 - 1, "floor");
  // Three bunks (JP violet, Nimbus cyan, CODEX orange - represented by beds)
  setTile(eastX + 3, centerY + crewH/2 - 2, "bed");
  setTile(eastX + 8, centerY + crewH/2 - 2, "bed");
  setTile(eastX + 13, centerY + crewH/2 - 2, "bed");
  // Windows
  setTile(eastX + crewW, centerY - 2, "window");
  setTile(eastX + crewW, centerY + 2, "window");
  
  // WEST PETAL: Engineering + Teleporter
  const westX = centerX - hubSize - corridorLength - crewW;
  fillRect(westX, centerY - crewH/2, westX + crewW, centerY + crewH/2, "interior");
  hullRect(westX, centerY - crewH/2, westX + crewW, centerY + crewH/2);
  // Floor
  fillRect(westX + 1, centerY + crewH/2 - 1, westX + crewW - 1, centerY + crewH/2 - 1, "floor");
  // Consoles (engineering)
  setTile(westX + 2, centerY + crewH/2 - 2, "console");
  setTile(westX + 4, centerY + crewH/2 - 2, "console");
  setTile(westX + 6, centerY + crewH/2 - 2, "console");
  // Teleporter pad (door tiles as pad)
  fillRect(westX + 10, centerY + crewH/2 - 3, westX + 14, centerY + crewH/2 - 3, "door");
  fillRect(westX + 10, centerY + crewH/2 - 2, westX + 14, centerY + crewH/2 - 2, "door");
  
  // === DIAGONAL PETALS (Games area - NE, NW corners) ===
  
  // NE: Games Room
  const diagOffset = 16;
  const gamesX = centerX + diagOffset;
  const gamesY = centerY - diagOffset;
  const gamesSize = 10;
  fillRect(gamesX, gamesY, gamesX + gamesSize, gamesY + gamesSize, "interior");
  hullRect(gamesX, gamesY, gamesX + gamesSize, gamesY + gamesSize);
  fillRect(gamesX + 1, gamesY + gamesSize - 1, gamesX + gamesSize - 1, gamesY + gamesSize - 1, "floor");
  // Arcade tables
  setTile(gamesX + 3, gamesY + gamesSize - 2, "table");
  setTile(gamesX + 7, gamesY + gamesSize - 2, "table");
  // Connect to east corridor with small hallway
  fillRect(centerX + hubSize + 3, centerY - corridorWidth/2 - 6, centerX + hubSize + 6, centerY - corridorWidth/2 - 1, "interior");
  fillRect(gamesX, gamesY + gamesSize - 2, gamesX - 3, gamesY + gamesSize - 2, "floor");
  
  // === JUMP PLATFORMS (scattered for vertical navigation) ===
  // Add small platforms in corridors for jumping practice
  
  // North corridor platforms
  setTile(centerX - 2, centerY - hubSize - 6, "floor");
  setTile(centerX + 2, centerY - hubSize - 10, "floor");
  setTile(centerX, centerY - hubSize - 14, "floor");
  
  // South corridor platforms  
  setTile(centerX - 2, centerY + hubSize + 6, "floor");
  setTile(centerX + 2, centerY + hubSize + 10, "floor");
  
  return grid;
}

export default function StellkinPage() {
  // Grid state (start with generated Stellkin layout)
  const [grid, setGrid] = useState<TileType[][]>(() => generateStellkinLayout(DEFAULT_SHIP_W, DEFAULT_SHIP_H));
  const [shipW] = useState(DEFAULT_SHIP_W);
  const [shipH] = useState(DEFAULT_SHIP_H);
  
  // View state (pan & zoom)
  const [zoom, setZoom] = useState(0.5);  // Start zoomed out to see whole ship
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
  
  // Track spacebar for pan mode (Photoshop style)
  const [spaceHeld, setSpaceHeld] = useState(false);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && !e.repeat) {
        e.preventDefault();  // Prevent page scroll
        setSpaceHeld(true);
      }
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
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setSpaceHeld(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
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
    // Spacebar + click = pan (works in any mode, like Photoshop)
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      // Middle click or Space+click = pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX * zoom, y: e.clientY - panY * zoom });
      return;
    }
    
    if (!editorMode) return;
    
    if (e.button === 0) {
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
    
    // Draw center lines (crosshairs)
    if (showGrid && editorMode) {
      ctx.strokeStyle = "rgba(0, 255, 255, 0.4)";
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      
      // Vertical center line
      const centerX = (shipW / 2) * TILE;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, shipH * TILE);
      ctx.stroke();
      
      // Horizontal center line
      const centerY = (shipH / 2) * TILE;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(shipW * TILE, centerY);
      ctx.stroke();
      
      ctx.setLineDash([]);
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
          cursor: isPanning ? "grabbing" : spaceHeld ? "grab" : editorMode ? "crosshair" : "default",
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
              onClick={() => setGrid(generateStellkinLayout(shipW, shipH))}
              style={{
                width: "100%",
                padding: "8px",
                background: "#ff6600",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 8,
                fontFamily: "inherit",
                marginBottom: 4,
              }}
            >
              🌸 GENERATE
            </button>
            <button
              onClick={() => setGrid(createEmptyGrid(shipW, shipH))}
              style={{
                width: "100%",
                padding: "8px",
                background: "#660000",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 8,
                fontFamily: "inherit",
                marginBottom: 4,
              }}
            >
              🗑️ CLEAR
            </button>
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
          <>Left-click: place | Right-click: erase | Scroll: zoom | Space+drag: pan | E: toggle mode | G: grid</>
        ) : (
          <>WASD: move | Space+drag: pan | E: toggle editor</>
        )}
      </div>
    </div>
  );
}
