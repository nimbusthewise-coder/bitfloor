"use client";

import { useState, useRef, useEffect } from "react";
import {
  loadSpriteSheet,
  loadFaceSheet,
  bakeIdentitySprites,
  SpriteSheet,
  FaceSheet,
  BakedSprite,
  Identity,
} from "@/lib/sprites";
import {
  PhysicsState,
  GravityDirection,
  ScreenInput,
  updatePhysics,
  getGravityRotation,
  getMoveRightVector,
  PHYSICS,
} from "@/lib/physics";

// Character identities
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
  // Triangle slopes (45°) - named by which corner is solid
  slopeBR: "#00aaaa",  // ◢ solid bottom-right (ramp going up-left)
  slopeBL: "#00aaaa",  // ◣ solid bottom-left (ramp going up-right)
  slopeUR: "#00aaaa",  // ◥ solid upper-right (ceiling ramp)
  slopeUL: "#00aaaa",  // ◤ solid upper-left (ceiling ramp)
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
  { name: "Engine", x: 1, y: 1, w: 4, h: ROOM_H, type: "room" },
  { name: "Hall-U1", x: 5, y: 1, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Shaft-1", x: 7, y: 1, w: 2, h: ROOM_H * 2, type: "shaft" },
  { name: "Bridge", x: 9, y: 1, w: 6, h: ROOM_H, type: "room" },
  { name: "Hall-U2", x: 15, y: 1, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Shaft-2", x: 17, y: 1, w: 2, h: ROOM_H * 2, type: "shaft" },
  { name: "Quarters", x: 19, y: 1, w: 5, h: ROOM_H, type: "room" },
  { name: "Medical", x: 24, y: 1, w: 5, h: ROOM_H, type: "room" },
  
  // === LOWER DECK (rows 6-10, 5 tiles: 4 space + 1 floor) ===
  { name: "Cargo", x: 1, y: 1 + ROOM_H, w: 4, h: ROOM_H, type: "room" },
  { name: "Hall-L1", x: 5, y: 1 + ROOM_H, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Mess Hall", x: 9, y: 1 + ROOM_H, w: 6, h: ROOM_H, type: "room" },
  { name: "Hall-L2", x: 15, y: 1 + ROOM_H, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Rec Room", x: 19, y: 1 + ROOM_H, w: 5, h: ROOM_H, type: "room" },
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
  
  // === TEST AREA: Triangle slopes in Hall-L2 / Rec Room area ===
  // Single-tile slopes with wide platform (JP's tested layout)
  // Platform at row 9, slopes connect to floor at row 10
  
  // Left slope up (◢ slopeBR = walk up going right)
  grid[9][15] = "slopeBR";
  
  // Wide platform at row 9
  for (let x = 16; x <= 23; x++) {
    grid[9][x] = "floor";
  }
  
  // Right slope down (◣ slopeBL = walk down going right)
  grid[9][24] = "slopeBL";
  
  return grid;
}

// Initial grid generated once (now managed by state in component)

// Solid tile types for collision
const SOLID_TILES = ["hull", "hullLight", "floor", "console", "desk", "slopeBR", "slopeBL", "slopeUR", "slopeUL"];

// Editable tile types for the brush
const EDIT_TILES = ["interior", "floor", "slopeBR", "slopeBL", "slopeUR", "slopeUL", "hull"];

export default function ShipPage() {
  const [showGrid, setShowGrid] = useState(true);
  const [viewX, setViewX] = useState(0);
  const [viewY, setViewY] = useState(0);
  const [zoom, setZoom] = useState(1); // 1 = normal, <1 = zoomed out, >1 = zoomed in
  const [cameraEnabled, setCameraEnabled] = useState(true); // Toggle camera follow
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Tile editor state
  const [editMode, setEditMode] = useState(false);
  const [editBrush, setEditBrush] = useState("floor");
  const [grid, setGrid] = useState(() => generateShipGrid());
  const gridRef = useRef(grid);
  
  // Keep gridRef in sync with grid state (so physics loop sees updates)
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  
  // Nimbus physics state
  const [charPhysics, setCharPhysics] = useState<PhysicsState>({
    x: 19 * TILE,  // Start near Rec Room slopes for testing
    y: 9 * TILE,   // On lower deck floor
    vx: 0,
    vy: 0,
    gravity: "DOWN",
    grounded: false,
    width: 32,  // Collision box smaller than sprite
    height: 44,
    jumpHeld: false,  // For jump edge detection
    onSlope: false,   // Track if on slope (stair dilemma fix)
  });
  const [charDir, setCharDir] = useState<"left" | "right">("right");
  const [charAnim, setCharAnim] = useState<"Idle" | "Run" | "Jump">("Idle");
  const [charFrame, setCharFrame] = useState(0);
  const [displayRotation, setDisplayRotation] = useState(0); // Animated rotation (degrees)
  
  // Codex state (AI wandering)
  const [codexX, setCodexX] = useState(20 * TILE); // Start in quarters
  const [codexY, setCodexY] = useState(4 * TILE);
  const [codexDir, setCodexDir] = useState<"left" | "right">("left");
  const [codexAnim, setCodexAnim] = useState<"Idle" | "Run">("Run");
  const [codexFrame, setCodexFrame] = useState(0);
  
  // Sprite loading
  const [nimbusBaked, setNimbusBaked] = useState<BakedSprite | null>(null);
  const [codexBaked, setCodexBaked] = useState<BakedSprite | null>(null);
  const [sheet, setSheet] = useState<SpriteSheet | null>(null);
  const charCanvasRef = useRef<HTMLCanvasElement>(null);
  const codexCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Load sprites on mount
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
      setNimbusBaked(bakeIdentitySprites(spriteSheet, nimbus, faceSheet));
      setCodexBaked(bakeIdentitySprites(spriteSheet, codex, faceSheet));
    }
    load();
  }, []);

  // Scroll handling
  const handleScroll = (dx: number, dy: number) => {
    setViewX(x => Math.max(0, Math.min(SHIP_W - VIEW_W, x + dx)));
    setViewY(y => Math.max(0, Math.min(SHIP_H - VIEW_H, y + dy)));
  };
  
  // Keyboard input
  const keysRef = useRef(new Set<string>());
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      
      // Arrows = viewport scroll
      if (e.key === "ArrowLeft") handleScroll(-1, 0);
      if (e.key === "ArrowRight") handleScroll(1, 0);
      if (e.key === "ArrowUp") handleScroll(0, -1);
      if (e.key === "ArrowDown") handleScroll(0, 1);
      
      // Prevent space from scrolling page
      if (e.key === " ") e.preventDefault();
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
  
  // Physics loop
  useEffect(() => {
    const physicsLoop = setInterval(() => {
      const keys = keysRef.current;
      
      // Screen-relative input: WASD = screen directions, Space = jump
      const input: ScreenInput = {
        up: keys.has("w"),
        down: keys.has("s"),
        left: keys.has("a"),
        right: keys.has("d"),
        jump: keys.has(" "),
      };
      
      setCharPhysics(state => {
        const newState = updatePhysics(state, input, gridRef.current, SOLID_TILES);
        
        // Update facing direction based on GRAVITY-RELATIVE lateral velocity
        // "right" means moving in the positive lateral direction relative to current gravity
        const moveRightVec = getMoveRightVector(newState.gravity);
        const lateralVel = newState.vx * moveRightVec.x + newState.vy * moveRightVec.y;
        
        if (lateralVel > 0.3) setCharDir("right");
        else if (lateralVel < -0.3) setCharDir("left");
        
        // Update animation based on total movement
        const isMoving = Math.abs(newState.vx) > 0.3 || Math.abs(newState.vy) > 0.3;
        if (!newState.grounded) {
          setCharAnim("Jump");
        } else if (isMoving) {
          setCharAnim("Run");
        } else {
          setCharAnim("Idle");
        }
        
        return newState;
      });
    }, 16);
    
    // Smart camera system - runs alongside physics
    const cameraLoop = setInterval(() => {
      if (!cameraEnabled) return;
      
      setCharPhysics(charState => {
        // Get all character positions
        const characters = [
          { x: charState.x, y: charState.y },
        ];
        
        // Add Codex position (need to access via closure - we'll update this below)
        setCodexX(cx => {
          setCodexY(cy => {
            characters.push({ x: cx, y: cy });
            
            // Calculate bounding box of all characters
            const minX = Math.min(...characters.map(c => c.x));
            const maxX = Math.max(...characters.map(c => c.x));
            const minY = Math.min(...characters.map(c => c.y));
            const maxY = Math.max(...characters.map(c => c.y));
            
            // Center point
            const centerX = (minX + maxX) / 2 / TILE;
            const centerY = (minY + maxY) / 2 / TILE;
            
            // Calculate required zoom to fit all characters
            const spreadX = (maxX - minX) / TILE + 4; // Add padding
            const spreadY = (maxY - minY) / TILE + 4;
            const requiredZoomX = VIEW_W / Math.max(spreadX, VIEW_W);
            const requiredZoomY = VIEW_H / Math.max(spreadY, VIEW_H);
            const targetZoom = Math.min(requiredZoomX, requiredZoomY, 1.5); // Cap max zoom
            const clampedZoom = Math.max(0.5, Math.min(1.5, targetZoom)); // Limit zoom range
            
            // Calculate view position to center on characters
            const effectiveViewW = VIEW_W / clampedZoom;
            const effectiveViewH = VIEW_H / clampedZoom;
            const targetViewX = Math.max(0, Math.min(SHIP_W - effectiveViewW, centerX - effectiveViewW / 2));
            const targetViewY = Math.max(0, Math.min(SHIP_H - effectiveViewH, centerY - effectiveViewH / 2));
            
            // Smooth lerp for camera
            setViewX(vx => vx + (targetViewX - vx) * 0.08);
            setViewY(vy => vy + (targetViewY - vy) * 0.08);
            setZoom(z => z + (clampedZoom - z) * 0.05);
            
            return cy; // Don't modify
          });
          return cx; // Don't modify
        });
        
        return charState; // Don't modify
      });
    }, 32); // Camera updates at 30fps
    
    return () => {
      clearInterval(physicsLoop);
      clearInterval(cameraLoop);
    };
  }, [cameraEnabled]);
  
  // Smooth rotation animation when gravity changes
  useEffect(() => {
    const targetRotation = getGravityRotation(charPhysics.gravity);
    
    const animateRotation = () => {
      setDisplayRotation(current => {
        // Normalize both angles to 0-360
        const normalizedCurrent = ((current % 360) + 360) % 360;
        const normalizedTarget = ((targetRotation % 360) + 360) % 360;
        
        // Calculate shortest path
        let diff = normalizedTarget - normalizedCurrent;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        // If close enough, snap to target
        if (Math.abs(diff) < 2) {
          return normalizedTarget;
        }
        
        // Animate: ~300ms total at 60fps = 18 frames, so move ~5-20 degrees per frame
        // Use easing: faster when far, slower when close
        const speed = Math.max(11, Math.abs(diff) * 0.3);
        const step = Math.sign(diff) * Math.min(speed, Math.abs(diff));
        
        return normalizedCurrent + step;
      });
    };
    
    const rotationInterval = setInterval(animateRotation, 16);
    return () => clearInterval(rotationInterval);
  }, [charPhysics.gravity]);
  
  // Animation frame update - Nimbus
  useEffect(() => {
    if (!sheet) return;
    const tag = sheet.tags.find(t => t.name === charAnim);
    if (!tag) return;
    
    const interval = setInterval(() => {
      setCharFrame(f => {
        const next = f + 1;
        return next > tag.to ? tag.from : (f < tag.from ? tag.from : next);
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [charAnim, sheet]);
  
  // Animation frame update - Codex
  useEffect(() => {
    if (!sheet) return;
    const tag = sheet.tags.find(t => t.name === codexAnim);
    if (!tag) return;
    
    const interval = setInterval(() => {
      setCodexFrame(f => {
        const next = f + 1;
        return next > tag.to ? tag.from : (f < tag.from ? tag.from : next);
      });
    }, 150); // Walking pace animation
    
    return () => clearInterval(interval);
  }, [codexAnim, sheet]);
  
  // Codex AI - wander between waypoints
  const codexTargetRef = useRef({ x: 5 * TILE, y: 4 * TILE });
  
  useEffect(() => {
    const waypoints = [
      { x: 20 * TILE, y: 4 * TILE },  // Quarters
      { x: 10 * TILE, y: 4 * TILE },  // Bridge
      { x: 3 * TILE, y: 4 * TILE },   // Engine
      { x: 10 * TILE, y: 9 * TILE },  // Mess Hall
      { x: 20 * TILE, y: 9 * TILE },  // Rec Room
    ];
    
    const moveInterval = setInterval(() => {
      const target = codexTargetRef.current;
      
      setCodexX(x => {
        const dx = target.x - x;
        if (Math.abs(dx) < 4) {
          // Pick new target when close
          const newTarget = waypoints[Math.floor(Math.random() * waypoints.length)];
          codexTargetRef.current = newTarget;
          setCodexAnim("Idle");
          return x;
        }
        setCodexDir(dx > 0 ? "right" : "left");
        setCodexAnim("Run");
        return x + (dx > 0 ? 2 : -2);
      });
      
      setCodexY(y => {
        const dy = target.y - y;
        if (Math.abs(dy) < 4) return y;
        return y + (dy > 0 ? 2 : -2);
      });
    }, 32); // Slower update rate
    
    return () => clearInterval(moveInterval);
  }, []); // No dependencies - runs once
  
  // Draw Nimbus
  useEffect(() => {
    if (!nimbusBaked || !charCanvasRef.current) return;
    const ctx = charCanvasRef.current.getContext("2d");
    if (!ctx) return;
    
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 48, 48);
    
    ctx.save();
    ctx.translate(24, 24);  // Canvas center
    
    // Smooth animated rotation around collision center
    ctx.rotate(displayRotation * Math.PI / 180);
    
    // Flip for direction
    if (charDir === "left") {
      ctx.scale(-1, 1);
    }
    
    // Draw sprite centered at the rotation point
    ctx.drawImage(
      nimbusBaked.canvas,
      charFrame * 48, 0, 48, 48,
      -24, -24, 48, 48
    );
    ctx.restore();
  }, [nimbusBaked, charFrame, charDir, displayRotation]);
  
  // Draw Codex
  useEffect(() => {
    if (!codexBaked || !codexCanvasRef.current) return;
    const ctx = codexCanvasRef.current.getContext("2d");
    if (!ctx) return;
    
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 48, 48);
    
    ctx.save();
    if (codexDir === "left") {
      ctx.translate(48, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(
      codexBaked.canvas,
      codexFrame * 48, 0, 48, 48,
      0, 0, 48, 48
    );
    ctx.restore();
  }, [codexBaked, codexFrame, codexDir]);

  // Calculate character positions relative to viewport
  // Sprite is 48×48, collision is 32×44
  // We need to align sprite "feet" with collision "floor edge" for each gravity
  // The offset changes based on gravity orientation since collision box doesn't rotate
  
  // Offset from collision top-left to where 48×48 sprite should be drawn
  // to align the visual feet with collision floor-side
  const getSpriteOffset = (gravity: GravityDirection): { x: number; y: number } => {
    const spriteW = 48, spriteH = 48;
    const collW = 32, collH = 44;
    const extraW = (spriteW - collW) / 2;  // 8px
    const extraH = (spriteW - collH) / 2;  // 2px (using spriteW for both since rotated sprite is square)
    
    switch (gravity) {
      case "DOWN":  // Feet at bottom - align sprite bottom with collision bottom
        return { x: -extraW, y: -(spriteH - collH) };  // (-8, -4)
      case "UP":    // Feet at top - align sprite top with collision top
        return { x: -extraW, y: 0 };  // (-8, 0)
      case "LEFT":  // Feet at left - align sprite left with collision left
        return { x: 0, y: -extraW };  // (0, -8)
      case "RIGHT": // Feet at right - align sprite right with collision right
        return { x: -(spriteW - collW), y: -extraW };  // (-16, -8)
    }
  };
  
  const spriteOffset = getSpriteOffset(charPhysics.gravity);
  const charScreenX = charPhysics.x - viewX * TILE + spriteOffset.x;
  const charScreenY = charPhysics.y - viewY * TILE + spriteOffset.y;
  const charVisible = charScreenX > -48 && charScreenX < VIEW_W * TILE &&
                      charScreenY > -48 && charScreenY < VIEW_H * TILE;
  
  const codexScreenX = codexX - viewX * TILE;
  const codexScreenY = codexY - viewY * TILE;
  const codexVisible = codexScreenX > -48 && codexScreenX < VIEW_W * TILE &&
                       codexScreenY > -48 && codexScreenY < VIEW_H * TILE;

  // Get visible portion of grid (account for zoom - show more tiles when zoomed out)
  const effectiveViewW = Math.ceil(VIEW_W / zoom) + 1;
  const effectiveViewH = Math.ceil(VIEW_H / zoom) + 1;
  const viewXInt = Math.floor(viewX);
  const viewYInt = Math.floor(viewY);
  
  const visibleGrid = grid
    .slice(viewYInt, viewYInt + effectiveViewH)
    .map(row => row.slice(viewXInt, viewXInt + effectiveViewW));

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
        <button
          onClick={() => setCameraEnabled(c => !c)}
          style={{
            padding: "4px 8px",
            background: cameraEnabled ? "#0ff" : "#333",
            color: cameraEnabled ? "#000" : "#fff",
            border: "1px solid #0ff",
            cursor: "pointer",
          }}
        >
          CAM {cameraEnabled ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => setEditMode(e => !e)}
          style={{
            padding: "4px 8px",
            background: editMode ? "#f0f" : "#333",
            color: editMode ? "#000" : "#fff",
            border: "1px solid #f0f",
            cursor: "pointer",
          }}
        >
          EDIT {editMode ? "ON" : "OFF"}
        </button>
        {editMode && (
          <select
            value={editBrush}
            onChange={(e) => setEditBrush(e.target.value)}
            style={{
              padding: "4px",
              background: "#222",
              color: "#fff",
              border: `2px solid ${COLORS[editBrush as keyof typeof COLORS] || "#fff"}`,
            }}
          >
            {EDIT_TILES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <span style={{ color: "#666", alignSelf: "center" }}>
          {editMode ? "Click tiles to paint" : "WASD move | Space = jump | Arrows = scroll"}
        </span>
        <span style={{ color: "#0ff", alignSelf: "center" }}>
          Zoom: {zoom.toFixed(2)}x
        </span>
        <span style={{ 
          color: charPhysics.grounded ? "#4ade80" : "#ff6b6b", 
          alignSelf: "center",
          marginLeft: 10,
        }}>
          Gravity: {charPhysics.gravity} | {charPhysics.grounded ? "🦶 Grounded" : "🪂 Airborne"}{charPhysics.onSlope ? " | 📐 Slope" : ""}
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
        {/* Zoomed content wrapper */}
        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
          width: `${100 / zoom}%`,
          height: `${100 / zoom}%`,
        }}>
        {/* Tile grid with sub-pixel offset for smooth scrolling */}
        <div style={{
          position: "absolute",
          transform: `translate(${-(viewX % 1) * TILE}px, ${-(viewY % 1) * TILE}px)`,
        }}>
        {/* Render visible cells */}
        {visibleGrid.map((row, vy) => (
          row.map((cell, vx) => {
            // Triangle clip paths for slope tiles (horizontally flipped)
            const clipPaths: Record<string, string> = {
              slopeBL: "polygon(0% 100%, 100% 100%, 0% 0%)",   // ◣ walk up going right
              slopeBR: "polygon(100% 100%, 0% 100%, 100% 0%)", // ◢ walk down going right
              slopeUL: "polygon(0% 0%, 100% 0%, 0% 100%)",     // ◤ ceiling slope
              slopeUR: "polygon(100% 0%, 0% 0%, 100% 100%)",   // ◥ ceiling slope
            };
            const clipPath = clipPaths[cell] || undefined;
            
            // Calculate actual grid position
            const gridX = viewXInt + vx;
            const gridY = viewYInt + vy;
            
            return (
            <div
              key={`${vx}-${vy}`}
              onClick={() => {
                if (!editMode) return;
                // Paint tile with current brush
                setGrid(prev => {
                  const newGrid = prev.map(r => [...r]);
                  if (gridY >= 0 && gridY < newGrid.length && gridX >= 0 && gridX < newGrid[0].length) {
                    newGrid[gridY][gridX] = editBrush as keyof typeof COLORS;
                  }
                  return newGrid;
                });
              }}
              style={{
                position: "absolute",
                left: vx * TILE,
                top: vy * TILE,
                width: TILE,
                height: TILE,
                background: COLORS[cell],
                boxSizing: "border-box",
                border: showGrid ? "1px solid rgba(255,255,255,0.1)" : "none",
                clipPath,
                cursor: editMode ? "crosshair" : "default",
              }}
            />
          );
          })
        ))}
        </div>
        {/* End tile grid container */}

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
        
        {/* Nimbus (player) */}
        {charVisible && (
          <canvas
            ref={charCanvasRef}
            width={48}
            height={48}
            style={{
              position: "absolute",
              left: charScreenX,
              top: charScreenY,
              imageRendering: "pixelated",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        )}
        
        {/* Codex (AI wandering) */}
        {codexVisible && (
          <canvas
            ref={codexCanvasRef}
            width={48}
            height={48}
            style={{
              position: "absolute",
              left: codexScreenX,
              top: codexScreenY,
              imageRendering: "pixelated",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        )}
        </div>{/* End zoomed content wrapper */}
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
          {grid.map((row, y) => (
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
          {/* Nimbus marker on minimap */}
          <div style={{
            position: "absolute",
            left: (charPhysics.x / TILE) * 4,
            top: (charPhysics.y / TILE) * 4,
            width: 6,
            height: 6,
            background: "#4ade80",
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
          }} />
          {/* Codex marker on minimap */}
          <div style={{
            position: "absolute",
            left: (codexX / TILE) * 4,
            top: (codexY / TILE) * 4,
            width: 6,
            height: 6,
            background: "#fb923c",
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
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
