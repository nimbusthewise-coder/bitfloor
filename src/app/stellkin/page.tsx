"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { drawRoom, LUMA_QUARTER, renderRoomCanvas } from "@/lib/stellkin-room";
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
  PHYSICS,
  PLAYER,
} from "@/lib/physics";

// === STELLKIN SHIP EDITOR ===
// A clean, focused ship builder for the Stellkin
// Press E to toggle editor mode

const TILE = 32;
const DEFAULT_SHIP_W = 64;  // Square grid
const DEFAULT_SHIP_H = 64;  // Square grid

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
  
  // === CENTRAL HUB (Severance-style 4-way Command Center) ===
  // Square room with floors on ALL 4 walls - multi-gravity workspace
  const hubSize = 7;
  fillRect(centerX - hubSize, centerY - hubSize, centerX + hubSize, centerY + hubSize, "interior");
  hullRect(centerX - hubSize, centerY - hubSize, centerX + hubSize, centerY + hubSize);
  
  // FLOORS ON ALL 4 SIDES (each becomes a gravity surface)
  // Bottom floor (DOWN gravity)
  fillRect(centerX - hubSize + 1, centerY + hubSize - 1, centerX + hubSize - 1, centerY + hubSize - 1, "floor");
  // Top floor (UP gravity - ceiling workers)
  fillRect(centerX - hubSize + 1, centerY - hubSize + 1, centerX + hubSize - 1, centerY - hubSize + 1, "floor");
  // Left floor (LEFT gravity - wall workers)
  for (let y = centerY - hubSize + 2; y <= centerY + hubSize - 2; y++) {
    setTile(centerX - hubSize + 1, y, "floor");
  }
  // Right floor (RIGHT gravity - wall workers)
  for (let y = centerY - hubSize + 2; y <= centerY + hubSize - 2; y++) {
    setTile(centerX + hubSize - 1, y, "floor");
  }
  
  // CONSOLES facing inward from each gravity orientation
  // Down-gravity consoles (facing up toward center)
  setTile(centerX - 3, centerY + hubSize - 2, "console");
  setTile(centerX + 3, centerY + hubSize - 2, "console");
  // Up-gravity consoles (facing down toward center)
  setTile(centerX - 3, centerY - hubSize + 2, "console");
  setTile(centerX + 3, centerY - hubSize + 2, "console");
  // Left-gravity consoles (facing right toward center)
  setTile(centerX - hubSize + 2, centerY - 2, "console");
  setTile(centerX - hubSize + 2, centerY + 2, "console");
  // Right-gravity consoles (facing left toward center)
  setTile(centerX + hubSize - 2, centerY - 2, "console");
  setTile(centerX + hubSize - 2, centerY + 2, "console");
  
  // Center marker (the convergence point)
  setTile(centerX, centerY, "door");  // Could be a special "nexus" tile
  
  // === RADIAL CORRIDORS (4 directions) ===
  const corridorLength = 10;  // Fits in 64x64 grid
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
  const petalH = 8;
  const northY = Math.max(1, centerY - hubSize - corridorLength - petalH);
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
  const bayW = 18;
  const bayH = Math.min(10, h - southY - 2);
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
  const crewW = Math.min(14, w - eastX - 2);
  const crewH = 12;
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
  const westX = Math.max(1, centerX - hubSize - corridorLength - crewW);
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
  
  // === DIAGONAL PETALS (Games area - NE corner) ===
  
  // NE: Games Room (only if it fits)
  const diagOffset = 12;
  const gamesX = centerX + diagOffset;
  const gamesY = Math.max(4, centerY - diagOffset);
  const gamesSize = 8;
  if (gamesX + gamesSize < w - 1 && gamesY > 2) {
    fillRect(gamesX, gamesY, gamesX + gamesSize, gamesY + gamesSize, "interior");
    hullRect(gamesX, gamesY, gamesX + gamesSize, gamesY + gamesSize);
    fillRect(gamesX + 1, gamesY + gamesSize - 1, gamesX + gamesSize - 1, gamesY + gamesSize - 1, "floor");
    // Arcade tables
    setTile(gamesX + 2, gamesY + gamesSize - 2, "table");
    setTile(gamesX + 5, gamesY + gamesSize - 2, "table");
  }
  
  // === JUMP PLATFORMS (scattered for vertical navigation) ===
  // Add small platforms in corridors for jumping practice
  
  // North corridor platforms (only within corridor)
  if (centerY - hubSize - 4 > northY + petalH) {
    setTile(centerX - 1, centerY - hubSize - 4, "floor");
    setTile(centerX + 1, centerY - hubSize - 8, "floor");
  }
  
  // South corridor platforms
  if (centerY + hubSize + 4 < southY) {
    setTile(centerX - 1, centerY + hubSize + 4, "floor");
    setTile(centerX + 1, centerY + hubSize + 8, "floor");
  }
  
  return grid;
}

// === STELLKIN CREW ===
// The four founding members of the Stellkin

// Crew identities with full sprite information
const CREW_IDENTITIES: Record<string, Identity> = {
  jp: {
    id: "jp",
    name: "JP",
    faceDNA: [0, 6, 0, 2, 8, 3, 8, 5],
    tints: {
      Suit: "#a855f7",     // Violet
      Gloves: "#9333ea",
      Boots: "#6b21a8",
      Helmet: "#c084fc",
    },
    faceTints: {
      skin: "#ffd5b5",
      hair: "#ffd5b5",    // Almost bald
      background: "#ede9fe",
    },
    speed: 1,
  },
  nimbus: {
    id: "nimbus",
    name: "Nimbus",
    faceDNA: [0, 2, 3, 4, 8, 7, 7, 1],
    tints: {
      Suit: "#00d4d4",     // Cyan
      Gloves: "#00b8b8",
      Boots: "#008080",
      Helmet: "#40e0e0",
    },
    faceTints: {
      skin: "#ffd5b5",
      hair: "#2d4a5e",
      background: "#d4f4f4",
    },
    speed: 1,
  },
  sol: {
    id: "sol",
    name: "Sol",
    faceDNA: [0, 3, 3, 3, 8, 5, 3, 2],
    tints: {
      Suit: "#f59e0b",     // Gold/Amber
      Gloves: "#d97706",
      Boots: "#b45309",
      Helmet: "#fbbf24",
    },
    faceTints: {
      skin: "#ffd5b5",
      hair: "#92400e",
      background: "#fef3c7",
    },
    speed: 0.9,
  },
  luma: {
    id: "luma",
    name: "Luma",
    faceDNA: [0, 4, 5, 0, 7, 6, 5, 7],
    tints: {
      Suit: "#ec4899",     // Magenta
      Gloves: "#db2777",
      Boots: "#be185d",
      Helmet: "#f472b6",
    },
    faceTints: {
      skin: "#ffd5b5",
      hair: "#831843",
      background: "#fce7f3",
    },
    speed: 1.1,
  },
};

// Simple crew list for iteration
const CREW_IDS = ["jp", "nimbus", "sol", "luma"] as const;

// Character physics state
// Character state wraps PhysicsState + visual state
interface CharacterState {
  physics: PhysicsState;
  facing: "left" | "right";
}

// Initialize crew positions (spawn in different areas)
function initCrewPositions(shipW: number, shipH: number): Map<string, CharacterState> {
  const centerX = shipW / 2 * TILE;
  const centerY = shipH / 2 * TILE;
  
  const createPhysics = (x: number, y: number, gravity: GravityDirection = "DOWN"): PhysicsState => ({
    x, y, vx: 0, vy: 0,
    gravity,
    grounded: false,
    width: PLAYER.COLLIDER_SIZE,
    height: PLAYER.COLLIDER_SIZE,
    jumpHeld: false,
  });
  
  const positions = new Map<string, CharacterState>();
  
  // JP spawns at center (player) - DOWN gravity
  positions.set("jp", {
    physics: createPhysics(centerX, centerY + 5 * TILE, "DOWN"),
    facing: "right",
  });
  
  // Nimbus spawns north (observatory area) - UP gravity (ceiling walker!)
  positions.set("nimbus", {
    physics: createPhysics(centerX, centerY - 15 * TILE, "UP"),
    facing: "left",
  });
  
  // Sol spawns west (engineering) - LEFT gravity (wall walker!)
  positions.set("sol", {
    physics: createPhysics(centerX - 20 * TILE, centerY, "LEFT"),
    facing: "right",
  });
  
  // Luma spawns east (crew quarters) - RIGHT gravity (wall walker!)
  positions.set("luma", {
    physics: createPhysics(centerX + 20 * TILE, centerY, "RIGHT"),
    facing: "left",
  });
  
  return positions;
}

export default function StellkinPage() {
  // Grid state (start with generated Stellkin layout)
  const [grid, setGrid] = useState<TileType[][]>(() => generateStellkinLayout(DEFAULT_SHIP_W, DEFAULT_SHIP_H));
  const gridRef = useRef(grid);
  useEffect(() => { gridRef.current = grid; }, [grid]);
  const [shipW] = useState(DEFAULT_SHIP_W);
  const [shipH] = useState(DEFAULT_SHIP_H);
  
  // View state (pan & zoom)
  const [zoom, setZoom] = useState(0.6);  // Start zoomed out to see whole ship
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Editor state
  const [editorMode, setEditorMode] = useState(true);  // Start in editor mode
  const editorModeRef = useRef(editorMode);
  useEffect(() => { editorModeRef.current = editorMode; }, [editorMode]);
  const [selectedTile, setSelectedTile] = useState<TileType>("floor");
  const [showGrid, setShowGrid] = useState(true);
  const [cameraFollow, setCameraFollow] = useState(true);  // Follow player in play mode
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<"place" | "erase">("place");
  
  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // === CREW STATE ===
  const [crewPositions, setCrewPositions] = useState<Map<string, CharacterState>>(
    () => initCrewPositions(DEFAULT_SHIP_W, DEFAULT_SHIP_H)
  );
  const crewPositionsRef = useRef(crewPositions);
  useEffect(() => { crewPositionsRef.current = crewPositions; }, [crewPositions]);
  
  // Player input state
  const keysRef = useRef<ScreenInput>({ up: false, down: false, left: false, right: false, jump: false });
  
  // Track which character is player-controlled
  const playerId = "jp";
  
  // === SPRITE STATE ===
  const [spriteSheet, setSpriteSheet] = useState<SpriteSheet | null>(null);
  const [faceSheet, setFaceSheet] = useState<FaceSheet | null>(null);
  const [bakedSprites, setBakedSprites] = useState<Map<string, BakedSprite>>(new Map());
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  
  // Animation state per character
  const [crewAnimations, setCrewAnimations] = useState<Map<string, { frame: number; anim: string }>>(
    () => new Map(CREW_IDS.map(id => [id, { frame: 0, anim: "Idle" }]))
  );
  
  // Starfield animation
  const starsRef = useRef<Array<{x: number, y: number, z: number}>>([]);
  const animFrameRef = useRef<number>(0);
  
  // Animation frame counter (forces re-render for starfield)
  const [frameCount, setFrameCount] = useState(0);
  const roomCanvasCache = useRef<Record<string, HTMLCanvasElement>>({});
  
  // === LOAD SPRITES ===
  useEffect(() => {
    async function loadSprites() {
      try {
        const [sheet, faces] = await Promise.all([
          loadSpriteSheet(
            "/bitfloor/sprites/character-layers.png",
            "/bitfloor/sprites/character-layers.json"
          ),
          loadFaceSheet("/bitfloor/sprites/face-32.png"),
        ]);
        
        setSpriteSheet(sheet);
        setFaceSheet(faces);
        
        // Bake sprites for each crew member
        const baked = new Map<string, BakedSprite>();
        for (const id of CREW_IDS) {
          const identity = CREW_IDENTITIES[id];
          baked.set(id, bakeIdentitySprites(sheet, identity, faces));
        }
        setBakedSprites(baked);
        setSpritesLoaded(true);
        console.log("✅ Stellkin sprites loaded!");
      } catch (err) {
        console.error("Failed to load sprites:", err);
      }
    }
    loadSprites();
  }, []);
  
  // Initialize stars
  useEffect(() => {
    const numStars = 200;
    starsRef.current = Array.from({ length: numStars }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * 1000 + 100,
    }));
  }, []);
  
  // Animation loop for starfield + characters (continuous)
  const frameTickRef = useRef(0);
  
  useEffect(() => {
    let running = true;
    let isMoving = false;
    
    const animate = () => {
      if (!running) return;
      setFrameCount(f => f + 1);
      frameTickRef.current++;
      
      // Solid tiles for physics collision
      const SOLID_TILES = ["hull", "hullLight", "floor", "console", "bed", "table"];
      
      // Update physics when not in editor mode
      if (!editorModeRef.current) {
        const input = keysRef.current;
        const g = gridRef.current;
        
        // Skip if grid not ready
        if (!g || !g.length || !g[0]) {
          animFrameRef.current = requestAnimationFrame(animate);
          return;
        }
        
        setCrewPositions(prev => {
          const next = new Map(prev);
          
          // Update player (JP) with input
          const jpState = next.get(playerId);
          if (jpState) {
            const newPhysics = updatePhysics(jpState.physics, input, g, SOLID_TILES);
            
            // Determine facing from horizontal velocity (gravity-relative)
            let facing = jpState.facing;
            const grav = newPhysics.gravity;
            if (grav === "DOWN" || grav === "UP") {
              if (newPhysics.vx < -0.5) facing = "left";
              else if (newPhysics.vx > 0.5) facing = "right";
            } else {
              // LEFT/RIGHT gravity: vy is horizontal
              if (newPhysics.vy < -0.5) facing = "left";
              else if (newPhysics.vy > 0.5) facing = "right";
            }
            
            isMoving = Math.abs(newPhysics.vx) > 0.5 || Math.abs(newPhysics.vy) > 0.5;
            
            next.set(playerId, {
              physics: newPhysics,
              facing,
            });
          }
          
          // Update NPCs with no input (just gravity)
          const noInput: ScreenInput = { up: false, down: false, left: false, right: false, jump: false };
          for (const id of CREW_IDS) {
            if (id === playerId) continue;
            const state = next.get(id);
            if (state) {
              next.set(id, {
                ...state,
                physics: updatePhysics(state.physics, noInput, g, SOLID_TILES),
              });
            }
          }
          
          return next;
        });
        
        // Update animation frames (every 6 ticks = ~10fps animation)
        if (frameTickRef.current % 6 === 0) {
          setCrewAnimations(prev => {
            const next = new Map(prev);
            for (const id of CREW_IDS) {
              const current = next.get(id) || { frame: 0, anim: "Idle" };
              const charState = crewPositionsRef.current?.get(id);
              const isCharMoving = charState && (
                Math.abs(charState.physics.vx) > 0.5 || 
                Math.abs(charState.physics.vy) > 0.5
              );
              const anim = isCharMoving ? "Run" : "Idle";
              const maxFrames = anim === "Run" ? 8 : 4;
              next.set(id, {
                anim,
                frame: (current.frame + 1) % maxFrames,
              });
            }
            return next;
          });
        }
      }
      
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
    
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);
  
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
      if (e.key.toLowerCase() === "c" && !e.repeat) {
        setCameraFollow(prev => !prev);
      }
      // Arrow keys for panning
      const panSpeed = 20 / zoom;
      if (e.key === "ArrowLeft") setPanX(p => p + panSpeed);
      if (e.key === "ArrowRight") setPanX(p => p - panSpeed);
      if (e.key === "ArrowUp") setPanY(p => p + panSpeed);
      if (e.key === "ArrowDown") setPanY(p => p - panSpeed);
      
      // WASD + Space for player movement (play mode only)
      const k = e.key.toLowerCase();
      if (k === "w") keysRef.current.up = true;
      if (k === "s") keysRef.current.down = true;
      if (k === "a") keysRef.current.left = true;
      if (k === "d") keysRef.current.right = true;
      // Jump on W (gravity-relative up) or Shift
      if (k === "w" || e.key === "Shift") keysRef.current.jump = true;
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setSpaceHeld(false);
      }
      // WASD + jump release
      const k = e.key.toLowerCase();
      if (k === "w") { keysRef.current.up = false; keysRef.current.jump = false; }
      if (k === "s") keysRef.current.down = false;
      if (k === "a") keysRef.current.left = false;
      if (k === "d") keysRef.current.right = false;
      if (e.key === "Shift") keysRef.current.jump = false;
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
  
  const getRoomZones = (w: number, h: number) => {
    const centerX = Math.floor(w / 2);
    const centerY = Math.floor(h / 2);
    const hubSize = 7;
    const corridorLength = 10;
    const crewW = 14;
    const crewH = 12;
    const eastX = centerX + hubSize + corridorLength;
    return [
      {
        id: "luma-quarter",
        room: LUMA_QUARTER,
        x: eastX,
        y: Math.floor(centerY - crewH / 2),
        w: crewW,
        h: crewH,
      },
    ];
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
    
    // === STARFIELD (Windows 98 screensaver style) ===
    const centerScreenX = canvas.width / 2;
    const centerScreenY = canvas.height / 2;
    const speed = 2;
    
    ctx.fillStyle = "#ffffff";
    for (const star of starsRef.current) {
      // Move star toward viewer
      star.z -= speed;
      
      // Reset star if it passes the viewer
      if (star.z <= 0) {
        star.x = (Math.random() - 0.5) * 2000;
        star.y = (Math.random() - 0.5) * 2000;
        star.z = 1000;
      }
      
      // Project 3D to 2D (perspective)
      const projX = (star.x / star.z) * 300 + centerScreenX;
      const projY = (star.y / star.z) * 300 + centerScreenY;
      
      // Size based on distance (closer = bigger)
      const size = Math.max(0.5, (1 - star.z / 1000) * 3);
      
      // Brightness based on distance
      const brightness = Math.floor((1 - star.z / 1000) * 255);
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${Math.min(255, brightness + 50)})`;
      
      // Draw star
      ctx.beginPath();
      ctx.arc(projX, projY, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw trail for fast stars
      if (star.z < 300) {
        const trailLength = (1 - star.z / 300) * 20;
        ctx.strokeStyle = `rgba(${brightness}, ${brightness}, ${Math.min(255, brightness + 50)}, 0.5)`;
        ctx.lineWidth = size * 0.5;
        ctx.beginPath();
        ctx.moveTo(projX, projY);
        ctx.lineTo(projX - (star.x / star.z) * trailLength, projY - (star.y / star.z) * trailLength);
        ctx.stroke();
      }
    }
    
    // Transform for pan & zoom (centered)
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(panX, panY);
    ctx.translate(-(shipW * TILE) / 2, -(shipH * TILE) / 2);
    
    // Draw tiles (skip space tiles to show starfield)
    for (let y = 0; y < shipH; y++) {
      for (let x = 0; x < shipW; x++) {
        const tile = grid[y][x];
        
        // Skip space tiles - let starfield show through
        if (tile === "space") continue;
        
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

    // Room overlay pass (grid-snapped)
    const roomZones = getRoomZones(shipW, shipH);
    for (const zone of roomZones) {
      const key = `${zone.id}-${TILE}`;
      if (!roomCanvasCache.current[key]) {
        roomCanvasCache.current[key] = renderRoomCanvas(zone.room, { tile: TILE, padding: 0 });
      }
      const roomCanvas = roomCanvasCache.current[key];
      ctx.drawImage(roomCanvas, zone.x * TILE, zone.y * TILE, zone.w * TILE, zone.h * TILE);
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
    
    // Draw ship boundary (only in editor mode)
    if (editorMode) {
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(0, 0, shipW * TILE, shipH * TILE);
    }
    
    // === RENDER CREW ===
    // Draw each crew member with sprites (or fallback circles)
    const SPRITE_SIZE = 48;
    
    for (const id of CREW_IDS) {
      const state = crewPositions.get(id);
      if (!state) continue;
      
      const identity = CREW_IDENTITIES[id];
      const baked = bakedSprites.get(id);
      const animState = crewAnimations.get(id) || { frame: 0, anim: "Idle" };
      
      const x = state.physics.x;
      const y = state.physics.y;
      const gravity = state.physics.gravity;
      
      // Calculate rotation based on gravity direction
      const rotationMap: Record<GravityDirection, number> = {
        DOWN: 0,
        UP: 180,
        LEFT: 90,
        RIGHT: -90,
      };
      const rotation = rotationMap[gravity] * Math.PI / 180;
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      
      // Flip for facing direction
      if (state.facing === "left") {
        ctx.scale(-1, 1);
      }
      
      if (baked && spritesLoaded) {
        // Draw baked sprite
        ctx.drawImage(
          baked.canvas,
          animState.frame * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE,
          -SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE
        );
      } else {
        // Fallback: colored circle while sprites load
        const color = identity.tints.Suit || "#888";
        
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(identity.name[0], 0, 0);
      }
      
      ctx.restore();
      
      // Name label below (in play mode)
      if (!editorMode) {
        ctx.font = "8px sans-serif";
        ctx.fillStyle = identity.tints.Suit || "#888";
        ctx.textAlign = "center";
        ctx.fillText(identity.name, x, y + SPRITE_SIZE / 2 + 4);
      }
    }
    
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
    
  }, [grid, zoom, panX, panY, shipW, shipH, showGrid, editorMode, frameCount, crewPositions, bakedSprites, spritesLoaded, crewAnimations]);
  
  // Camera follow - center view on player when in play mode
  useEffect(() => {
    if (editorMode || !cameraFollow) return;
    
    const jp = crewPositions.get(playerId);
    if (!jp) return;
    
    // Calculate pan to center on player
    // Pan is the offset from center, so we need to move the view so JP is at center
    const targetPanX = -(jp.physics.x - (shipW * TILE) / 2);
    const targetPanY = -(jp.physics.y - (shipH * TILE) / 2);
    
    // Smooth camera movement
    setPanX(prev => prev + (targetPanX - prev) * 0.1);
    setPanY(prev => prev + (targetPanY - prev) * 0.1);
  }, [crewPositions, editorMode, cameraFollow, shipW, shipH]);
  
  // Room preview (Luma's quarter)
  useEffect(() => {
    const canvas = roomCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawRoom(ctx, LUMA_QUARTER, { tile: 18, padding: 10 });
  }, []);

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

      {/* Luma's Quarter Preview */}
      <div
        style={{
          position: "absolute",
          right: 20,
          top: 60,
          padding: 10,
          background: "rgba(10, 10, 20, 0.9)",
          border: "1px solid #444455",
          boxShadow: "0 0 20px rgba(255, 0, 170, 0.25)",
        }}
      >
        <div style={{ color: "#ff00aa", fontSize: 8, marginBottom: 6 }}>
          LUMA'S QUARTERS
        </div>
        <canvas
          ref={roomCanvasRef}
          style={{
            display: "block",
            imageRendering: "pixelated",
          }}
        />
      </div>
      
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
          <>WASD: move | Space+drag: pan | C: camera follow | E: toggle editor</>
        )}
      </div>
    </div>
  );
}
