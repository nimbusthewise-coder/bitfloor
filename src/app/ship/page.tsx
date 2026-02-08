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
import {
  findPath,
  PathStep,
  GravityDir,
  canStand,
} from "@/lib/pathfinding";

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
  
  return grid;
}

const shipGrid = generateShipGrid();

// Solid tile types for collision
const SOLID_TILES = ["hull", "hullLight", "floor", "console", "desk"];

export default function ShipPage() {
  const [showGrid, setShowGrid] = useState(false);  // Default off for cleaner look
  const [viewX, setViewX] = useState(0);  // Now float for smooth scrolling
  const [viewY, setViewY] = useState(0);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Spring camera velocity (for smooth ease in-out)
  const cameraVelRef = useRef({ x: 0, y: 0 });
  
  // Nimbus physics state
  // Floor at y=5 means collision box bottom should be at y=5*TILE=160
  // Collision box is 44 tall, so top = 160 - 44 = 116 = ~3.625 tiles
  const [charPhysics, setCharPhysics] = useState<PhysicsState>({
    x: 10 * TILE,  // Start in Bridge
    y: 5 * TILE - 44,   // Position so feet touch floor at y=5
    vx: 0,
    vy: 0,
    gravity: "DOWN",
    grounded: true,  // Start grounded
    width: 32,  // Collision box smaller than sprite
    height: 44,
    jumpHeld: false,  // For jump edge detection
  });
  const [charDir, setCharDir] = useState<"left" | "right">("right");
  const [charAnim, setCharAnim] = useState<"Idle" | "Run" | "Jump">("Idle");
  const [charFrame, setCharFrame] = useState(0);
  const [displayRotation, setDisplayRotation] = useState(0); // Animated rotation (degrees)
  
  // Codex physics state (AI-controlled, same physics as Nimbus)
  // Floor at y=5 means collision box bottom should be at y=5*TILE=160
  // Collision box is 44 tall, so top = 160 - 44 = 116 = ~3.625 tiles
  const [codexPhysics, setCodexPhysics] = useState<PhysicsState>({
    x: 13 * TILE,  // Start in Bridge, to the right of Nimbus (x=10)
    y: 5 * TILE - 44,   // Position so feet touch floor at y=5
    vx: 0,
    vy: 0,
    gravity: "DOWN",
    grounded: true,  // Start grounded to prevent fall-through
    width: 32,
    height: 44,
    jumpHeld: false,
  });
  const [codexDir, setCodexDir] = useState<"left" | "right">("left");
  const [codexAnim, setCodexAnim] = useState<"Idle" | "Run" | "Jump">("Idle");
  const [codexFrame, setCodexFrame] = useState(0);
  const [codexDisplayRotation, setCodexDisplayRotation] = useState(0); // Animated rotation (degrees)
  
  // AI input state (what the AI "wants" to do this frame)
  const codexInputRef = useRef<ScreenInput>({ up: false, down: false, left: false, right: false, jump: false });
  
  // Refs for AI to access latest physics state (avoids stale closure issue)
  const codexPhysicsRef = useRef(codexPhysics);
  const charPhysicsRef = useRef(charPhysics);
  codexPhysicsRef.current = codexPhysics;
  charPhysicsRef.current = charPhysics;
  
  // Path visualization
  const [codexPath, setCodexPath] = useState<PathStep[]>([]);
  const [showPaths, setShowPaths] = useState(true);
  
  // Debug: tile position visualization
  const [debugTiles, setDebugTiles] = useState<{
    nimbus: { x: number; y: number; centerX: number; centerY: number; floorX: number; floorY: number } | null;
    codex: { x: number; y: number; centerX: number; centerY: number; floorX: number; floorY: number } | null;
  }>({ nimbus: null, codex: null });
  
  // Debug command panel
  const [commandResults, setCommandResults] = useState<{
    name: string;
    expected: string;
    actual: string;
    passed: boolean | null;
  }[]>([]);
  
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
  
  // Combined physics + camera loop (must be in sync to avoid jitter)
  useEffect(() => {
    const gameLoop = setInterval(() => {
      const keys = keysRef.current;
      
      // Screen-relative input: WASD = screen directions, Space = jump
      const input: ScreenInput = {
        up: keys.has("w"),
        down: keys.has("s"),
        left: keys.has("a"),
        right: keys.has("d"),
        jump: keys.has(" "),
      };
      
      // Update Nimbus physics
      setCharPhysics(state => {
        const newState = updatePhysics(state, input, shipGrid, SOLID_TILES);
        
        // Update facing direction based on GRAVITY-RELATIVE lateral velocity
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
        
        // Spring camera follow (ease in-out with natural lag)
        if (cameraEnabled) {
          const targetViewX = Math.max(0, Math.min(
            SHIP_W - VIEW_W, 
            newState.x / TILE - VIEW_W / 2
          ));
          const targetViewY = Math.max(0, Math.min(
            SHIP_H - VIEW_H, 
            newState.y / TILE - VIEW_H / 2
          ));
          
          // Spring physics: acceleration toward target, with damping
          const stiffness = 0.004;  // How strongly camera pulls toward target
          const damping = 0.82;    // Velocity decay (lower = more lag/overshoot)
          
          setViewX(vx => {
            const vel = cameraVelRef.current;
            vel.x += (targetViewX - vx) * stiffness;
            vel.x *= damping;
            return vx + vel.x;
          });
          setViewY(vy => {
            const vel = cameraVelRef.current;
            vel.y += (targetViewY - vy) * stiffness;
            vel.y *= damping;
            return vy + vel.y;
          });
        }
        
        return newState;
      });
      
      // Update Codex physics (AI-driven)
      setCodexPhysics(state => {
        const codexInput = codexInputRef.current;
        const newState = updatePhysics(state, codexInput, shipGrid, SOLID_TILES);
        
        // Update Codex facing direction
        const moveRightVec = getMoveRightVector(newState.gravity);
        const lateralVel = newState.vx * moveRightVec.x + newState.vy * moveRightVec.y;
        
        if (lateralVel > 0.3) setCodexDir("right");
        else if (lateralVel < -0.3) setCodexDir("left");
        
        // Update Codex animation
        const isMoving = Math.abs(newState.vx) > 0.3 || Math.abs(newState.vy) > 0.3;
        if (!newState.grounded) {
          setCodexAnim("Jump");
        } else if (isMoving) {
          setCodexAnim("Run");
        } else {
          setCodexAnim("Idle");
        }
        
        return newState;
      });
    }, 16); // Single 60fps loop
    
    return () => clearInterval(gameLoop);
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
  
  // Smooth rotation animation for Codex when gravity changes
  useEffect(() => {
    const targetRotation = getGravityRotation(codexPhysics.gravity);
    
    const animateRotation = () => {
      setCodexDisplayRotation(current => {
        const normalizedCurrent = ((current % 360) + 360) % 360;
        const normalizedTarget = ((targetRotation % 360) + 360) % 360;
        
        let diff = normalizedTarget - normalizedCurrent;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        if (Math.abs(diff) < 2) return normalizedTarget;
        
        const speed = Math.max(11, Math.abs(diff) * 0.3);
        const step = Math.sign(diff) * Math.min(speed, Math.abs(diff));
        
        return normalizedCurrent + step;
      });
    };
    
    const rotationInterval = setInterval(animateRotation, 16);
    return () => clearInterval(rotationInterval);
  }, [codexPhysics.gravity]);
  
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
  
  // Codex AI - chase player using pathfinding
  const codexPathIndexRef = useRef(0);
  const lastPathTimeRef = useRef(0);
  const codexLastPosRef = useRef({ x: 0, y: 0 });
  const codexStuckCountRef = useRef(0);
  
  useEffect(() => {
    const aiInterval = setInterval(() => {
      // Read latest physics from refs (avoids stale closure)
      const codexPhysics = codexPhysicsRef.current;
      const charPhysics = charPhysicsRef.current;
      
      // Safety: if Codex goes off the map, reset to near player
      const BOUNDS_MARGIN = TILE * 2;
      const outOfBounds = 
        codexPhysics.x < -BOUNDS_MARGIN || 
        codexPhysics.x > SHIP_W * TILE + BOUNDS_MARGIN ||
        codexPhysics.y < -BOUNDS_MARGIN || 
        codexPhysics.y > SHIP_H * TILE + BOUNDS_MARGIN;
      
      if (outOfBounds) {
        console.log("[AI] Codex out of bounds! Resetting...");
        // Reset Codex to spawn position
        setCodexPhysics({
          x: 13 * TILE,
          y: 5 * TILE - 44,
          vx: 0,
          vy: 0,
          gravity: "DOWN",
          grounded: true,
          width: 32,
          height: 44,
          jumpHeld: false,
        });
        setCodexPath([]);
        codexPathIndexRef.current = 0;
        return; // Skip this frame
      }
      
      // Recalculate path every 500ms
      const now = Date.now();
      if (now - lastPathTimeRef.current > 500) {
        lastPathTimeRef.current = now;
        
        // Get standing tile position - MUST account for current gravity!
        // "Feet" position depends on which surface we're attached to
        // Standing tile = the empty tile the character occupies, adjacent to the solid surface
        const getStandingTile = (physics: PhysicsState) => {
          const centerX = physics.x + physics.width / 2;
          const centerY = physics.y + physics.height / 2;
          
          switch (physics.gravity) {
            case "DOWN":  // Feet at bottom, standing on floor below
              return {
                x: Math.floor(centerX / TILE),
                y: Math.floor((physics.y + physics.height - 1) / TILE)  // Tile containing feet
              };
            case "UP":    // Feet at top, standing on ceiling above
              return {
                x: Math.floor(centerX / TILE),
                y: Math.floor(physics.y / TILE)  // Tile containing top of collision box
              };
            case "LEFT":  // Feet at left, standing on wall to left
              return {
                x: Math.floor(physics.x / TILE),  // Tile containing left edge
                y: Math.floor(centerY / TILE)
              };
            case "RIGHT": // Feet at right, standing on wall to right
              return {
                x: Math.floor((physics.x + physics.width - 1) / TILE),  // Tile containing right edge
                y: Math.floor(centerY / TILE)
              };
          }
        };
        
        const codexTile = getStandingTile(codexPhysics);
        const playerTile = getStandingTile(charPhysics);
        
        // Update debug visualization
        // Floor offset depends on gravity direction
        const getFloorOffset = (gravity: string) => {
          switch (gravity) {
            case "DOWN": return { dx: 0, dy: 1 };
            case "UP": return { dx: 0, dy: -1 };
            case "LEFT": return { dx: -1, dy: 0 };
            case "RIGHT": return { dx: 1, dy: 0 };
            default: return { dx: 0, dy: 1 };
          }
        };
        const nimbusFloor = getFloorOffset(charPhysics.gravity);
        const codexFloor = getFloorOffset(codexPhysics.gravity);
        
        setDebugTiles({
          nimbus: {
            ...playerTile,
            centerX: charPhysics.x + charPhysics.width / 2,
            centerY: charPhysics.y + charPhysics.height / 2,
            floorX: playerTile.x + nimbusFloor.dx,
            floorY: playerTile.y + nimbusFloor.dy
          },
          codex: {
            ...codexTile,
            centerX: codexPhysics.x + codexPhysics.width / 2,
            centerY: codexPhysics.y + codexPhysics.height / 2,
            floorX: codexTile.x + codexFloor.dx,
            floorY: codexTile.y + codexFloor.dy
          }
        });
        
        // Only pathfind if both characters are grounded (valid standing positions)
        if (codexPhysics.grounded && charPhysics.grounded) {
          console.log("[Pathfinding] Codex:", { ...codexTile, gravity: codexPhysics.gravity },
            "pixel:", Math.round(codexPhysics.x), Math.round(codexPhysics.y));
          console.log("[Pathfinding] Player:", { ...playerTile, gravity: charPhysics.gravity });
          
          const path = findPath(
            shipGrid,
            SOLID_TILES as string[],
            { x: codexTile.x, y: codexTile.y, gravity: codexPhysics.gravity as GravityDir },
            { x: playerTile.x, y: playerTile.y }
          );
          
          console.log("[Pathfinding] Result:", path ? `${path.length} steps` : "null");
          
          if (path && path.length > 0) {
            setCodexPath(path);
            codexPathIndexRef.current = 1; // Start at step 1 (skip start position)
          } else {
            // Clear stale path if pathfinding fails - use direct pursuit instead
            setCodexPath([]);
            codexPathIndexRef.current = 0;
          }
        }
      }
      
      // AI decision: look at current path step and decide input
      const input: ScreenInput = { up: false, down: false, left: false, right: false, jump: false };
      
      // Calculate direct distance to player (used for fallback and stopping)
      const codexCenterX = codexPhysics.x + codexPhysics.width / 2;
      const codexCenterY = codexPhysics.y + codexPhysics.height / 2;
      const playerCenterX = charPhysics.x + charPhysics.width / 2;
      const playerCenterY = charPhysics.y + charPhysics.height / 2;
      const directDx = playerCenterX - codexCenterX;
      const directDy = playerCenterY - codexCenterY;
      const directDist = Math.sqrt(directDx * directDx + directDy * directDy);
      
      // Stop if very close to player (within ~1.5 tiles)
      const STOP_DISTANCE = TILE * 1.5;
      
      // When close to player, mark path as complete so we don't follow stale waypoints later
      if (directDist <= STOP_DISTANCE && codexPath.length > 0) {
        codexPathIndexRef.current = codexPath.length;  // Mark path as complete
      }
      
      if (directDist > STOP_DISTANCE) {
        // Use path if available and not completed
        let targetX: number, targetY: number;
        let shouldJump = false;
        let needsGravityTransition = false;
        
        if (codexPath.length > 0 && codexPathIndexRef.current < codexPath.length) {
          const targetStep = codexPath[codexPathIndexRef.current];
          targetX = targetStep.node.x * TILE + TILE / 2;
          targetY = targetStep.node.y * TILE + TILE / 2;
          shouldJump = targetStep.action === "jump" || targetStep.action === "fall";
          
          const dx = targetX - codexCenterX;
          const dy = targetY - codexCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // Check if next waypoint requires gravity change - but only jump if CLOSE to transition point!
          // Otherwise we'd jump in place forever instead of walking toward the transition
          if (targetStep.node.gravity !== codexPhysics.gravity && dist < TILE * 2) {
            needsGravityTransition = true;
          }
          
          // Check if we've reached this waypoint
          if (dist < TILE / 2) {
            codexPathIndexRef.current++;
          }
        } else {
          // Fallback: move directly toward player
          targetX = playerCenterX;
          targetY = playerCenterY;
        }
        
        const dx = targetX - codexCenterX;
        const dy = targetY - codexCenterY;
        
        // Use SCREEN-RELATIVE input! The physics engine handles gravity conversion.
        // If target is to the right on screen, press right. Physics does the rest.
        // No need to use getMoveRightVector here - that caused double-inversion!
        
        // For floor/ceiling (UP/DOWN gravity): move left/right on screen
        // For walls (LEFT/RIGHT gravity): move up/down on screen
        let perpendicularDist = 0;
        if (codexPhysics.gravity === "DOWN" || codexPhysics.gravity === "UP") {
          // On floor or ceiling: lateral movement is left/right
          if (dx > 4) input.right = true;
          else if (dx < -4) input.left = true;
          perpendicularDist = Math.abs(dy);  // Vertical is perpendicular
        } else {
          // On wall: lateral movement is up/down
          if (dy > 4) input.down = true;
          else if (dy < -4) input.up = true;
          perpendicularDist = Math.abs(dx);  // Horizontal is perpendicular
        }
        
        // If target is far perpendicular (more than 2 tiles), need to jump off surface
        const needsToLeaveSurface = perpendicularDist > TILE * 2;
        
        // Stuck detection: if trying to move but position hasn't changed
        const lastPos = codexLastPosRef.current;
        const posDelta = Math.abs(codexPhysics.x - lastPos.x) + Math.abs(codexPhysics.y - lastPos.y);
        const isTryingToMove = input.left || input.right || input.up || input.down;
        
        if (isTryingToMove && posDelta < 1 && codexPhysics.grounded) {
          codexStuckCountRef.current++;
        } else {
          codexStuckCountRef.current = 0;
        }
        
        // Update last position
        codexLastPosRef.current = { x: codexPhysics.x, y: codexPhysics.y };
        
        // Debug: log AI decision - more frequent for debugging
        if (Math.random() < 0.1) {
          const pathStep = codexPath[codexPathIndexRef.current];
          const inputStr = [
            input.left ? "L" : "", input.right ? "R" : "",
            input.up ? "U" : "", input.down ? "D" : "",
            input.jump ? "J" : ""
          ].filter(Boolean).join("") || "-";
          console.log("[AI]", codexPhysics.gravity,
            "pos:", Math.round(codexCenterX), Math.round(codexCenterY),
            "target:", Math.round(targetX), Math.round(targetY),
            "dx:", dx.toFixed(0), "dy:", dy.toFixed(0),
            "→ input:", inputStr,
            pathStep ? `(path step ${codexPathIndexRef.current})` : "(direct)");
        }
        
        // Jump if: path says jump, OR stuck, OR gravity transition, OR need to leave surface
        const isStuck = codexStuckCountRef.current > 10;
        const shouldTriggerJump = (shouldJump || isStuck || needsGravityTransition || needsToLeaveSurface) && codexPhysics.grounded;
        
        // Extra safety: don't jump if already near edge of map
        const nearEdge = codexPhysics.x < TILE * 2 || codexPhysics.x > (SHIP_W - 2) * TILE ||
                         codexPhysics.y < TILE * 2 || codexPhysics.y > (SHIP_H - 2) * TILE;
        
        if (shouldTriggerJump && !nearEdge) {
          input.jump = true;
          if (isStuck) {
            console.log("[AI] Stuck! Jumping to clear obstacle");
            codexStuckCountRef.current = 0;
          }
          if (needsGravityTransition) {
            console.log("[AI] Gravity transition needed:", codexPhysics.gravity, "→ jumping!");
          }
          if (needsToLeaveSurface) {
            console.log("[AI] Target far perpendicular - jumping off surface! dist:", perpendicularDist.toFixed(0));
          }
        }
      }
      
      // Apply AI input
      codexInputRef.current = input;
      
    }, 50); // AI runs at 20Hz
    
    return () => clearInterval(aiInterval);
  // NOTE: Empty deps - interval reads current state via closure refresh pattern
  // The setCodexPhysics/setCharPhysics in the game loop ensure fresh values
  }, []);
  
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
    ctx.translate(24, 24);  // Canvas center
    
    // Smooth animated rotation around collision center
    ctx.rotate(codexDisplayRotation * Math.PI / 180);
    
    // Flip for direction
    if (codexDir === "left") {
      ctx.scale(-1, 1);
    }
    
    // Draw sprite centered at the rotation point
    ctx.drawImage(
      codexBaked.canvas,
      codexFrame * 48, 0, 48, 48,
      -24, -24, 48, 48
    );
    ctx.restore();
  }, [codexBaked, codexFrame, codexDir, codexDisplayRotation]);

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
  // Snap character positions to integer pixels for crisp rendering
  const charScreenX = Math.round(charPhysics.x - viewX * TILE + spriteOffset.x);
  const charScreenY = Math.round(charPhysics.y - viewY * TILE + spriteOffset.y);
  const charVisible = charScreenX > -48 && charScreenX < VIEW_W * TILE &&
                      charScreenY > -48 && charScreenY < VIEW_H * TILE;
  
  const codexSpriteOffset = getSpriteOffset(codexPhysics.gravity);
  const codexScreenX = Math.round(codexPhysics.x - viewX * TILE + codexSpriteOffset.x);
  const codexScreenY = Math.round(codexPhysics.y - viewY * TILE + codexSpriteOffset.y);
  const codexVisible = codexScreenX > -48 && codexScreenX < VIEW_W * TILE &&
                       codexScreenY > -48 && codexScreenY < VIEW_H * TILE;

  // Get visible portion of grid (use integer coords for slicing, +1 for partial tiles)
  const viewXInt = Math.floor(viewX);
  const viewYInt = Math.floor(viewY);
  
  const visibleGrid = shipGrid
    .slice(viewYInt, viewYInt + VIEW_H + 1)
    .map(row => row.slice(viewXInt, viewXInt + VIEW_W + 1));

  // Get room labels that are visible
  const visibleRooms = rooms.filter(room => 
    room.x + room.w > viewXInt && room.x < viewXInt + VIEW_W + 1 &&
    room.y + room.h > viewYInt && room.y < viewYInt + VIEW_H + 1
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
          onClick={() => setShowPaths(p => !p)}
          style={{
            padding: "4px 8px",
            background: showPaths ? "#fb923c" : "#333",
            color: showPaths ? "#000" : "#fff",
            border: "1px solid #fb923c",
            cursor: "pointer",
          }}
        >
          PATH {showPaths ? "ON" : "OFF"}
        </button>
        <span style={{ color: "#666", alignSelf: "center" }}>
          WASD move | Space = jump
        </span>
        <span style={{ 
          color: charPhysics.grounded ? "#4ade80" : "#ff6b6b", 
          alignSelf: "center",
          marginLeft: "auto",
          whiteSpace: "nowrap",  // Prevent wrapping
        }}>
          {charPhysics.gravity} | {charPhysics.grounded ? "🦶" : "🪂"}
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
        {/* Tile container with pixel-snapped offset for smooth scrolling */}
        <div style={{
          position: "absolute",
          transform: `translate(${-Math.floor((viewX % 1) * TILE)}px, ${-Math.floor((viewY % 1) * TILE)}px)`,
        }}>
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
        </div>

        {/* Room labels (positioned with pixel-snapped offset) */}
        <div style={{
          position: "absolute",
          transform: `translate(${-Math.floor((viewX % 1) * TILE)}px, ${-Math.floor((viewY % 1) * TILE)}px)`,
        }}>
          {visibleRooms.map(room => {
            const labelX = (room.x - viewXInt + room.w / 2) * TILE;
            const labelY = (room.y - viewYInt + room.h / 2) * TILE;
            if (labelX < 0 || labelX > (VIEW_W + 1) * TILE) return null;
            if (labelY < 0 || labelY > (VIEW_H + 1) * TILE) return null;
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
        
        {/* Path visualization */}
        {showPaths && codexPath.length > 1 && (
          <svg
            style={{
              position: "absolute",
              left: -Math.floor(viewX) * TILE,
              top: -Math.floor(viewY) * TILE,
              width: SHIP_W * TILE,
              height: SHIP_H * TILE,
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            {/* Codex path (orange) */}
            <polyline
              points={codexPath.map(step => 
                `${step.node.x * TILE + TILE/2},${step.node.y * TILE + TILE/2}`
              ).join(" ")}
              fill="none"
              stroke="#fb923c"
              strokeWidth="3"
              strokeOpacity="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="8,4"
            />
            {/* Path nodes */}
            {codexPath.map((step, i) => (
              <circle
                key={i}
                cx={step.node.x * TILE + TILE/2}
                cy={step.node.y * TILE + TILE/2}
                r={i === 0 ? 6 : 4}
                fill={step.action === "jump" ? "#ff6b6b" : step.action === "fall" ? "#fbbf24" : "#fb923c"}
                opacity="0.8"
              />
            ))}
          </svg>
        )}
        
        {/* Debug: Tile position visualization */}
        {showPaths && (
          <svg
            style={{
              position: "absolute",
              left: -Math.floor(viewX) * TILE,
              top: -Math.floor(viewY) * TILE,
              width: SHIP_W * TILE,
              height: SHIP_H * TILE,
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            {/* Nimbus tile box (green) */}
            {debugTiles.nimbus && (
              <>
                {/* Standing tile (dashed) */}
                <rect
                  x={debugTiles.nimbus.x * TILE}
                  y={debugTiles.nimbus.y * TILE}
                  width={TILE}
                  height={TILE}
                  fill="rgba(74, 222, 128, 0.1)"
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeDasharray="4,2"
                />
                {/* Floor tile that must be solid (solid outline) */}
                <rect
                  x={debugTiles.nimbus.floorX * TILE + 4}
                  y={debugTiles.nimbus.floorY * TILE + 4}
                  width={TILE - 8}
                  height={TILE - 8}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="3"
                />
                {/* Triangle at center */}
                <polygon
                  points={`${debugTiles.nimbus.centerX},${debugTiles.nimbus.centerY - 6} ${debugTiles.nimbus.centerX - 5},${debugTiles.nimbus.centerY + 4} ${debugTiles.nimbus.centerX + 5},${debugTiles.nimbus.centerY + 4}`}
                  fill="#4ade80"
                />
                {/* Line from center to tile center */}
                <line
                  x1={debugTiles.nimbus.centerX}
                  y1={debugTiles.nimbus.centerY}
                  x2={debugTiles.nimbus.x * TILE + TILE/2}
                  y2={debugTiles.nimbus.y * TILE + TILE/2}
                  stroke="#4ade80"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              </>
            )}
            {/* Codex tile box (orange) */}
            {debugTiles.codex && (
              <>
                {/* Standing tile (dashed) */}
                <rect
                  x={debugTiles.codex.x * TILE}
                  y={debugTiles.codex.y * TILE}
                  width={TILE}
                  height={TILE}
                  fill="rgba(251, 146, 60, 0.1)"
                  stroke="#fb923c"
                  strokeWidth="2"
                  strokeDasharray="4,2"
                />
                {/* Floor tile that must be solid (solid outline) */}
                <rect
                  x={debugTiles.codex.floorX * TILE + 4}
                  y={debugTiles.codex.floorY * TILE + 4}
                  width={TILE - 8}
                  height={TILE - 8}
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth="3"
                />
                {/* Triangle at center */}
                <polygon
                  points={`${debugTiles.codex.centerX},${debugTiles.codex.centerY - 6} ${debugTiles.codex.centerX - 5},${debugTiles.codex.centerY + 4} ${debugTiles.codex.centerX + 5},${debugTiles.codex.centerY + 4}`}
                  fill="#fb923c"
                />
                {/* Line from center to tile center */}
                <line
                  x1={debugTiles.codex.centerX}
                  y1={debugTiles.codex.centerY}
                  x2={debugTiles.codex.x * TILE + TILE/2}
                  y2={debugTiles.codex.y * TILE + TILE/2}
                  stroke="#fb923c"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              </>
            )}
          </svg>
        )}
        
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
        
        {/* Codex (AI chasing) */}
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
            left: viewX * 4,  // Use float for smooth minimap indicator
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
            left: (codexPhysics.x / TILE) * 4,
            top: (codexPhysics.y / TILE) * 4,
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

      {/* Debug Command Panel */}
      <div style={{ 
        marginTop: 20, 
        padding: 10, 
        background: "#1a1a2e", 
        border: "1px solid #333",
        maxWidth: 400,
      }}>
        <div style={{ color: "#0ff", fontSize: 10, marginBottom: 10 }}>
          CODEX DEBUG COMMANDS
        </div>
        <div style={{ color: "#666", fontSize: 8, marginBottom: 10 }}>
          Codex: x={Math.round(codexPhysics.x)} y={Math.round(codexPhysics.y)} | 
          gravity={codexPhysics.gravity} | grounded={codexPhysics.grounded ? "Y" : "N"}
        </div>
        
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {/* Test Move Left */}
          <button
            onClick={() => {
              const startX = codexPhysics.x;
              codexInputRef.current = { ...codexInputRef.current, left: true, right: false };
              setTimeout(() => {
                codexInputRef.current = { ...codexInputRef.current, left: false };
                const endX = codexPhysics.x;
                const moved = endX < startX;
                setCommandResults(prev => [...prev.slice(-9), {
                  name: "Move Left",
                  expected: `x should decrease from ${Math.round(startX)}`,
                  actual: `x is now ${Math.round(endX)}`,
                  passed: moved,
                }]);
              }, 500);
            }}
            style={{ padding: "4px 8px", background: "#333", color: "#fff", border: "1px solid #666", cursor: "pointer", fontSize: 8 }}
          >
            ← Left
          </button>
          
          {/* Test Move Right */}
          <button
            onClick={() => {
              const startX = codexPhysics.x;
              codexInputRef.current = { ...codexInputRef.current, right: true, left: false };
              setTimeout(() => {
                codexInputRef.current = { ...codexInputRef.current, right: false };
                const endX = codexPhysics.x;
                const moved = endX > startX;
                setCommandResults(prev => [...prev.slice(-9), {
                  name: "Move Right",
                  expected: `x should increase from ${Math.round(startX)}`,
                  actual: `x is now ${Math.round(endX)}`,
                  passed: moved,
                }]);
              }, 500);
            }}
            style={{ padding: "4px 8px", background: "#333", color: "#fff", border: "1px solid #666", cursor: "pointer", fontSize: 8 }}
          >
            → Right
          </button>
          
          {/* Test Jump */}
          <button
            onClick={() => {
              const wasGrounded = codexPhysics.grounded;
              codexInputRef.current = { ...codexInputRef.current, jump: true };
              setTimeout(() => {
                codexInputRef.current = { ...codexInputRef.current, jump: false };
                const becameAirborne = !codexPhysics.grounded || codexPhysics.vy < 0;
                setCommandResults(prev => [...prev.slice(-9), {
                  name: "Jump",
                  expected: wasGrounded ? "should become airborne" : "was already airborne",
                  actual: codexPhysics.grounded ? "still grounded" : "airborne",
                  passed: wasGrounded ? becameAirborne : true,
                }]);
              }, 200);
            }}
            style={{ padding: "4px 8px", background: "#333", color: "#fff", border: "1px solid #666", cursor: "pointer", fontSize: 8 }}
          >
            ↑ Jump
          </button>
          
          {/* Reset Position */}
          <button
            onClick={() => {
              setCodexPhysics({
                x: 13 * TILE,
                y: 5 * TILE - 44,
                vx: 0,
                vy: 0,
                gravity: "DOWN",
                grounded: true,
                width: 32,
                height: 44,
                jumpHeld: false,
              });
              setCodexPath([]);
              setCommandResults(prev => [...prev.slice(-9), {
                name: "Reset",
                expected: "Codex at spawn position",
                actual: "Reset complete",
                passed: true,
              }]);
            }}
            style={{ padding: "4px 8px", background: "#660000", color: "#fff", border: "1px solid #f00", cursor: "pointer", fontSize: 8 }}
          >
            ⟲ Reset
          </button>
          
          {/* Clear Path */}
          <button
            onClick={() => {
              setCodexPath([]);
              setCommandResults(prev => [...prev.slice(-9), {
                name: "Clear Path",
                expected: "Path cleared",
                actual: `Cleared (was ${codexPath.length} steps)`,
                passed: true,
              }]);
            }}
            style={{ padding: "4px 8px", background: "#333", color: "#fff", border: "1px solid #666", cursor: "pointer", fontSize: 8 }}
          >
            ✕ Clear Path
          </button>
        </div>
        
        {/* Test Results */}
        <div style={{ fontSize: 8 }}>
          {commandResults.map((result, i) => (
            <div 
              key={i} 
              style={{ 
                padding: "3px 5px", 
                marginBottom: 2,
                background: result.passed ? "rgba(0,255,0,0.1)" : "rgba(255,0,0,0.1)",
                borderLeft: `3px solid ${result.passed ? "#0f0" : "#f00"}`,
              }}
            >
              <div style={{ color: result.passed ? "#0f0" : "#f00" }}>
                {result.passed ? "✓" : "✗"} {result.name}
              </div>
              <div style={{ color: "#888" }}>
                Expected: {result.expected}
              </div>
              <div style={{ color: "#aaa" }}>
                Actual: {result.actual}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
