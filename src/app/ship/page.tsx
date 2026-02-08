"use client";

import { useState, useRef, useEffect } from "react";

// Color palette
const COLORS = {
  space: "#000000",
  hull: "#00ffff",
  hullLight: "#ffffff",
  interior: "#3333aa",
  window: "#66ffff",
  floor: "#00cccc",
  console: "#ff0066",
  desk: "#4444cc",
  shaft: "#1a1a4a",    // Vertical shafts (darker, passable)
  hallway: "#2a2a6a",  // Hallway floors
};

const TILE = 32;

// Full ship dimensions (larger than viewport)
const SHIP_W = 32; // 1024px total
const SHIP_H = 16; // 512px total (2 decks × 5 tiles + hull)

// Viewport dimensions  
const VIEW_W = 20; // 640px visible
const VIEW_H = 12; // 384px visible

// Room height: 4 tiles vertical space + 1 tile floor = 5 tiles
const ROOM_H = 5;

type CellType = keyof typeof COLORS;

// Room definitions - think architecturally
// Each room is a rectangular area with a position and size
interface Room {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "room" | "hallway" | "shaft" | "hull";
  color?: CellType;
}

const rooms: Room[] = [
  // === UPPER DECK (rows 1-5, 5 tiles: 4 space + 1 floor) ===
  // Engine Room (left)
  { name: "Engine", x: 1, y: 1, w: 4, h: ROOM_H, type: "room" },
  // Upper Hallway
  { name: "Hall", x: 5, y: 1, w: 2, h: ROOM_H, type: "hallway" },
  // Shaft 1 (vertical connection - spans both decks)
  { name: "Shaft", x: 7, y: 1, w: 2, h: ROOM_H * 2, type: "shaft" },
  // Bridge
  { name: "Bridge", x: 9, y: 1, w: 6, h: ROOM_H, type: "room" },
  // Upper Hallway Right
  { name: "Hall", x: 15, y: 1, w: 2, h: ROOM_H, type: "hallway" },
  // Shaft 2
  { name: "Shaft", x: 17, y: 1, w: 2, h: ROOM_H * 2, type: "shaft" },
  // Quarters
  { name: "Quarters", x: 19, y: 1, w: 5, h: ROOM_H, type: "room" },
  // Medical
  { name: "Medical", x: 24, y: 1, w: 5, h: ROOM_H, type: "room" },
  
  // === LOWER DECK (rows 6-10, 5 tiles: 4 space + 1 floor) ===
  // Cargo Bay
  { name: "Cargo", x: 1, y: 1 + ROOM_H, w: 4, h: ROOM_H, type: "room" },
  // Lower Hallway
  { name: "Hall", x: 5, y: 1 + ROOM_H, w: 2, h: ROOM_H, type: "hallway" },
  // (Shaft 1 spans here)
  // Mess Hall
  { name: "Mess Hall", x: 9, y: 1 + ROOM_H, w: 6, h: ROOM_H, type: "room" },
  // Lower Hallway R
  { name: "Hall", x: 15, y: 1 + ROOM_H, w: 2, h: ROOM_H, type: "hallway" },
  // (Shaft 2 spans here)
  // Recreation
  { name: "Rec Room", x: 19, y: 1 + ROOM_H, w: 5, h: ROOM_H, type: "room" },
  // Storage
  { name: "Storage", x: 24, y: 1 + ROOM_H, w: 5, h: ROOM_H, type: "room" },
];

// Generate the ship grid from room definitions
function generateShipGrid(): CellType[][] {
  // Start with space
  const grid: CellType[][] = Array(SHIP_H).fill(null).map(() => 
    Array(SHIP_W).fill("space" as CellType)
  );
  
  // Draw hull outline (row 0 top, row 11+ bottom)
  for (let x = 0; x < SHIP_W - 3; x++) {
    grid[0][x] = "hull";
    grid[11][x] = "hull";
    grid[12][x] = "hull";
  }
  
  // Side hull
  for (let y = 0; y < 13; y++) {
    grid[y][0] = "hull";
    if (SHIP_W - 4 >= 0) grid[y][SHIP_W - 4] = "hull";
  }
  
  // Draw each room
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h && y < SHIP_H; y++) {
      for (let x = room.x; x < room.x + room.w && x < SHIP_W; x++) {
        if (room.type === "shaft") {
          grid[y][x] = "shaft";
        } else if (room.type === "hallway") {
          grid[y][x] = "hallway";
        } else {
          grid[y][x] = "interior";
        }
        
        // Floor on bottom row of room (not for shafts)
        if (y === room.y + room.h - 1 && room.type !== "shaft") {
          grid[y][x] = "floor";
        }
      }
    }
  }
  
  // Add windows in Bridge (row 2)
  for (let x = 10; x < 14; x++) {
    if (grid[2][x] === "interior") grid[2][x] = "window";
  }
  
  // Add windows in Quarters
  for (let x = 20; x < 23; x++) {
    if (grid[2][x] === "interior") grid[2][x] = "window";
  }
  
  // Add consoles in engine room (near floor, row 4)
  if (grid[4][2]) grid[4][2] = "console";
  if (grid[4][3]) grid[4][3] = "console";
  
  // Add consoles in bridge
  if (grid[4][10]) grid[4][10] = "console";
  if (grid[4][13]) grid[4][13] = "console";
  
  // Add desks in quarters
  if (grid[4][21]) grid[4][21] = "desk";
  if (grid[4][22]) grid[4][22] = "desk";
  
  // Add desks in mess hall (lower deck, row 9)
  if (grid[9][11]) grid[9][11] = "desk";
  if (grid[9][12]) grid[9][12] = "desk";
  if (grid[9][13]) grid[9][13] = "desk";
  
  return grid;
}

const shipGrid = generateShipGrid();

export default function ShipPage() {
  const [showGrid, setShowGrid] = useState(true);
  const [viewX, setViewX] = useState(0);
  const [viewY, setViewY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll handling
  const handleScroll = (dx: number, dy: number) => {
    setViewX(x => Math.max(0, Math.min(SHIP_W - VIEW_W, x + dx)));
    setViewY(y => Math.max(0, Math.min(SHIP_H - VIEW_H, y + dy)));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleScroll(-1, 0);
      if (e.key === "ArrowRight") handleScroll(1, 0);
      if (e.key === "ArrowUp") handleScroll(0, -1);
      if (e.key === "ArrowDown") handleScroll(0, 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Get visible portion of grid
  const visibleGrid = shipGrid
    .slice(viewY, viewY + VIEW_H)
    .map(row => row.slice(viewX, viewX + VIEW_W));

  // Get room labels that are visible
  const visibleRooms = rooms.filter(room => 
    room.x + room.w > viewX && room.x < viewX + VIEW_W &&
    room.y + room.h > viewY && room.y < viewY + VIEW_H
  );

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
        BITSHIP - DECK VIEW
      </h1>

      {/* Controls */}
      <div style={{ marginBottom: 20, display: "flex", gap: 10 }}>
        <button
          onClick={() => setShowGrid(g => !g)}
          style={{
            padding: "4px 8px",
            background: showGrid ? "#0f0" : "#333",
            color: showGrid ? "#000" : "#fff",
            border: "1px solid #0f0",
            cursor: "pointer",
          }}
        >
          GRID {showGrid ? "ON" : "OFF"}
        </button>
        <span style={{ color: "#666", alignSelf: "center" }}>
          Arrow keys to scroll | View: ({viewX}, {viewY})
        </span>
      </div>

      {/* Ship viewport */}
      <div 
        ref={containerRef}
        style={{
          position: "relative",
          width: VIEW_W * TILE,
          height: VIEW_H * TILE,
          background: COLORS.space,
          border: "2px solid #00ffff",
          overflow: "hidden",
        }}
        tabIndex={0}
      >
        {/* Render visible cells */}
        {visibleGrid.map((row, vy) => (
          row.map((cell, vx) => (
            <div
              key={`${vx}-${vy}`}
              style={{
                position: "absolute",
                left: vx * TILE,
                top: vy * TILE,
                width: TILE,
                height: TILE,
                background: COLORS[cell],
                boxSizing: "border-box",
                border: showGrid ? "1px solid rgba(255,255,255,0.1)" : "none",
              }}
            />
          ))
        ))}

        {/* Room labels */}
        {visibleRooms.map(room => {
          const labelX = (room.x - viewX + room.w / 2) * TILE;
          const labelY = (room.y - viewY + room.h / 2) * TILE;
          if (labelX < 0 || labelX > VIEW_W * TILE) return null;
          if (labelY < 0 || labelY > VIEW_H * TILE) return null;
          return (
            <div
              key={room.name}
              style={{
                position: "absolute",
                left: labelX,
                top: labelY,
                transform: "translate(-50%, -50%)",
                color: room.type === "shaft" ? "#66ffff" : "#0f0",
                fontSize: 8,
                opacity: 0.8,
                textShadow: "1px 1px 2px #000",
                whiteSpace: "nowrap",
              }}
            >
              {room.name.toUpperCase()}
            </div>
          );
        })}
      </div>

      {/* Minimap */}
      <div style={{ marginTop: 20 }}>
        <div style={{ color: "#888", marginBottom: 8, fontSize: 8 }}>MINIMAP</div>
        <div style={{
          position: "relative",
          width: SHIP_W * 4,
          height: SHIP_H * 4,
          background: "#111",
          border: "1px solid #333",
        }}>
          {/* Mini cells */}
          {shipGrid.map((row, y) => (
            row.map((cell, x) => (
              <div
                key={`m-${x}-${y}`}
                style={{
                  position: "absolute",
                  left: x * 4,
                  top: y * 4,
                  width: 4,
                  height: 4,
                  background: COLORS[cell],
                }}
              />
            ))
          ))}
          {/* Viewport indicator */}
          <div style={{
            position: "absolute",
            left: viewX * 4,
            top: viewY * 4,
            width: VIEW_W * 4,
            height: VIEW_H * 4,
            border: "1px solid #0f0",
            boxSizing: "border-box",
          }} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 20, display: "flex", gap: 15, flexWrap: "wrap" }}>
        {Object.entries(COLORS).map(([name, color]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 12,
              height: 12,
              background: color,
              border: "1px solid #444",
            }} />
            <span style={{ color: "#666", fontSize: 8 }}>{name}</span>
          </div>
        ))}
      </div>

      {/* Info */}
      <div style={{ marginTop: 15, color: "#666", fontSize: 8 }}>
        Ship: {SHIP_W}×{SHIP_H} tiles ({SHIP_W * TILE}×{SHIP_H * TILE}px) | 
        Viewport: {VIEW_W}×{VIEW_H} | Tile: {TILE}px
      </div>
    </div>
  );
}
