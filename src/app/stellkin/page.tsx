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
  getMoveRightVector,
  PHYSICS,
  PLAYER,
} from "@/lib/physics";
import {
  precomputeMovements,
  findPathBetweenPositions,
  PathStep,
  MovementMap,
  GravityDir,
} from "@/lib/pathfinding";
import {
  calculateReachableCells,
  JumpResult,
} from "@/lib/physics-pathfinding";
import {
  createExecutor,
  stepExecutor,
  isComplete,
  ExecutorState,
} from "@/lib/path-executor";

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
  
  // centerX/Y are ALREADY in pixels (shipW/2 * TILE), don't multiply again!
  // Hub extends ± hubSize (7 tiles) from center
  // Spawn all in center, they'll fall to their respective floors
  
  // JP spawns at center (player) - DOWN gravity
  positions.set("jp", {
    physics: createPhysics(centerX, centerY, "DOWN"),
    facing: "right",
  });
  
  // Nimbus spawns at center - UP gravity (ceiling walker!)
  positions.set("nimbus", {
    physics: createPhysics(centerX + TILE, centerY, "UP"),
    facing: "left",
  });
  
  // Sol spawns at center - LEFT gravity (wall walker!)
  positions.set("sol", {
    physics: createPhysics(centerX, centerY + TILE, "LEFT"),
    facing: "right",
  });
  
  // Luma spawns at center - RIGHT gravity (wall walker!)
  positions.set("luma", {
    physics: createPhysics(centerX, centerY - TILE, "RIGHT"),
    facing: "left",
  });
  
  return positions;
}

// Sprite offset to align visual sprite with physics collider (from /ship)
// Sprite is 48x48, collider is PLAYER.COLLIDER_SIZE (30x30)
const SPRITE_SIZE = 48;
function getSpriteOffset(gravity: GravityDirection): { x: number; y: number } {
  const spriteW = SPRITE_SIZE, spriteH = SPRITE_SIZE;
  const collW = PLAYER.COLLIDER_SIZE;
  const collH = PLAYER.COLLIDER_SIZE;
  const extraW = (spriteW - collW) / 2;  // 9px on each side
  const extraH = spriteH - collH;         // 18px extra height

  switch (gravity) {
    case "DOWN":  // Feet at bottom - align sprite bottom with collision bottom
      return { x: -extraW, y: -extraH };
    case "UP":    // Feet at top - align sprite top with collision top
      return { x: -extraW, y: 0 };
    case "LEFT":  // Feet at left - align sprite left with collision left
      return { x: 0, y: -extraW };
    case "RIGHT": // Feet at right - align sprite right with collision right
      return { x: -(spriteW - collW), y: -extraW };
  }
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
  // Input tracking - use Set like /ship for reliable key held detection
  const keysRef = useRef(new Set<string>());
  
  // Track which character is player-controlled
  const playerId = "jp";
  
  // === NAVIGATION STATE ===
  // Click-to-navigate: select character, then click destination
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<Map<string, { x: number; y: number }>>(new Map());
  const destinationsRef = useRef(destinations);
  useEffect(() => { destinationsRef.current = destinations; }, [destinations]);
  
  // Pathfinding state
  const [movementMap, setMovementMap] = useState<MovementMap | null>(null);
  const movementMapRef = useRef<MovementMap | null>(null);
  useEffect(() => { movementMapRef.current = movementMap; }, [movementMap]);
  
  // Physics-based executors per NPC (like /ship)
  // These replay pre-computed trajectories frame-by-frame
  const executorsRef = useRef<Map<string, ExecutorState>>(new Map());
  
  // Store current paths for visualization
  const [npcPaths, setNpcPaths] = useState<Map<string, JumpResult[]>>(new Map());
  
  // === SPRITE STATE ===
  const [spriteSheet, setSpriteSheet] = useState<SpriteSheet | null>(null);
  const spriteSheetRef = useRef<SpriteSheet | null>(null);
  useEffect(() => { spriteSheetRef.current = spriteSheet; }, [spriteSheet]);
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
  
  // Precompute movement map for pathfinding when grid changes
  const SOLID_TILES = ["hull", "hullLight", "floor", "console", "bed", "table"];
  useEffect(() => {
    console.log("🗺️ Computing movement map for pathfinding...");
    const map = precomputeMovements(grid, SOLID_TILES);
    setMovementMap(map);
    console.log(`✅ Movement map ready (${map.size} valid positions)`);
  }, [grid]);
  
  // Animation loop for starfield + characters (continuous)
  // Time-based animation like /ship (10fps = 100ms per frame)
  const ANIM_FRAME_MS = 100;
  const PHYSICS_TIMESTEP = 1000 / 60; // 60fps physics (16.67ms)
  
  useEffect(() => {
    let running = true;
    let isMoving = false;
    let lastTime = performance.now();
    let animTime = 0;
    let physicsAccum = 0; // Accumulator for fixed timestep physics
    
    const animate = (currentTime: number) => {
      if (!running) return;
      
      const deltaTime = Math.min(currentTime - lastTime, 100); // Cap to prevent spiral of death
      lastTime = currentTime;
      animTime += deltaTime;
      physicsAccum += deltaTime;
      
      setFrameCount(f => f + 1);
      
      // Update physics when not in editor mode (fixed timestep)
      // Fixed timestep physics (like /ship)
      // Use refs for physics updates, sync to React state once per render
      const g = gridRef.current;
      let physicsUpdated = false;
      
      if (g && g.length && g[0] && !editorModeRef.current) {
        while (physicsAccum >= PHYSICS_TIMESTEP) {
          physicsUpdated = true;
          
          // Build ScreenInput from Set (like /ship)
          const keys = keysRef.current;
          const input: ScreenInput = {
            up: keys.has("w"),
            down: keys.has("s"),
            left: keys.has("a"),
            right: keys.has("d"),
            jump: keys.has(" "),
          };
          
          // Get current state from ref (not React state)
          const currentPositions = crewPositionsRef.current;
          const nextPositions = new Map(currentPositions);
          
          // Update JP physics
          const jpState = currentPositions.get(playerId);
          if (jpState) {
            const newPhysics = updatePhysics(jpState.physics, input, g, SOLID_TILES);
            let facing = jpState.facing;
            const moveRightVec = getMoveRightVector(newPhysics.gravity);
            const lateralVel = newPhysics.vx * moveRightVec.x + newPhysics.vy * moveRightVec.y;
            if (lateralVel > 0.5) facing = "right";
            else if (lateralVel < -0.5) facing = "left";
            isMoving = Math.abs(newPhysics.vx) > 0.5 || Math.abs(newPhysics.vy) > 0.5;
            nextPositions.set(playerId, { physics: newPhysics, facing });
          }
          
          // Update NPCs - executor OR gravity
          for (const id of CREW_IDS) {
            if (id === playerId) continue;
            const state = currentPositions.get(id);
            if (!state) continue;
            
            const executor = executorsRef.current.get(id);
            let newPhysics = state.physics;
            let facing = state.facing;
            
            if (executor && !isComplete(executor)) {
              // Step executor (1 frame per physics step)
              const frame = stepExecutor(executor);
              if (frame) {
                newPhysics = {
                  ...state.physics,
                  x: frame.x,
                  y: frame.y,
                  vx: frame.vx,
                  vy: frame.vy,
                  gravity: frame.gravity,
                  grounded: frame.grounded,
                };
                
                const moveRightVec = getMoveRightVector(frame.gravity);
                const lateralVel = frame.vx * moveRightVec.x + frame.vy * moveRightVec.y;
                if (lateralVel > 0.5) facing = "right";
                else if (lateralVel < -0.5) facing = "left";
              }
              
              if (isComplete(executor)) {
                console.log(`✅ ${id} reached destination`);
                executorsRef.current.delete(id);
                setDestinations(prev => { const n = new Map(prev); n.delete(id); return n; });
                setNpcPaths(prev => { const n = new Map(prev); n.delete(id); return n; });
              }
            } else {
              // No executor - apply gravity
              const noInput: ScreenInput = { up: false, down: false, left: false, right: false, jump: false };
              newPhysics = updatePhysics(state.physics, noInput, g, SOLID_TILES);
            }
            
            nextPositions.set(id, { physics: newPhysics, facing });
          }
          
          // Update ref immediately (canvas reads from this)
          crewPositionsRef.current = nextPositions;
          
          physicsAccum -= PHYSICS_TIMESTEP;
        }
        
        // Sync to React state once per render (for re-renders that need it)
        if (physicsUpdated) {
          setCrewPositions(crewPositionsRef.current);
        }
      }
      
      // Time-based animation (100ms per frame = 10fps, like /ship)
      // NOTE: Outside the physics while loop - runs once per render frame
      if (!editorModeRef.current && animTime >= ANIM_FRAME_MS) {
          animTime -= ANIM_FRAME_MS; // Preserve remainder for smooth timing
          
          // Get sprite sheet for tag info (may be null while loading)
          const sheet = spriteSheetRef.current;
          
          setCrewAnimations(prev => {
            const next = new Map(prev);
            for (const id of CREW_IDS) {
              const current = next.get(id) || { frame: 0, anim: "Idle" };
              const charState = crewPositionsRef.current?.get(id);
              if (!charState) continue;
              
              // Animation state like /ship: Jump > Run > Idle
              const isMoving = Math.abs(charState.physics.vx) > 0.3 || Math.abs(charState.physics.vy) > 0.3;
              const anim = !charState.physics.grounded ? "Jump" : isMoving ? "Run" : "Idle";
              
              // Frame advancement using sprite sheet tags (like /ship)
              let newFrame = current.frame;
              if (sheet) {
                const tag = sheet.tags.find(t => t.name === anim);
                if (tag) {
                  // If animation changed or frame out of range, reset to tag start
                  if (anim !== current.anim || current.frame < tag.from || current.frame > tag.to) {
                    newFrame = tag.from;
                  } else {
                    // Advance and wrap within tag range
                    newFrame = current.frame + 1;
                    if (newFrame > tag.to) newFrame = tag.from;
                  }
                }
              } else {
                // Fallback: simple frame loop
                const maxFrames = anim === "Run" ? 8 : 4;
                newFrame = (current.frame + 1) % maxFrames;
              }
              
              next.set(id, { anim, frame: newFrame });
            }
            return next;
          });
        }
      
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate(performance.now());
    
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
      // Add key to Set (like /ship pattern)
      keysRef.current.add(e.key.toLowerCase());
      
      // Prevent spacebar from scrolling page (but allow for pan when spaceHeld)
      if (e.key === " " && !spaceHeld) {
        e.preventDefault();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setSpaceHeld(false);
      }
      // Remove key from Set
      keysRef.current.delete(e.key.toLowerCase());
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
      const zoomFactor = e.deltaY > 0 ? 0.97 : 1.03;  // Gentle zoom (3% per tick)
      setZoom(z => Math.min(Math.max(z * zoomFactor, 0.25), 4));
    };
    
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);
  
  // Convert screen coords to world pixel coords
  const screenToWorld = useCallback((screenX: number, screenY: number): { x: number; y: number } | null => {
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
    
    return { x: worldX, y: worldY };
  }, [zoom, panX, panY, shipW, shipH]);
  
  // Convert screen coords to grid coords
  const screenToGrid = useCallback((screenX: number, screenY: number) => {
    const world = screenToWorld(screenX, screenY);
    if (!world) return null;
    
    const tileX = Math.floor(world.x / TILE);
    const tileY = Math.floor(world.y / TILE);
    
    if (tileX >= 0 && tileX < shipW && tileY >= 0 && tileY < shipH) {
      return { x: tileX, y: tileY };
    }
    return null;
  }, [screenToWorld, shipW, shipH]);
  
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
  
  // Check if a world position is inside a character's bounds
  const getCharacterAtPosition = useCallback((worldX: number, worldY: number): string | null => {
    for (const id of CREW_IDS) {
      const state = crewPositionsRef.current.get(id);
      if (!state) continue;
      
      const { x, y, width, height } = state.physics;
      if (worldX >= x && worldX < x + width && worldY >= y && worldY < y + height) {
        return id;
      }
    }
    return null;
  }, []);
  
  // Mouse handlers for drawing (editor) and navigation (play)
  const handleMouseDown = (e: React.MouseEvent) => {
    // Spacebar + click = pan (works in any mode, like Photoshop)
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      // Middle click or Space+click = pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX * zoom, y: e.clientY - panY * zoom });
      return;
    }
    
    // === PLAY MODE: Click-to-navigate ===
    if (!editorMode && e.button === 0) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      if (!worldPos) return;
      
      // Check if clicking on a character
      const clickedChar = getCharacterAtPosition(worldPos.x, worldPos.y);
      
      if (clickedChar) {
        // Select/deselect character
        setSelectedCharacter(prev => prev === clickedChar ? null : clickedChar);
      } else if (selectedCharacter) {
        // Set destination for selected character
        const gridPos = screenToGrid(e.clientX, e.clientY);
        if (gridPos) {
          // Store destination
          setDestinations(prev => {
            const next = new Map(prev);
            next.set(selectedCharacter, { x: gridPos.x * TILE, y: gridPos.y * TILE });
            return next;
          });
          
          // Compute physics-based path using calculateReachableCells (like /ship)
          const charState = crewPositionsRef.current.get(selectedCharacter);
          if (charState) {
            const startTileX = Math.floor((charState.physics.x + PLAYER.COLLIDER_SIZE / 2) / TILE);
            const startTileY = Math.floor((charState.physics.y + PLAYER.COLLIDER_SIZE / 2) / TILE);
            const startGrav = charState.physics.gravity;
            
            // Get all reachable cells with their paths
            const reachable = calculateReachableCells(
              startTileX,
              startTileY,
              startGrav as any,
              grid,
              SOLID_TILES
            );
            
            // Find the cell closest to our destination
            let bestCell = null;
            let minDist = Infinity;
            for (const cell of reachable) {
              const dist = Math.abs(cell.x - gridPos.x) + Math.abs(cell.y - gridPos.y);
              if (dist < minDist) {
                minDist = dist;
                bestCell = cell;
              }
            }
            
            if (bestCell && bestCell.path.length > 0) {
              console.log(`📍 Physics path found for ${selectedCharacter}: ${bestCell.path.length} jumps, dist=${minDist}`);
              
              // Create executor to replay the trajectory
              const executor = createExecutor(bestCell.path);
              executorsRef.current.set(selectedCharacter, executor);
              
              // Store for visualization
              setNpcPaths(prev => {
                const next = new Map(prev);
                next.set(selectedCharacter, bestCell.path);
                return next;
              });
            } else {
              console.log(`❌ No physics path found for ${selectedCharacter} (${reachable.length} reachable cells)`);
              executorsRef.current.delete(selectedCharacter);
              setNpcPaths(prev => {
                const next = new Map(prev);
                next.delete(selectedCharacter);
                return next;
              });
            }
          }
        }
      }
      return;
    }
    
    // === PLAY MODE: Right-click to clear destination/selection ===
    if (!editorMode && e.button === 2) {
      if (selectedCharacter) {
        // Clear destination for selected character
        setDestinations(prev => {
          const next = new Map(prev);
          next.delete(selectedCharacter);
          return next;
        });
        setSelectedCharacter(null);
      }
      return;
    }
    
    // === EDITOR MODE ===
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
    
    // Pixel-perfect rendering
    ctx.imageSmoothingEnabled = false;
    
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
    
    // Transform for pan & zoom (centered, pixel-snapped)
    // Calculate world origin in screen space and snap to integer pixels
    const worldOriginX = canvas.width / 2 + (panX - (shipW * TILE) / 2) * zoom;
    const worldOriginY = canvas.height / 2 + (panY - (shipH * TILE) / 2) * zoom;
    const snappedOriginX = Math.round(worldOriginX);
    const snappedOriginY = Math.round(worldOriginY);
    
    ctx.save();
    ctx.translate(snappedOriginX, snappedOriginY);
    ctx.scale(zoom, zoom);
    
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
    // Using same approach as /ship: offset sprite to align feet with collider
    
    for (const id of CREW_IDS) {
      const state = crewPositions.get(id);
      if (!state) continue;
      
      const identity = CREW_IDENTITIES[id];
      const baked = bakedSprites.get(id);
      const animState = crewAnimations.get(id) || { frame: 0, anim: "Idle" };
      const gravity = state.physics.gravity;
      
      // Calculate sprite offset to align feet with collider (like /ship)
      const spriteOffset = getSpriteOffset(gravity);
      
      // Pixel-perfect positions with sprite offset applied
      const screenX = Math.round(state.physics.x + spriteOffset.x);
      const screenY = Math.round(state.physics.y + spriteOffset.y);
      
      // Calculate rotation based on gravity direction
      const rotationMap: Record<GravityDirection, number> = {
        DOWN: 0,
        UP: 180,
        LEFT: 90,
        RIGHT: -90,
      };
      const rotation = rotationMap[gravity] * Math.PI / 180;
      
      ctx.save();
      // Translate to sprite center (not physics position)
      ctx.translate(screenX + SPRITE_SIZE / 2, screenY + SPRITE_SIZE / 2);
      ctx.rotate(rotation);
      
      // Flip for facing direction
      if (state.facing === "left") {
        ctx.scale(-1, 1);
      }
      
      if (baked && spritesLoaded) {
        // Draw baked sprite centered at origin
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
      
      // Selection highlight
      if (!editorMode && selectedCharacter === id) {
        ctx.strokeStyle = identity.tints.Suit || "#fff";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.strokeRect(
          state.physics.x - 4,
          state.physics.y - 4,
          PLAYER.COLLIDER_SIZE + 8,
          PLAYER.COLLIDER_SIZE + 8
        );
        ctx.setLineDash([]);
      }
      
      // Name label below (in play mode)
      if (!editorMode) {
        ctx.font = "8px sans-serif";
        ctx.fillStyle = identity.tints.Suit || "#888";
        ctx.textAlign = "center";
        // Position label below sprite (using physics position for simplicity)
        const labelX = state.physics.x + PLAYER.COLLIDER_SIZE / 2;
        const labelY = state.physics.y + PLAYER.COLLIDER_SIZE + 10;
        ctx.fillText(identity.name, labelX, labelY);
      }
    }
    
    // === RENDER DESTINATIONS ===
    // Draw destination markers for characters with active destinations
    if (!editorMode) {
      for (const [charId, dest] of destinations) {
        const identity = CREW_IDENTITIES[charId];
        const color = identity?.tints.Suit || "#fff";
        
        // Draw X marker at destination
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        // X shape
        const size = 8;
        ctx.moveTo(dest.x - size, dest.y - size);
        ctx.lineTo(dest.x + size + PLAYER.COLLIDER_SIZE, dest.y + size + PLAYER.COLLIDER_SIZE);
        ctx.moveTo(dest.x + size + PLAYER.COLLIDER_SIZE, dest.y - size);
        ctx.lineTo(dest.x - size, dest.y + size + PLAYER.COLLIDER_SIZE);
        ctx.stroke();
        
        // Pulsing circle
        const pulse = Math.sin(frameCount * 0.1) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(
          dest.x + PLAYER.COLLIDER_SIZE / 2,
          dest.y + PLAYER.COLLIDER_SIZE / 2,
          PLAYER.COLLIDER_SIZE * 0.8,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Draw physics-based path for this character (JumpResult trajectories)
        const jumpPath = npcPaths.get(charId);
        if (jumpPath && jumpPath.length > 0) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 / zoom;
          ctx.globalAlpha = 0.6;
          
          // Draw each jump/walk action's trajectory
          for (const action of jumpPath) {
            if (action.trajectory && action.trajectory.length > 1) {
              ctx.beginPath();
              ctx.moveTo(action.trajectory[0].x, action.trajectory[0].y);
              for (let i = 1; i < action.trajectory.length; i++) {
                ctx.lineTo(action.trajectory[i].x, action.trajectory[i].y);
              }
              ctx.stroke();
            }
            
            // Draw landing point
            if (action.landing) {
              ctx.fillStyle = action.action.includes("jump") ? "#ff6b6b" : color;
              ctx.beginPath();
              ctx.arc(
                action.landing.x * TILE + TILE / 2,
                action.landing.y * TILE + TILE / 2,
                4 / zoom,
                0,
                Math.PI * 2
              );
              ctx.fill();
            }
          }
          
          ctx.globalAlpha = 1;
        }
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
    
    // Zoom indicator moved to DOM overlay
    
  }, [grid, zoom, panX, panY, shipW, shipH, showGrid, editorMode, frameCount, crewPositions, bakedSprites, spritesLoaded, crewAnimations, selectedCharacter, destinations, npcPaths]);
  
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

      {/* Zoom Controls */}
      {(() => {
        // Snap levels with labels
        const snaps = [
          { val: 0.25, label: "¼x" },
          { val: 0.5, label: "½x" },
          { val: 0.75, label: "¾x" },
          { val: 1, label: "1x" },
          { val: 1.5, label: "1.5x" },
          { val: 2, label: "2x" },
          { val: 3, label: "3x" },
          { val: 4, label: "4x" },
        ];
        
        // Find nearest snap that's different from current (with 5% tolerance)
        const currentPct = Math.round(zoom * 100);
        const nearestSnaps = snaps
          .filter(s => Math.abs(s.val * 100 - currentPct) > 5)
          .sort((a, b) => Math.abs(a.val - zoom) - Math.abs(b.val - zoom))
          .slice(0, 2);  // Show up to 2 nearby snaps
        
        return (
          <div style={{
            position: "absolute",
            right: 20,
            top: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "'Press Start 2P', monospace",
          }}>
            {nearestSnaps.map(snap => (
              <button
                key={snap.val}
                onClick={() => setZoom(snap.val)}
                style={{
                  background: "rgba(10, 10, 20, 0.9)",
                  border: "1px solid #555",
                  color: "#00ffff",
                  padding: "4px 8px",
                  fontSize: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {snap.label}
              </button>
            ))}
            <span style={{ color: "#888", fontSize: 10, minWidth: 50, textAlign: "right" }}>
              {currentPct}%
            </span>
          </div>
        );
      })()}

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
          <>WASD: move | Space: jump | C: camera follow | E: toggle editor | Middle-drag: pan</>
        )}
      </div>
    </div>
  );
}
