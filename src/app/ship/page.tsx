"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  PLAYER,
} from "@/lib/physics";
import {
  precomputeMovements,
  createIncrementalSearch,
  stepIncrementalSearch,
  IncrementalSearchState,
  PathStep,
  GravityDir,
  canStand,
} from "@/lib/pathfinding";
import {
  calculateReachableCells,
  findClosestReachable,
  getJumpTrajectories,
  JumpResult,
} from "@/lib/physics-pathfinding";
import {
  createExecutor,
  stepExecutor,
  isComplete,
  ExecutorState,
  ExecutorFrame,
} from "@/lib/path-executor";
import {
  runPathfindingTest,
  runAllTests,
  formatTestResult,
  TestResult,
  lateralToInput,
  runPinkNimTest,
} from "@/lib/pathfinding-tests";

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

// Nim - Target character (pink/magenta)
const nim: Identity = {
  id: "nim",
  name: "Nim",
  faceDNA: [0, 2, 3, 4, 8, 7, 7, 1],
  tints: {
    Suit: "#ff00aa",
    Gloves: "#ff1493",
    Boots: "#c71585",
    Helmet: "#ff69b4",
  },
  faceTints: {
    skin: "#ffe4e1",
    hair: "#ff1493",
    background: "#ffb6c1",
  },
  speed: 1,
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
const SHIP_H = 16; // 512px total

// Viewport dimensions  
const VIEW_W = 20; // 640px visible
const VIEW_H = 12; // 384px visible

// Room height: 4 tiles vertical space + 1 tile floor = 5 tiles
const ROOM_H = 5;

// World bounds in pixels
const WORLD_WIDTH_PX = SHIP_W * TILE;
const WORLD_HEIGHT_PX = SHIP_H * TILE;

// Debug flag - set to false for production/performance
const DEBUG_NIM = false;

/**
 * Clamp physics state to world bounds.
 * This is the SINGLE POINT where boundary enforcement happens for direct position writes.
 * Prevents characters from escaping the map when snapping positions.
 */
function clampPhysicsToBounds(physics: PhysicsState): void {
  if (physics.x < 0) {
    if (DEBUG_NIM) console.log(`[CLAMP] x was ${physics.x}, clamping to 0`);
    physics.x = 0;
    physics.vx = 0;
  } else if (physics.x + physics.width > WORLD_WIDTH_PX) {
    const maxX = WORLD_WIDTH_PX - physics.width;
    if (DEBUG_NIM) console.log(`[CLAMP] x was ${physics.x}, clamping to ${maxX}`);
    physics.x = maxX;
    physics.vx = 0;
  }

  if (physics.y < 0) {
    if (DEBUG_NIM) console.log(`[CLAMP] y was ${physics.y}, clamping to 0`);
    physics.y = 0;
    physics.vy = 0;
  } else if (physics.y + physics.height > WORLD_HEIGHT_PX) {
    const maxY = WORLD_HEIGHT_PX - physics.height;
    if (DEBUG_NIM) console.log(`[CLAMP] y was ${physics.y}, clamping to ${maxY}`);
    physics.y = maxY;
    physics.vy = 0;
  }
}

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

// Precompute pathfinding transitions once (ship grid is static)
const movementMap = precomputeMovements(shipGrid, SOLID_TILES);

export default function ShipPage() {
  const [showGrid, setShowGrid] = useState(false);  // Default off for cleaner look
  // CARGO RESCUE: Start camera focused on Cargo bay
  const [viewX, setViewX] = useState(0);
  const [viewY, setViewY] = useState(6);  // Focus on lower deck where Cargo is
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // rAF loop reads/writes these refs; React state is only for rendering/UI.
  const viewXRef = useRef(viewX);
  const viewYRef = useRef(viewY);
  const cameraEnabledRef = useRef(cameraEnabled);

  useEffect(() => { viewXRef.current = viewX; }, [viewX]);
  useEffect(() => { viewYRef.current = viewY; }, [viewY]);
  useEffect(() => { cameraEnabledRef.current = cameraEnabled; }, [cameraEnabled]);

  const containerRef = useRef<HTMLDivElement>(null);
  
  // Canvas for game rendering (60fps smooth, no React re-renders)
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Spring camera velocity (for smooth ease in-out)
  const cameraVelRef = useRef({ x: 0, y: 0 });
  
  // Nimbus physics state (JP - Player)
  // CARGO RESCUE: Start in Cargo bay with CODEX
  const [charPhysics, setCharPhysics] = useState<PhysicsState>({
    x: 3 * TILE,  // Cargo bay
    y: 11 * TILE - PLAYER.COLLIDER_SIZE - 2,   // Floor at y=11 (Cargo deck) - raised 2px to avoid ground collision
    vx: 0,
    vy: 0,
    gravity: "DOWN",
    grounded: true,
    width: PLAYER.COLLIDER_SIZE,
    height: PLAYER.COLLIDER_SIZE,
    jumpHeld: false,
  });
  const [charDir, setCharDir] = useState<"left" | "right">("right");
  const [charAnim, setCharAnim] = useState<"Idle" | "Run" | "Jump">("Idle");
  const [charFrame, setCharFrame] = useState(0);
  const [displayRotation, setDisplayRotation] = useState(0); // Animated rotation (degrees)
  
  // Codex physics state (AI - learns from JP)
  // CARGO RESCUE: Start in Cargo bay with JP
  const [codexPhysics, setCodexPhysics] = useState<PhysicsState>({
    x: 5 * TILE,  // Cargo bay, next to JP
    y: 11 * TILE - PLAYER.COLLIDER_SIZE - 2,   // Floor at y=11 (Cargo deck) - raised 2px to avoid ground collision
    vx: 0,
    vy: 0,
    gravity: "DOWN",
    grounded: true,
    width: PLAYER.COLLIDER_SIZE,
    height: PLAYER.COLLIDER_SIZE,
    jumpHeld: false,
  });
  const [codexDir, setCodexDir] = useState<"left" | "right">("left");
  const [codexAnim, setCodexAnim] = useState<"Idle" | "Run" | "Jump">("Idle");
  const [codexFrame, setCodexFrame] = useState(0);
  const [codexDisplayRotation, setCodexDisplayRotation] = useState(0); // Animated rotation (degrees)
  
  // AI input state (what the AI "wants" to do this frame)
  const codexInputRef = useRef<ScreenInput>({ up: false, down: false, left: false, right: false, jump: false });
  
  // Refs for the unified rAF loop / AI to access latest physics without stale closures.
  // Note: refs are synced from state via effects, but the rAF loop also writes to them.
  const codexPhysicsRef = useRef(codexPhysics);
  const charPhysicsRef = useRef(charPhysics);
  useEffect(() => { codexPhysicsRef.current = codexPhysics; }, [codexPhysics]);
  useEffect(() => { charPhysicsRef.current = charPhysics; }, [charPhysics]);
  
  // Path visualization (BFS path)
  const [codexPath, setCodexPath] = useState<PathStep[]>([]);
  const codexPathRef = useRef<PathStep[]>([]);
  useEffect(() => { codexPathRef.current = codexPath; }, [codexPath]);

  const [codexPathSegments, setCodexPathSegments] = useState<any[]>([]);
  const [showPaths, setShowPaths] = useState(true);
  
  // Physics-based pathfinding
  const [showPhysicsPaths, setShowPhysicsPaths] = useState(false);
  const [physicsTrajectories, setPhysicsTrajectories] = useState<JumpResult[]>([]);
  const [usePhysicsAI, setUsePhysicsAI] = useState(true); // Start with physics AI enabled

  // Refs for flags used inside the rAF loop (avoids restarting the loop on every render)
  const showPhysicsPathsRef = useRef(showPhysicsPaths);
  const usePhysicsAIRef = useRef(usePhysicsAI);
  useEffect(() => { showPhysicsPathsRef.current = showPhysicsPaths; }, [showPhysicsPaths]);
  useEffect(() => { usePhysicsAIRef.current = usePhysicsAI; }, [usePhysicsAI]);

  // Planned physics paths (for SVG visualization using JumpResult.trajectory)
  const [codexPhysicsPlan, setCodexPhysicsPlan] = useState<JumpResult[]>([]);
  const [nimPhysicsPlan, setNimPhysicsPlan] = useState<JumpResult[]>([]);

  const codexCurrentPathRef = useRef<JumpResult[]>([]); // Full planned path (execution)
  const codexPathProgressRef = useRef(0); // Which jump we're currently executing
  const lastPathCalcTimeRef = useRef(0); // Throttle recalculation
  
  // Nim target character (trapped on Bridge ceiling)
  // CARGO RESCUE: Nim is trapped on Bridge ceiling, waiting for rescue
  const [nimPhysics, setNimPhysics] = useState<PhysicsState>({
    x: 12 * TILE,  // Bridge center
    y: 2 * TILE - PLAYER.COLLIDER_SIZE,   // Ceiling level (y=2 is just below hull at y=1)
    vx: 0,
    vy: 0,
    gravity: "UP",  // Trapped on ceiling!
    grounded: true,
    width: PLAYER.COLLIDER_SIZE,
    height: PLAYER.COLLIDER_SIZE,
    jumpHeld: false,
  });
  const [nimDir, setNimDir] = useState<"left" | "right">("left");
  const [nimAnim, setNimAnim] = useState<"Idle" | "Run" | "Jump">("Idle");
  const [nimFrame, setNimFrame] = useState(0);
  const [nimDisplayRotation, setNimDisplayRotation] = useState(0);
  
  // Nim physics ref (used by rAF loop / AI without stale closures)
  const nimPhysicsRef = useRef(nimPhysics);
  useEffect(() => { nimPhysicsRef.current = nimPhysics; }, [nimPhysics]);
  
  // Recording mode
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false); // Ref for latest value in callbacks
  useEffect(() => { recordingRef.current = recording; }, [recording]);
  
  // Replay state
  const [isReplaying, setIsReplaying] = useState(false);
  const isReplayingRef = useRef(isReplaying);
  useEffect(() => { isReplayingRef.current = isReplaying; }, [isReplaying]);

  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [moveHistory, setMoveHistory] = useState<Array<{char: string, from: {x: number, y: number}, to: {x: number, y: number}, action: string, time: number}>>([]);
  const [gameMessage, setGameMessage] = useState<string>("");
  const recordingStartTime = useRef<number>(0);
  
  // Click-to-move destination
  const [jpDestination, setJpDestination] = useState<{x: number, y: number} | null>(null);
  const [jpPath, setJpPath] = useState<PathStep[]>([]);
  
  // Nim AI pathfinding (click to set destination)
  const [nimDestination, setNimDestination] = useState<{x: number, y: number} | null>(null);
  const nimDestinationRef = useRef<{x: number, y: number} | null>(null);
  const nimDestKeyRef = useRef<string | null>(null);
  const nimDebugTickRef = useRef(0);
  useEffect(() => { nimDestinationRef.current = nimDestination; }, [nimDestination]);

  const [nimPath, setNimPath] = useState<PathStep[]>([]);
  const nimCurrentPathRef = useRef<JumpResult[]>([]);
  const nimPathProgressRef = useRef(0);
  const nimLastPathCalcTimeRef = useRef(0);
  const nimInputRef = useRef<ScreenInput>({ up: false, down: false, left: false, right: false, jump: false });

  // Stabilize planning when the true destination is unreachable or equally-good subgoals exist.
  // Prevents Nim from oscillating (walk-left then walk-right forever).
  const nimPlanMetaRef = useRef<{
    destKey: string | null;
    bestKey: string | null;
    minDist: number;
    cost: number;
  }>({ destKey: null, bestKey: null, minDist: Infinity, cost: Infinity });

  // Prevent infinite "walk" loops where the plan says walk but physics blocks motion.
  const nimWalkStuckRef = useRef<{ count: number; lastCx: number; lastCy: number }>({
    count: 0,
    lastCx: 0,
    lastCy: 0,
  });
  
  // NEW: Frame-based executor (replays simulated trajectory directly)
  const nimExecutorRef = useRef<ExecutorState | null>(null);
  const nimUseExecutorRef = useRef<boolean>(true);  // Toggle between old/new system
  
  // FPS counter for debugging performance
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });
  
  // Nim baked sprites
  const [nimBaked, setNimBaked] = useState<BakedSprite | null>(null);
  
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
  
  // Pathfinding test results
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [showTestPanel, setShowTestPanel] = useState(false);
  
  // Visual test mode - runs tests on the ACTUAL Nim character
  const [visualTestMode, setVisualTestMode] = useState(false);
  const visualTestQueueRef = useRef<{input: ScreenInput; framesLeft: number; action: string}[]>([]);
  const visualTestIndexRef = useRef(0);
  
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
      setNimBaked(bakeIdentitySprites(spriteSheet, nim, faceSheet));
    }
    load();
  }, []);

  // Scroll handling
  // Keep viewX/viewY refs in sync so the rAF loop doesn't fight manual scrolling.
  const handleScroll = (dx: number, dy: number) => {
    setViewX(x => {
      const nx = Math.max(0, Math.min(SHIP_W - VIEW_W, x + dx));
      viewXRef.current = nx;
      return nx;
    });
    setViewY(y => {
      const ny = Math.max(0, Math.min(SHIP_H - VIEW_H, y + dy));
      viewYRef.current = ny;
      return ny;
    });
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
  
  // ============================================================
  // UNIFIED REQUESTANIMATIONFRAME GAME LOOP WITH FIXED TIMESTEP
  // ============================================================
  // Replaces the dual setInterval loops (16ms physics + 200ms AI)
  // with a single rAF loop using accumulator pattern for deterministic physics
  // 
  // FIXED TIMESTEP: Physics always runs at 60Hz (16.67ms steps)
  // AI: Runs every 12 frames (~200ms at 60fps)
  // CAMERA: Updated every frame for smooth interpolation
  useEffect(() => {
    // Fixed timestep configuration
    const FIXED_TIMESTEP = 1000 / 60; // ~16.67ms per physics step
    const MAX_ACCUMULATOR = 100; // Prevent spiral of death
    
    // AI runs every ~12 frames (200ms equivalent at 60fps)
    const AI_INTERVAL_FRAMES = 12;
    let frameCount = 0;
    
    // Accumulator for fixed timestep physics
    let accumulator = 0;
    let lastTime: number | null = null;
    let rafId: number;
    
    const gameLoop = (currentTime: number) => {
      // Initialize lastTime on first frame and skip processing
      // This prevents a large deltaTime on the second frame after React mount
      if (lastTime === null) {
        lastTime = currentTime;
        accumulator = 0; // Reset any accumulated time
        rafId = requestAnimationFrame(gameLoop);
        return;
      }
      
      // Calculate delta time and update accumulator
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      accumulator += deltaTime;
      
      // FPS tracking
      fpsRef.current.frames++;
      const fpsElapsed = currentTime - fpsRef.current.lastTime;
      if (fpsElapsed >= 1000) {
        setFps(Math.round(fpsRef.current.frames * 1000 / fpsElapsed));
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = currentTime;
      }
      
      // Clamp accumulator to prevent spiral of death on slow frames
      if (accumulator > MAX_ACCUMULATOR) {
        accumulator = MAX_ACCUMULATOR;
      }
      
      // Get player input once per frame
      const keys = keysRef.current;
      const input: ScreenInput = {
        up: keys.has("w"),
        down: keys.has("s"),
        left: keys.has("a"),
        right: keys.has("d"),
        jump: keys.has(" "),
      };
      
      // Read current physics state from refs (fresh each frame)
      let localCharPhysics = charPhysicsRef.current;
      let localCodexPhysics = codexPhysicsRef.current;
      let localNimPhysics = nimPhysicsRef.current;
      
      // ==========================================================
      // FIXED TIMESTEP PHYSICS: Step physics in discrete intervals
      // This ensures consistent, deterministic physics regardless of
      // frame rate fluctuations or display refresh rate
      // ==========================================================
      let physicsSteps = 0;
      while (accumulator >= FIXED_TIMESTEP) {
        // Store old positions for tile-change detection
        const oldCharX = Math.round(localCharPhysics.x / TILE);
        const oldCharY = Math.round(localCharPhysics.y / TILE);
        const oldCharGravity = localCharPhysics.gravity;
        
        // --- JP (Nimbus) Physics ---
        const newCharState = updatePhysics(localCharPhysics, input, shipGrid, SOLID_TILES);
        localCharPhysics = newCharState;
        charPhysicsRef.current = newCharState;
        
        // Recording: detect tile changes and record moves
        const newCharX = Math.round(newCharState.x / TILE);
        const newCharY = Math.round(newCharState.y / TILE);
        const charPosChanged = newCharX !== oldCharX || newCharY !== oldCharY;
        const charGravityChanged = newCharState.gravity !== oldCharGravity;
        
        if (recordingRef.current && (charPosChanged || charGravityChanged)) {
          let action: string;
          if (!localCharPhysics.grounded && newCharState.grounded && charPosChanged) action = "land";
          else if (localCharPhysics.grounded && !newCharState.grounded) action = "jump";
          else if (charGravityChanged) action = "wall-jump";
          else action = "walk";
          
          setMoveHistory(prev => {
            const lastMove = prev[prev.length - 1];
            if (lastMove && 
                lastMove.from.x === oldCharX && lastMove.from.y === oldCharY &&
                lastMove.to.x === newCharX && lastMove.to.y === newCharY &&
                lastMove.action === action) {
              return prev;
            }
            return [...prev, {
              char: "JP",
              from: { x: oldCharX, y: oldCharY },
              to: { x: newCharX, y: newCharY },
              action,
              time: Date.now() - recordingStartTime.current
            }];
          });
        }
        
        // --- Codex Physics (AI-driven) ---
        const newCodexState = updatePhysics(localCodexPhysics, codexInputRef.current, shipGrid, SOLID_TILES);
        localCodexPhysics = newCodexState;
        codexPhysicsRef.current = newCodexState;
        
        // --- Nim Physics (AI-driven when has destination, or VISUAL TEST) ---
        // Visual test mode overrides normal AI input
        if (visualTestQueueRef.current.length > 0) {
          const currentStep = visualTestQueueRef.current[0];
          nimInputRef.current = currentStep.input;
          currentStep.framesLeft--;
          
          // Move to next step when frames exhausted
          if (currentStep.framesLeft <= 0) {
            visualTestQueueRef.current.shift();
            visualTestIndexRef.current++;
            
            // Check if test complete
            if (visualTestQueueRef.current.length === 0) {
              setVisualTestMode(false);
              console.log("🎬 Visual test complete!");
            }
          }
        }
        
        // NEW: Frame-based executor (when active, replay trajectory directly)
        if (nimUseExecutorRef.current && nimExecutorRef.current && !isComplete(nimExecutorRef.current)) {
          const frame = stepExecutor(nimExecutorRef.current);
          if (frame) {
            localNimPhysics = {
              ...localNimPhysics,
              x: frame.x,
              y: frame.y,
              vx: frame.vx,
              vy: frame.vy,
              gravity: frame.gravity,
              grounded: frame.grounded,
            };
            nimPhysicsRef.current = localNimPhysics;
            
            // Early-stop check: if we've reached destination, stop executor
            const dest = nimDestinationRef.current;
            if (dest) {
              const centerX = frame.x + PLAYER.COLLIDER_SIZE / 2;
              const centerY = frame.y + PLAYER.COLLIDER_SIZE / 2;
              const destCenterX = dest.x * TILE + TILE / 2;
              const destCenterY = dest.y * TILE + TILE / 2;
              const dist = Math.sqrt(Math.pow(destCenterX - centerX, 2) + Math.pow(destCenterY - centerY, 2));
              
              if (dist < 4) {
                // Arrived at cell center (within 4px)! Stop executor, zero velocity, snap to destination
                nimExecutorRef.current = null;
                nimPhysicsRef.current.vx = 0;
                nimPhysicsRef.current.vy = 0;
                // Snap to destination cell center (adjusted for gravity)
                nimPhysicsRef.current.x = destCenterX - PLAYER.COLLIDER_SIZE / 2;
                nimPhysicsRef.current.y = destCenterY - PLAYER.COLLIDER_SIZE / 2;
                nimDestinationRef.current = null;
                // Note: setNimDestination will be called in AI tick
              }
            }
          }
        } else {
          // Fall back to physics-based input movement
          const newNimState = updatePhysics(localNimPhysics, nimInputRef.current, shipGrid, SOLID_TILES);
          localNimPhysics = newNimState;
          nimPhysicsRef.current = newNimState;
        }
        
        accumulator -= FIXED_TIMESTEP;
        physicsSteps++;
        frameCount++;
      }
      
      // ==========================================================
      // VISUAL STATE UPDATES (refs only — no React setState!)
      // Canvas reads these refs directly each frame
      // ==========================================================
      if (physicsSteps > 0) {
        // Update JP (Nimbus) visual state
        const charMoveRightVec = getMoveRightVector(localCharPhysics.gravity);
        const charLateralVel = localCharPhysics.vx * charMoveRightVec.x + localCharPhysics.vy * charMoveRightVec.y;
        if (charLateralVel > 0.3) charDirRef.current = "right";
        else if (charLateralVel < -0.3) charDirRef.current = "left";
        
        // Update Codex visual state
        const codexMoveRightVec = getMoveRightVector(localCodexPhysics.gravity);
        const codexLateralVel = localCodexPhysics.vx * codexMoveRightVec.x + localCodexPhysics.vy * codexMoveRightVec.y;
        if (codexLateralVel > 0.3) codexDirRef.current = "right";
        else if (codexLateralVel < -0.3) codexDirRef.current = "left";
        
        // Update Nim visual state
        const nimMoveRightVec = getMoveRightVector(localNimPhysics.gravity);
        const nimLateralVel = localNimPhysics.vx * nimMoveRightVec.x + localNimPhysics.vy * nimMoveRightVec.y;
        if (nimLateralVel > 0.3) nimDirRef.current = "right";
        else if (nimLateralVel < -0.3) nimDirRef.current = "left";
        
        // Update rotation targets
        charTargetRotationRef.current = getGravityRotation(localCharPhysics.gravity);
        codexTargetRotationRef.current = getGravityRotation(localCodexPhysics.gravity);
        nimTargetRotationRef.current = getGravityRotation(localNimPhysics.gravity);
      }
      
      // ==========================================================
      // ANIMATION & ROTATION (consolidated into rAF, no setIntervals)
      // ==========================================================
      // Sprite animation (every ~6 frames = ~100ms at 60fps)
      if (frameCount % 6 === 0 && sheetRef.current) {
        const advanceFrame = (animRef: { current: string }, frameRef: { current: number }) => {
          const tag = sheetRef.current!.tags.find((t: any) => t.name === animRef.current);
          if (tag) {
            const next = frameRef.current + 1;
            frameRef.current = next > tag.to ? tag.from : (frameRef.current < tag.from ? tag.from : next);
          }
        };
        
        // Determine anim state from physics
        const charIsMoving = Math.abs(localCharPhysics.vx) > 0.3 || Math.abs(localCharPhysics.vy) > 0.3;
        charAnimRef.current = !localCharPhysics.grounded ? "Jump" : charIsMoving ? "Run" : "Idle";
        
        const codexIsMoving = Math.abs(localCodexPhysics.vx) > 0.3 || Math.abs(localCodexPhysics.vy) > 0.3;
        codexAnimRef.current = !localCodexPhysics.grounded ? "Jump" : codexIsMoving ? "Run" : "Idle";
        
        const nimIsMoving = Math.abs(localNimPhysics.vx) > 0.3 || Math.abs(localNimPhysics.vy) > 0.3;
        nimAnimRef.current = !localNimPhysics.grounded ? "Jump" : nimIsMoving ? "Run" : "Idle";
        
        advanceFrame(charAnimRef, charFrameRef);
        advanceFrame(codexAnimRef, codexFrameRef);
        advanceFrame(nimAnimRef, nimFrameRef);
      }
      
      // Smooth rotation interpolation (every frame)
      const smoothRotation = (current: number, target: number): number => {
        const normalizedCurrent = ((current % 360) + 360) % 360;
        const normalizedTarget = ((target % 360) + 360) % 360;
        let diff = normalizedTarget - normalizedCurrent;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        if (Math.abs(diff) < 2) return normalizedTarget;
        const speed = Math.max(11, Math.abs(diff) * 0.3);
        const step = Math.sign(diff) * Math.min(speed, Math.abs(diff));
        return normalizedCurrent + step;
      };
      
      displayRotationRef.current = smoothRotation(displayRotationRef.current, charTargetRotationRef.current);
      codexDisplayRotationRef.current = smoothRotation(codexDisplayRotationRef.current, codexTargetRotationRef.current);
      nimDisplayRotationRef.current = smoothRotation(nimDisplayRotationRef.current, nimTargetRotationRef.current);
      
      // ==========================================================
      // SPRING CAMERA UPDATE (refs only — no setState!)
      // ==========================================================
      if (cameraEnabledRef.current) {
        const targetViewX = Math.max(0, Math.min(
          SHIP_W - VIEW_W, 
          localCharPhysics.x / TILE - VIEW_W / 2
        ));
        const targetViewY = Math.max(0, Math.min(
          SHIP_H - VIEW_H, 
          localCharPhysics.y / TILE - VIEW_H / 2
        ));
        
        // Spring physics: acceleration toward target, with damping
        const stiffness = 0.004;
        const damping = 0.82;
        
        cameraVelRef.current.x += (targetViewX - viewXRef.current) * stiffness;
        cameraVelRef.current.x *= damping;
        cameraVelRef.current.y += (targetViewY - viewYRef.current) * stiffness;
        cameraVelRef.current.y *= damping;
        
        viewXRef.current += cameraVelRef.current.x;
        viewYRef.current += cameraVelRef.current.y;
      }
      
      // ==========================================================
      // RENDER TO CANVAS (60fps smooth, no React re-renders)
      // ==========================================================
      renderGameCanvasRef.current();
      
      // Continue the loop
      rafId = requestAnimationFrame(gameLoop);
    };
    
    // Start the loop
    rafId = requestAnimationFrame(gameLoop);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []); // Empty deps — loop runs once, reads everything from refs
  
  // REMOVED: Old setInterval-based rotation and animation timers
  // All rotation interpolation and sprite animation is now handled
  // inside the rAF game loop (see animation & rotation section above)
  
  // Calculate physics-based path when CODEX is grounded and needs a new plan
  useEffect(() => {
    // Only recalculate when grounded
    if (!codexPhysics.grounded) return;
    
    const currentPlan = codexCurrentPathRef.current;
    const currentProgress = codexPathProgressRef.current;
    
    // Check if we need a new plan
    const needsNewPlan = currentPlan.length === 0 || currentProgress >= currentPlan.length;
    
    // Check if current plan is stale
    // Get the NEXT jump we should execute
    const nextJump = currentPlan[currentProgress];
    const codexTileX = Math.round(codexPhysics.x / TILE);
    const codexTileY = Math.round(codexPhysics.y / TILE);
    
    // Plan is stale if we moved >3 tiles from expected position or gravity changed
    const pathStale = nextJump && (
      Math.abs(codexTileX - nextJump.start.x) > 3 || 
      Math.abs(codexTileY - nextJump.start.y) > 3 ||
      codexPhysics.gravity !== nextJump.start.gravity
    );
    
    if (!needsNewPlan && !pathStale) return; // Keep current plan
    
    // Throttle recalculation to once per second
    const now = Date.now();
    if (now - lastPathCalcTimeRef.current < 1000) return;
    lastPathCalcTimeRef.current = now;
    
    // Calculate new path
    const nimTileX = Math.round(nimPhysics.x / TILE);
    const nimTileY = Math.round(nimPhysics.y / TILE);
    
    const reachable = calculateReachableCells(
      codexTileX,
      codexTileY,
      codexPhysics.gravity as any,
      shipGrid,
      SOLID_TILES as string[]
    );
    
    // Find best path to Nim
    let bestCell = null;
    let minDist = Infinity;
    
    for (const cell of reachable) {
      const dist = Math.abs(cell.x - nimTileX) + Math.abs(cell.y - nimTileY);
      if (dist < minDist) {
        minDist = dist;
        bestCell = cell;
      }
    }
    
    if (bestCell && bestCell.path.length > 0) {
      codexCurrentPathRef.current = bestCell.path;
      codexPathProgressRef.current = 0;
      
      // Build visualization
      const vizPath = bestCell.path.flatMap((jump: any): PathStep[] => {
        if (!jump.landing) return [];
        return [
          { node: { x: jump.start.x, y: jump.start.y, gravity: jump.start.gravity as GravityDir }, action: 'start' },
          { node: { x: jump.landing.x, y: jump.landing.y, gravity: jump.landing.gravity as GravityDir }, action: 'jump' }
        ];
      });
      setCodexPath(vizPath);
      // console.log("[AI] Plan:", bestCell.path.length, "jumps to Nim (", reachable.length, "reachable)");
    }
    
    // Also update trajectory visualization if enabled
    if (showPhysicsPaths) {
      const trajs = getJumpTrajectories(
        codexTileX,
        codexTileY,
        codexPhysics.gravity as any,
        shipGrid,
        SOLID_TILES
      );
      setPhysicsTrajectories(trajs);
    }
  }, [codexPhysics.grounded, codexPhysics.x, codexPhysics.y, codexPhysics.gravity, nimPhysics.x, nimPhysics.y, showPhysicsPaths]);

  // REMOVED: Nim rotation and Codex animation setIntervals
  // Now handled inside the rAF game loop
  
  // Codex AI - chase player using pathfinding
  const codexPathIndexRef = useRef(0);
  const lastPathTimeRef = useRef(0);
  const codexLastPosRef = useRef({ x: 0, y: 0 });
  const codexStuckCountRef = useRef(0);
  const codexBlockedTransitionsRef = useRef<Set<string>>(new Set());
  const codexSearchRef = useRef<IncrementalSearchState | null>(null);
  const codexSearchMetaRef = useRef<{ startKey: string; goalKey: string } | null>(null);
  
  useEffect(() => {
    const aiInterval = setInterval(() => {
      // Skip AI during replay
      if (isReplaying) return;
      
      // Read latest physics from refs (avoids stale closure)
      const codexPhysics = codexPhysicsRef.current;
      const charPhysics = charPhysicsRef.current;
      const nimPhysics = nimPhysicsRef.current;
      
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
          y: 5 * TILE - PLAYER.COLLIDER_SIZE,
          vx: 0,
          vy: 0,
          gravity: "DOWN",
          grounded: true,
          width: PLAYER.COLLIDER_SIZE,
          height: PLAYER.COLLIDER_SIZE,
          jumpHeld: false,
        });
        setCodexPath([]);
        codexPathIndexRef.current = 0;
        return; // Skip this frame
      }
      
      // --- Path search (incremental, budgeted per AI tick) ---
      // Get standing tile position - MUST account for current gravity!
      const getStandingTile = (physics: PhysicsState) => {
        const centerX = physics.x + physics.width / 2;
        const centerY = physics.y + physics.height / 2;

        switch (physics.gravity) {
          case "DOWN":
            return { x: Math.floor(centerX / TILE), y: Math.floor((physics.y + physics.height - 1) / TILE) };
          case "UP":
            return { x: Math.floor(centerX / TILE), y: Math.floor(physics.y / TILE) };
          case "LEFT":
            return { x: Math.floor(physics.x / TILE), y: Math.floor(centerY / TILE) };
          case "RIGHT":
            return { x: Math.floor((physics.x + physics.width - 1) / TILE), y: Math.floor(centerY / TILE) };
        }
      };

      const codexTile = getStandingTile(codexPhysics);
      const playerTile = getStandingTile(charPhysics); // For debug visualization
      // CARGO RESCUE: CODEX targets Nim (the pink character on Bridge ceiling)
      const targetTile = getStandingTile(nimPhysics);

      // Update debug visualization
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
          floorY: playerTile.y + nimbusFloor.dy,
        },
        codex: {
          ...codexTile,
          centerX: codexPhysics.x + codexPhysics.width / 2,
          centerY: codexPhysics.y + codexPhysics.height / 2,
          floorX: codexTile.x + codexFloor.dx,
          floorY: codexTile.y + codexFloor.dy,
        },
      });

      // Only search if CODEX is grounded and target is valid
      if (codexPhysics.grounded) {
        const startNode = { x: codexTile.x, y: codexTile.y, gravity: codexPhysics.gravity as GravityDir };
        // CARGO RESCUE: CODEX targets Nim (not JP)
        const goalNode = { x: targetTile.x, y: targetTile.y };

        const startKey = `${startNode.x},${startNode.y},${startNode.gravity}`;
        const goalKey = `${goalNode.x},${goalNode.y}`;

        // Use physics-based AI or BFS
        if (usePhysicsAI) {
          // Path is calculated in useEffect, just execute the current plan
          // No need to recalculate here - useEffect handles that
        } else {
          // BFS-based pathfinding
          // (Re)start incremental search when start/goal tile changes
          if (!codexSearchRef.current || !codexSearchMetaRef.current ||
              codexSearchMetaRef.current.startKey !== startKey ||
              codexSearchMetaRef.current.goalKey !== goalKey) {
            codexSearchRef.current = createIncrementalSearch(startNode, goalNode);
            codexSearchMetaRef.current = { startKey, goalKey };
          }

          // Spend a fixed budget each tick.
          const result = stepIncrementalSearch(
            codexSearchRef.current,
            shipGrid,
            SOLID_TILES as string[],
            movementMap,
            codexBlockedTransitionsRef.current,
            100
          );

          if (result.status === "found") {
            setCodexPath(result.path);
            setCodexPathSegments(result.segments);
            codexPathIndexRef.current = 1;
          } else if (result.status === "not_found") {
            setCodexPath([]);
            setCodexPathSegments([]);
            codexPathIndexRef.current = 0;
          }
        }
      }
      
      // AI decision: look at current path step and decide input
      const input: ScreenInput = { up: false, down: false, left: false, right: false, jump: false };
      
      // Calculate direct distance to target (Nim)
      const codexCenterX = codexPhysics.x + codexPhysics.width / 2;
      const codexCenterY = codexPhysics.y + codexPhysics.height / 2;
      const targetCenterX = nimPhysics.x + nimPhysics.width / 2;
      const targetCenterY = nimPhysics.y + nimPhysics.height / 2;
      const directDx = targetCenterX - codexCenterX;
      const directDy = targetCenterY - codexCenterY;
      const directDist = Math.sqrt(directDx * directDx + directDy * directDy);
      
      // Stop if very close to target
      const STOP_DISTANCE = TILE * 1.5;
      
      if (directDist <= STOP_DISTANCE && codexPath.length > 0) {
        codexPathIndexRef.current = codexPath.length;
      }
      
      // PHYSICS-BASED AI MODE: Execute pre-calculated jump trajectory
      const currentPlan = codexCurrentPathRef.current;
      const progress = codexPathProgressRef.current;
      const currentJumpIndex = Math.floor(progress);
      const isMidJump = progress % 1 !== 0; // Has decimal part = mid-jump
      const isWalking = progress % 1 === 0.25; // 0.25 = walking state
      
      if (usePhysicsAI && currentPlan.length > 0 && currentJumpIndex < currentPlan.length && directDist > STOP_DISTANCE) {
        const action = currentPlan[currentJumpIndex];
        const grav = codexPhysics.gravity;
        
        // Get target position for this action
        const targetX = action.landing?.x ?? action.start.x;
        const targetY = action.landing?.y ?? action.start.y;
        const targetPixelX = targetX * TILE + TILE / 2;
        const targetPixelY = targetY * TILE + TILE / 2;
        
        if (isMidJump && codexPhysics.grounded) {
          // For falls: if still grounded, keep walking to get off the edge
          if (action.action === "fall-left" || action.action === "fall-right") {
            const distToTarget = Math.abs(codexCenterX - targetPixelX) + Math.abs(codexCenterY - targetPixelY);
            if (distToTarget < TILE * 0.5) {
              // Reached target, advance
              codexPathProgressRef.current = currentJumpIndex + 1;
            } else {
              // Keep walking to get off the edge
              if (action.action === "fall-left") {
                if (grav === "LEFT") input.up = true;
                else if (grav === "RIGHT") input.down = true;
                else input.left = true;
              } else {
                if (grav === "LEFT") input.down = true;
                else if (grav === "RIGHT") input.up = true;
                else input.right = true;
              }
            }
          } else {
            // Just landed from a jump, advance to next action
            codexPathProgressRef.current = currentJumpIndex + 1;
          }
        } else if (isWalking) {
          // Continue walking until we reach the target
          const distToTarget = Math.abs(codexCenterX - targetPixelX) + Math.abs(codexCenterY - targetPixelY);
          if (distToTarget < TILE * 0.5) {
            // Close enough — advance to next step (no teleport snap)
            codexPathProgressRef.current = currentJumpIndex + 1;
          } else {
            // Continue walking in the same direction
            // NOTE: Physics already does gravity-relative conversion, so don't double-invert!
            // "walk-left" always means negative X in world space, "walk-right" means positive X
            if (action.action === "walk-left") {
              input.left = true;
            } else if (action.action === "walk-right") {
              input.right = true;
            }
          }
        } else if (!isMidJump && !isWalking && codexPhysics.grounded) {
          // Ready to execute next action
          
          // Handle walking actions
          // NOTE: For DOWN/UP gravity, physics handles conversion. For LEFT/RIGHT (walls), we need screen mapping.
          if (action.action === "walk-left") {
            if (grav === "LEFT") input.up = true;
            else if (grav === "RIGHT") input.down = true;
            else input.left = true; // DOWN and UP both use screen-left for world-left
            codexPathProgressRef.current = currentJumpIndex + 0.25;
          } else if (action.action === "walk-right") {
            if (grav === "LEFT") input.down = true;
            else if (grav === "RIGHT") input.up = true;
            else input.right = true; // DOWN and UP both use screen-right for world-right
            codexPathProgressRef.current = currentJumpIndex + 0.25;
          } else if (action.action === "jump-left") {
            if (grav === "LEFT") input.up = true;
            else if (grav === "RIGHT") input.down = true;
            else input.left = true;
            input.jump = true;
            codexPathProgressRef.current = currentJumpIndex + 0.5;
          } else if (action.action === "jump-right") {
            if (grav === "LEFT") input.down = true;
            else if (grav === "RIGHT") input.up = true;
            else input.right = true;
            input.jump = true;
            codexPathProgressRef.current = currentJumpIndex + 0.5;
          } else if (action.action === "fall-left") {
            if (grav === "LEFT") input.up = true;
            else if (grav === "RIGHT") input.down = true;
            else input.left = true;
            codexPathProgressRef.current = currentJumpIndex + 0.5;
          } else if (action.action === "fall-right") {
            // Walk off edge right, gravity does the rest (no jump)
            if (grav === "LEFT") input.down = true;
            else if (grav === "RIGHT") input.up = true;
            else input.right = true;
            codexPathProgressRef.current = currentJumpIndex + 0.5;
          } else {
            input.jump = true; // straight jump
            codexPathProgressRef.current = currentJumpIndex + 0.5;
          }
        }
        
      } else if (directDist > STOP_DISTANCE) {
        // BFS FALLBACK MODE
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
          
          if (targetStep.node.gravity !== codexPhysics.gravity && dist < TILE * 2) {
            needsGravityTransition = true;
          }
          
          if (dist < TILE / 2) {
            codexPathIndexRef.current++;
          }
        } else {
          targetX = targetCenterX;
          targetY = targetCenterY;
        }
        
        const dx = targetX - codexCenterX;
        const dy = targetY - codexCenterY;
        
        // Screen-relative walking
        if (codexPhysics.gravity === "DOWN" || codexPhysics.gravity === "UP") {
          if (dx > 4) input.right = true;
          else if (dx < -4) input.left = true;
        } else {
          if (dy > 4) input.down = true;
          else if (dy < -4) input.up = true;
        }
        
        // Stuck detection
        const lastPos = codexLastPosRef.current;
        const posDelta = Math.abs(codexPhysics.x - lastPos.x) + Math.abs(codexPhysics.y - lastPos.y);
        const isTryingToMove = input.left || input.right || input.up || input.down;
        
        if (isTryingToMove && posDelta < 1 && codexPhysics.grounded) {
          codexStuckCountRef.current++;
        } else {
          codexStuckCountRef.current = 0;
        }
        codexLastPosRef.current = { x: codexPhysics.x, y: codexPhysics.y };
        
        // Auto-jump if stuck or needs transition (legacy BFS mode only)
        const isStuck = codexStuckCountRef.current > 10;
        if ((shouldJump || isStuck || needsGravityTransition) && codexPhysics.grounded) {
          const nearEdge = codexPhysics.x < TILE * 2 || codexPhysics.x > (SHIP_W - 2) * TILE ||
                           codexPhysics.y < TILE * 2 || codexPhysics.y > (SHIP_H - 2) * TILE;
          if (!nearEdge) input.jump = true;
          // Debug logs only when recording
          if (recording) {
            if (isStuck) console.log("[AI] Stuck! Jumping");
            if (needsGravityTransition) console.log("[AI] Gravity transition");
          }
        }
      }
      
      // Apply AI input (CODEX DISABLED - focusing on Nim pathfinding)
      // codexInputRef.current = input;
      codexInputRef.current = { up: false, down: false, left: false, right: false, jump: false };
      
      // === NIM AI: Follow player-clicked destination ===
      const nimPhys = nimPhysicsRef.current;
      const nimCenterX = nimPhys.x + nimPhys.width / 2;
      const nimCenterY = nimPhys.y + nimPhys.height / 2;
      const nimInput: ScreenInput = { up: false, down: false, left: false, right: false, jump: false };
      
      const dest = nimDestinationRef.current;
      if (dest) {
        // NEW: Check if executor just completed
        if (nimUseExecutorRef.current && nimExecutorRef.current && isComplete(nimExecutorRef.current)) {
          const nimCenterX = nimPhys.x + nimPhys.width / 2;
          const nimCenterY = nimPhys.y + nimPhys.height / 2;
          const destCenterX = dest.x * TILE + TILE / 2;
          const destCenterY = dest.y * TILE + TILE / 2;
          const distToDest = Math.sqrt(Math.pow(destCenterX - nimCenterX, 2) + Math.pow(destCenterY - nimCenterY, 2));
          
          if (DEBUG_NIM) console.log(`[NimDBG] 🎬 EXECUTOR COMPLETE: dist to dest = ${distToDest.toFixed(1)}`);
          
          // Zero velocity to prevent coasting past destination
          nimPhysicsRef.current.vx = 0;
          nimPhysicsRef.current.vy = 0;
          
          if (distToDest < TILE * 2) {
            // Close enough - arrived! (increased threshold to 2 tiles)
            if (DEBUG_NIM) console.log("[NimDBG] ✅ ARRIVED at destination!");
            setNimDestination(null);
            nimDestinationRef.current = null;
            nimDestKeyRef.current = null;
            nimExecutorRef.current = null;
          } else {
            // Not at destination - clear executor to trigger replan
            nimExecutorRef.current = null;
          }
        }
        
        // Debug: log Nim AI state when PATHS is ON (throttled)
        nimDebugTickRef.current++;
        const nimDebug = DEBUG_NIM && showPathsRef.current && (nimDebugTickRef.current % 5 === 0);
        if (nimDebug) {
          console.log("[NimDBG] dest", dest, "grounded", nimPhys.grounded, "grav", nimPhys.gravity,
            "pathLen", nimCurrentPathRef.current.length,
            "progress", nimPathProgressRef.current.toFixed(2),
            "pos", { x: nimPhys.x.toFixed(1), y: nimPhys.y.toFixed(1), vx: nimPhys.vx.toFixed(2), vy: nimPhys.vy.toFixed(2) }
          );
        }
        const destKey = `${dest.x},${dest.y}`;
        if (nimDestKeyRef.current !== destKey) {
          // New destination clicked — force a fresh plan
          nimDestKeyRef.current = destKey;
          nimCurrentPathRef.current = [];
          nimPathProgressRef.current = 0;
          nimPlanMetaRef.current = { destKey, bestKey: null, minDist: Infinity, cost: Infinity };
        }
        // Only recalculate path if we have NO path (not while actively walking/jumping)
        const hasActivePath = nimCurrentPathRef.current.length > 0 && 
                             nimPathProgressRef.current < nimCurrentPathRef.current.length;
        const needsRecalc = !hasActivePath && nimPhys.grounded;
        
        if (needsRecalc) {
          if (nimDebug) console.log(`[NimDBG] RECALC: pathLen=${nimCurrentPathRef.current.length}, progress=${nimPathProgressRef.current}, grounded=${nimPhys.grounded}`);
          const nimTileX = Math.round(nimPhys.x / TILE);
          const nimTileY = Math.round(nimPhys.y / TILE);
          
          const reachable = calculateReachableCells(
            nimTileX,
            nimTileY,
            nimPhys.gravity as any,
            shipGrid,
            SOLID_TILES as string[]
          );
          
          // Find best path to destination (deterministic tie-break + stickiness).
          const keyOf = (c: any) => `${c.x},${c.y},${c.gravity}`;

          let bestCell: any = null;
          let bestKey: string | null = null;
          let minDist = Infinity;
          let bestCost = Infinity;
          let bestPathLen = Infinity;

          for (const cell of reachable) {
            const dist = Math.abs(cell.x - dest.x) + Math.abs(cell.y - dest.y);
            const cost = typeof cell.cost === "number" ? cell.cost : Infinity;
            const pathLen = Array.isArray(cell.path) ? cell.path.length : Infinity;
            const k = keyOf(cell);

            const better =
              dist < minDist ||
              (dist === minDist && cost < bestCost) ||
              (dist === minDist && cost === bestCost && pathLen < bestPathLen) ||
              (dist === minDist && cost === bestCost && pathLen === bestPathLen && (bestKey === null || k < bestKey));

            if (better) {
              bestCell = cell;
              bestKey = k;
              minDist = dist;
              bestCost = cost;
              bestPathLen = pathLen;
            }
          }

          const meta = nimPlanMetaRef.current;
          const sameDest = meta.destKey === destKey;

          // Only switch subgoals if the new one is strictly better.
          // Otherwise keep the previous bestKey if it's still reachable to prevent oscillation.
          const switchAllowed =
            !sameDest ||
            minDist < meta.minDist ||
            (minDist === meta.minDist && bestCost < meta.cost) ||
            (meta.bestKey === null);

          let chosenCell = bestCell;
          let chosenKey = bestKey;

          if (!switchAllowed && sameDest && meta.bestKey) {
            const stable = reachable.find((c: any) => keyOf(c) === meta.bestKey);
            if (stable) {
              chosenCell = stable;
              chosenKey = meta.bestKey;
              minDist = Math.abs(stable.x - dest.x) + Math.abs(stable.y - dest.y);
              bestCost = typeof stable.cost === "number" ? stable.cost : Infinity;
            }
          }

          if (chosenCell && chosenCell.path.length > 0) {
            nimCurrentPathRef.current = chosenCell.path;
            nimPathProgressRef.current = 0;
            nimPlanMetaRef.current = { destKey, bestKey: chosenKey, minDist, cost: bestCost };
            
            // NEW: Create frame-based executor for this path
            if (nimUseExecutorRef.current) {
              nimExecutorRef.current = createExecutor(chosenCell.path);
              if (DEBUG_NIM) console.log(`[NimDBG] 🎬 EXECUTOR CREATED: ${nimExecutorRef.current.frames.length} frames`);
            }
            
            // Enhanced path logging (debug only)
            if (DEBUG_NIM) {
              console.log("[NimDBG] NEW PATH PLANNED:");
              console.log(`  From tile: (${nimTileX}, ${nimTileY}) gravity=${nimPhys.gravity}`);
              console.log(`  To dest: (${dest.x}, ${dest.y})`);
              console.log(`  Path steps (${chosenCell.path.length}):`);
              for (let i = 0; i < chosenCell.path.length; i++) {
                const step = chosenCell.path[i];
                const landX = step.landing?.x ?? "null";
                const landY = step.landing?.y ?? "null";
                console.log(`    [${i}] ${step.action}: start=(${step.start.x},${step.start.y},${step.start.gravity}) → landing=(${landX},${landY})`);
              }
            }
            if (nimDebug) console.log("[NimDBG] planned", { actions: chosenCell.path.length, minDist, cost: bestCost, bestKey: chosenKey });
          } else {
            if (nimDebug) console.log("[NimDBG] noPlan", { reachable: reachable.length, minDist });
          }
        }
        
        // If we couldn't find a plan yet, fall back to direct steering so Nim always moves.
        // BUT skip if executor is active (it handles movement)
        const executorActive = nimUseExecutorRef.current && nimExecutorRef.current && !isComplete(nimExecutorRef.current);
        if (!executorActive && nimCurrentPathRef.current.length === 0) {
          const destCenterX = dest.x * TILE + TILE / 2;
          const destCenterY = dest.y * TILE + TILE / 2;
          const dx = destCenterX - nimCenterX;
          const dy = destCenterY - nimCenterY;
          const grav = nimPhys.gravity;
          // Use Euclidean distance, not Manhattan
          const distToDest = Math.sqrt(dx * dx + dy * dy);
          const closeEnough = distToDest < 4;  // Within 4px of center
          if (closeEnough) {
            // Already at destination - stop and clear
            setNimDestination(null);
            nimDestinationRef.current = null;
            nimDestKeyRef.current = null;
            nimExecutorRef.current = null;
            nimPhysicsRef.current.vx = 0;
            nimPhysicsRef.current.vy = 0;
          } else {
            // Move laterally (perpendicular to gravity) toward destination
            // Physics handles gravity inversion via getMoveRightVector.
            // Screen-left always means world-left (-X) regardless of gravity.
            if (grav === "DOWN" || grav === "UP") {
              if (dx > 2) nimInput.right = true;
              else if (dx < -2) nimInput.left = true;
            } else {
              // LEFT/RIGHT gravity: use up/down for lateral movement
              if (dy > 2) nimInput.down = true;
              else if (dy < -2) nimInput.up = true;
            }
          }
        }

        // Execute current path — merge consecutive walks into smooth movement
        // SKIP this old input-based executor if frame-based executor is active
        const useFrameExecutor = nimUseExecutorRef.current && nimExecutorRef.current && !isComplete(nimExecutorRef.current);
        if (!useFrameExecutor && nimCurrentPathRef.current.length > 0) {
          if (nimDebug) {
            const i = Math.floor(nimPathProgressRef.current);
            const a = nimCurrentPathRef.current[i];
            console.log("[NimDBG] exec", { index: i, pathLen: nimCurrentPathRef.current.length, progress: nimPathProgressRef.current.toFixed(2), grav: nimPhys.gravity, grounded: nimPhys.grounded, action: a?.action, lateral: (a as any)?.lateral, start: a?.start, landing: a?.landing });
          }
          const nimProgress = nimPathProgressRef.current;
          const nimJumpIndex = Math.floor(nimProgress);
          const nimIsMidJump = nimProgress % 1 === 0.5;

          // Safety: if progress points past the plan, clear it so we can replan next tick.
          if (nimJumpIndex >= nimCurrentPathRef.current.length) {
            nimCurrentPathRef.current = [];
            nimPathProgressRef.current = 0;
          } else {
            const nimAction = nimCurrentPathRef.current[nimJumpIndex];
            const nimGrav = nimPhys.gravity;
            
            // NOTE: Don’t invalidate the plan on “gravity mismatch” here.
            // In practice this was killing Nim’s plan execution and making her appear stuck.
            if (nimIsMidJump && nimPhys.grounded) {
              // Landed from jump — advance to next action
              nimPathProgressRef.current = nimJumpIndex + 1;
            } else if (nimPhys.grounded) {
              const isWalk = nimAction.action === "walk-left" || nimAction.action === "walk-right";
              
              if (isWalk) {
                // MERGE consecutive walks: find the LAST walk in the same direction
                let walkEndIndex = nimJumpIndex;
                const walkDir = nimAction.action;
                // Get the direction (left/right) from the action name
                const currentDir = walkDir.endsWith("-left") ? "left" : "right";
                
                while (walkEndIndex + 1 < nimCurrentPathRef.current.length) {
                  const nextAction = nimCurrentPathRef.current[walkEndIndex + 1];
                  // Only merge walks (not falls - falls need physics execution)
                  const nextIsWalk = nextAction.action === "walk-left" || nextAction.action === "walk-right";
                  const nextDir = nextAction.action.endsWith("-left") ? "left" : "right";
                  
                  if (nextIsWalk && nextDir === currentDir) {
                    walkEndIndex++;
                  } else {
                    break;
                  }
                }
                
                // DEBUG: Log merge results
                if (nimDebug) {
                  if (walkEndIndex !== nimJumpIndex) {
                    console.log(`[NimDBG] MERGED ${currentDir}: ${nimJumpIndex} → ${walkEndIndex} (${walkEndIndex - nimJumpIndex + 1} cells)`);
                  } else {
                    const pathActions = nimCurrentPathRef.current.map((a: any) => a.action).join(', ');
                    console.log(`[NimDBG] NO MERGE at ${nimJumpIndex}, dir=${currentDir}, path=[${pathActions}]`);
                  }
                }
                
                // Target is the FINAL cell of the merged walk
                const finalAction = nimCurrentPathRef.current[walkEndIndex];
                const finalTargetX = (finalAction.landing?.x ?? finalAction.start.x) * TILE + TILE / 2;
                const finalTargetY = (finalAction.landing?.y ?? finalAction.start.y) * TILE + TILE / 2;
                
                // Distance for walk completion should be measured along the lateral axis only
                // (walking is perpendicular to gravity).
                const distToFinal = Math.abs((finalTargetX - nimCenterX) * getMoveRightVector(nimGrav).x + (finalTargetY - nimCenterY) * getMoveRightVector(nimGrav).y);
                
                // Simple distance check - are we close enough to the merged walk target?
                // Use Euclidean distance, not directional delta (avoids gravity sign issues)
                const distToTarget = Math.sqrt(
                  Math.pow(finalTargetX - nimCenterX, 2) + 
                  Math.pow(finalTargetY - nimCenterY, 2)
                );
                
                // DEBUG: Always log walk state
                if (nimDebug) {
                  console.log(`[NimDBG] WALK CHECK: idx=${nimJumpIndex}, mergedEnd=${walkEndIndex}, dist=${distToTarget.toFixed(1)}, threshold=${(TILE * 0.4).toFixed(1)}, nimPos=(${nimCenterX.toFixed(0)},${nimCenterY.toFixed(0)}), target=(${finalTargetX.toFixed(0)},${finalTargetY.toFixed(0)})`);
                }
                
                if (distToTarget < TILE * 0.4) {
                  // DEBUG: Log completion trigger with full details
                  console.log(`[NimDBG] WALK SNAP: merged=${nimJumpIndex}→${walkEndIndex}`);
                  console.log(`  finalAction: ${JSON.stringify({ action: finalAction.action, start: finalAction.start, landing: finalAction.landing })}`);
                  console.log(`  finalTargetX=${finalTargetX}, finalTargetY=${finalTargetY} (TILE=${TILE})`);
                  console.log(`  Current pos: (${nimCenterX.toFixed(1)}, ${nimCenterY.toFixed(1)})`);
                  
                  // Reached or passed the end of the merged walk — skip all walked steps
                  // Zero velocity to prevent coasting/overshoot ping-pong
                  const moveRightForZero = getMoveRightVector(nimGrav);
                  const lateralVel = nimPhysicsRef.current.vx * moveRightForZero.x + nimPhysicsRef.current.vy * moveRightForZero.y;
                  nimPhysicsRef.current.vx -= moveRightForZero.x * lateralVel;
                  nimPhysicsRef.current.vy -= moveRightForZero.y * lateralVel;
                  
                  // Snap to target cell center
                  const nimPhys = nimPhysicsRef.current;
                  const newX = finalTargetX - nimPhys.width / 2;
                  const newY = finalTargetY - nimPhys.height / 2;
                  console.log(`  Snapping to: (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
                  nimPhysicsRef.current.x = newX;
                  nimPhysicsRef.current.y = newY;
                  // BOUNDARY FIX: Ensure position stays within world bounds
                  clampPhysicsToBounds(nimPhysicsRef.current);
                  
                  nimPathProgressRef.current = walkEndIndex + 1;
                } else {
                  // Keep walking/falling toward the final target.
                  // Convert walk direction to screen input based on gravity.
                  // NOTE: currentDir ("left"/"right") is from action name = GRAVITY-RELATIVE!
                  // For UP gravity: gravity-left (lateral<0) = world-right
                  const lateral = currentDir === "left" ? -1 : 1;
                  if (nimGrav === "LEFT") {
                    if (lateral < 0) nimInput.up = true;
                    else nimInput.down = true;
                  } else if (nimGrav === "RIGHT") {
                    if (lateral < 0) nimInput.down = true;
                    else nimInput.up = true;
                  } else if (nimGrav === "UP") {
                    // UP gravity: gravity-relative needs inversion for screen input
                    if (lateral < 0) nimInput.right = true;  // gravity-left → screen-right
                    else nimInput.left = true;               // gravity-right → screen-left
                  } else {
                    // DOWN gravity: direct mapping
                    if (lateral < 0) nimInput.left = true;
                    else nimInput.right = true;
                  }

                  // Stuck detection: if we're issuing walk but not moving, clear the plan so we can replan.
                  const stuck = nimWalkStuckRef.current;
                  const d = Math.abs(nimCenterX - stuck.lastCx) + Math.abs(nimCenterY - stuck.lastCy);
                  if (d < 0.5) stuck.count += 1;
                  else stuck.count = 0;
                  stuck.lastCx = nimCenterX;
                  stuck.lastCy = nimCenterY;

                  if (stuck.count >= 4) {
                    // If we're very close, snap to the intended end of this merged walk.
                    if (distToTarget < TILE * 0.9) {
                      const w = nimPhys.width;
                      const h = nimPhys.height;
                      nimPhysicsRef.current.x = finalTargetX - w / 2;
                      nimPhysicsRef.current.y = finalTargetY - h / 2;
                      nimPhysicsRef.current.vx = 0;
                      nimPhysicsRef.current.vy = 0;
                      // BOUNDARY FIX: Ensure position stays within world bounds
                      clampPhysicsToBounds(nimPhysicsRef.current);
                      nimPathProgressRef.current = walkEndIndex + 1;
                    } else {
                      if (nimDebug) console.log(`[NimDBG] STUCK CLEAR: distToTarget=${distToTarget.toFixed(1)}, clearing path`);
                      nimCurrentPathRef.current = [];
                      nimPathProgressRef.current = 0;
                    }
                    stuck.count = 0;
                  }
                }
              } else if (nimAction.action.startsWith("jump") || nimAction.action.startsWith("fall")) {
                // Reset walk stuck counter when we transition into a jump/fall
                nimWalkStuckRef.current.count = 0;
                
                // === WALK-TO-EDGE CHECK ===
                // For falls (and jumps), the planner expects us to start at action.start (the edge cell).
                // If we're not there yet, walk toward it first before executing the jump/fall.
                const startX = nimAction.start.x * TILE + TILE / 2;
                const startY = nimAction.start.y * TILE + TILE / 2;
                const distToStart = Math.sqrt(
                  Math.pow(startX - nimCenterX, 2) + 
                  Math.pow(startY - nimCenterY, 2)
                );
                
                const isFall = nimAction.action.startsWith("fall");
                const isAtEdge = distToStart < TILE * 0.6;
                
                if (nimDebug) {
                  console.log(`[NimDBG] ${nimAction.action}: distToStart=${distToStart.toFixed(1)}, isAtEdge=${isAtEdge}, start=(${nimAction.start.x},${nimAction.start.y}), nim=(${Math.floor(nimCenterX/TILE)},${Math.floor(nimCenterY/TILE)})`);
                }
                
                if (!isAtEdge) {
                  // Not at start position yet - walk there first
                  // Calculate lateral direction in world coordinates
                  const dx = startX - nimCenterX;
                  const walkDir = dx > 0 ? 1 : -1; // +1 = world-right, -1 = world-left
                  
                  // Convert to screen input based on gravity
                  // IMPORTANT: Physics already handles gravity inversion via getMoveRightVector.
                  // For DOWN gravity: moveRight = {x:+1}, so left input → negative lateral → -X (world-left)
                  // For UP gravity: moveRight = {x:-1}, so left input → positive lateral → also -X (world-left)
                  // The physics makes "screen-left always means world-left" regardless of gravity!
                  // So we do NOT need to invert inputs here - just map directly.
                  if (nimGrav === "DOWN" || nimGrav === "UP") {
                    // Horizontal gravity: use left/right directly
                    if (walkDir > 0) nimInput.right = true;
                    else nimInput.left = true;
                  } else if (nimGrav === "LEFT") {
                    // LEFT gravity: lateral = vertical screen axis, down = +Y = world-right
                    if (walkDir > 0) nimInput.down = true;
                    else nimInput.up = true;
                  } else { // RIGHT
                    // RIGHT gravity: lateral = vertical screen axis, up = -Y = world-right
                    if (walkDir > 0) nimInput.up = true;
                    else nimInput.down = true;
                  }
                  
                  if (nimDebug) {
                    console.log(`[NimDBG] Walking to edge: dx=${dx.toFixed(1)}, walkDir=${walkDir}, grav=${nimGrav}`);
                  }
                  // Don't advance progress - still walking to start position
                } else {
                  // At start position - proceed with jump/fall execution
                  
                  // Zero out lateral velocity before jumping so arc matches simulation
                  // (simulation assumes zero starting lateral speed)
                  const moveRight = getMoveRightVector(nimGrav);
                  const lateralVel = nimPhysicsRef.current.vx * moveRight.x + nimPhysicsRef.current.vy * moveRight.y;
                  nimPhysicsRef.current.vx -= moveRight.x * lateralVel;
                  nimPhysicsRef.current.vy -= moveRight.y * lateralVel;

                  // ANALOG EXECUTION: use the exact lateral axis value chosen by the planner.
                  // This makes the executed jump match the simulated yellow arc.
                  // (Value is gravity-relative: -1..+1 along moveRightVec.)
                  const lateral = typeof nimAction.lateral === "number" ? nimAction.lateral : 0;
                  
                  // Convert lateral to screen input based on gravity.
                  // NOTE: 'lateral' is GRAVITY-RELATIVE (from planner simulation), not world coords!
                  // For UP gravity: gravity-right (lateral>0) = world-left, so we need screen-left
                  // to produce gravity-right intent via physics conversion chain.
                  if (nimGrav === "LEFT") {
                    if (lateral < 0) nimInput.up = true;
                    else if (lateral > 0) nimInput.down = true;
                  } else if (nimGrav === "RIGHT") {
                    if (lateral < 0) nimInput.down = true;
                    else if (lateral > 0) nimInput.up = true;
                  } else if (nimGrav === "UP") {
                    // UP gravity: lateral is gravity-relative, physics inverts screen input
                    // gravity-right (lateral>0) needs screen-left to become gravity-right
                    if (lateral < 0) nimInput.right = true;  // gravity-left → screen-right
                    else if (lateral > 0) nimInput.left = true; // gravity-right → screen-left
                  } else {
                    // DOWN gravity: direct mapping (gravity-relative = screen-relative)
                    if (lateral < 0) nimInput.left = true;
                    else if (lateral > 0) nimInput.right = true;
                  }

                  // Jumps need jump button; falls just walk off edge (no jump impulse)
                  if (nimAction.action.startsWith("jump")) {
                    nimInput.jump = true;
                  }
                  // For falls, lateral input alone will walk character off edge
                  
                  if (nimDebug) {
                    console.log(`[NimDBG] Executing ${nimAction.action}: lateral=${lateral}, jump=${nimInput.jump}`);
                  }
                  
                  nimPathProgressRef.current = nimJumpIndex + 0.5;
                }
              }
            }
          }
        }
      }
      
      // Always apply input (empty = stop moving)
      // BUT skip if visual test mode is active (visual test controls Nim directly)
      if (visualTestQueueRef.current.length > 0) {
        return; // Visual test mode active - skip AI input
      }
      if (DEBUG_NIM && dest && showPathsRef.current && (nimDebugTickRef.current % 5 === 0)) {
        console.log("[NimDBG] input", nimInput);
      }
      nimInputRef.current = nimInput;
      
    }, 200); // AI runs at 5Hz (was 20Hz) for performance
    
    return () => {
      clearInterval(aiInterval);
      // Clear Nim input on cleanup so she doesn't keep drifting
      nimInputRef.current = { up: false, down: false, left: false, right: false, jump: false };
    };
  }, [isReplaying]); // Stable interval; reads destination via nimDestinationRef
  
  // REMOVED: Old individual canvas drawing for Nimbus and Codex
  // Characters now render via the single game canvas in renderGameCanvas()

  // Calculate character positions relative to viewport
  // Sprite is 48×48, collision is 32×44
  // We need to align sprite "feet" with collision "floor edge" for each gravity
  // The offset changes based on gravity orientation since collision box doesn't rotate
  
  // Offset from collision top-left to where 48×48 sprite should be drawn
  // to align the visual feet with collision floor-side
  const getSpriteOffset = (gravity: GravityDirection): { x: number; y: number } => {
    const spriteW = 48, spriteH = 48;
    const collW = PLAYER.COLLIDER_SIZE;
    const collH = PLAYER.COLLIDER_SIZE;
    const extraW = (spriteW - collW) / 2;

    switch (gravity) {
      case "DOWN":  // Feet at bottom - align sprite bottom with collision bottom
        return { x: -extraW, y: -(spriteH - collH) };
      case "UP":    // Feet at top - align sprite top with collision top
        return { x: -extraW, y: 0 };
      case "LEFT":  // Feet at left - align sprite left with collision left
        return { x: 0, y: -extraW };
      case "RIGHT": // Feet at right - align sprite right with collision right
        return { x: -(spriteW - collW), y: -extraW };
    }
  };
  
  // REMOVED: Old DOM-based character screen position calculations
  // Characters now render via game canvas using refs directly

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

  // ============================================================
  // CANVAS RENDER FUNCTION - Draws game world directly to canvas
  // This runs at 60fps via requestAnimationFrame, NO React setState
  // ============================================================
  // Ref to always hold latest render function (avoids stale closure in rAF)
  const renderGameCanvasRef = useRef<() => void>(() => {});
  
  const renderGameCanvas = useCallback(() => {
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Pixel-perfect rendering (no anti-aliasing)
    ctx.imageSmoothingEnabled = false;
    
    // Clear canvas
    ctx.fillStyle = COLORS.space;
    ctx.fillRect(0, 0, VIEW_W * TILE, VIEW_H * TILE);
    
    // Calculate viewport offset - snap to integer pixels (no sub-pixel rendering)
    const offsetX = Math.round(-(viewXRef.current % 1) * TILE);
    const offsetY = Math.round(-(viewYRef.current % 1) * TILE);
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    // Get visible tile range
    const startTileX = Math.floor(viewXRef.current);
    const startTileY = Math.floor(viewYRef.current);
    const endTileX = Math.min(startTileX + VIEW_W + 1, SHIP_W);
    const endTileY = Math.min(startTileY + VIEW_H + 1, SHIP_H);
    
    // Draw tiles
    for (let ty = startTileY; ty < endTileY; ty++) {
      for (let tx = startTileX; tx < endTileX; tx++) {
        if (ty >= 0 && ty < SHIP_H && tx >= 0 && tx < SHIP_W) {
          const cell = shipGrid[ty][tx];
          const screenX = (tx - startTileX) * TILE;
          const screenY = (ty - startTileY) * TILE;
          
          ctx.fillStyle = COLORS[cell as keyof typeof COLORS];
          ctx.fillRect(screenX, screenY, TILE, TILE);
          
          // Draw grid overlay if enabled
          if (showGrid) {
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.strokeRect(screenX, screenY, TILE, TILE);
          }
        }
      }
    }
    
    // Draw room labels
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const room of visibleRooms) {
      const labelX = (room.x - startTileX + room.w / 2) * TILE;
      const labelY = (room.y - startTileY + room.h / 2) * TILE;
      if (labelX >= -TILE && labelX <= (VIEW_W + 1) * TILE &&
          labelY >= -TILE && labelY <= (VIEW_H + 1) * TILE) {
        ctx.fillStyle = room.type === "shaft" ? "#66ffff" : "#0f0";
        ctx.fillText(room.name.toUpperCase(), labelX, labelY);
      }
    }
    
    // Draw paths if enabled
    if (showPathsRef.current && codexPathRef.current.length > 1) {
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      for (let i = 0; i < codexPathRef.current.length; i++) {
        const step = codexPathRef.current[i];
        const px = (step.node.x - startTileX) * TILE + TILE / 2;
        const py = (step.node.y - startTileY) * TILE + TILE / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw path nodes
      for (let i = 0; i < codexPathRef.current.length; i++) {
        const step = codexPathRef.current[i];
        const px = (step.node.x - startTileX) * TILE + TILE / 2;
        const py = (step.node.y - startTileY) * TILE + TILE / 2;
        ctx.beginPath();
        ctx.arc(px, py, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = step.action.startsWith("jump") ? "#ff6b6b" : step.action.startsWith("fall") ? "#fbbf24" : "#fb923c";
        ctx.fill();
      }
    }
    
    // Draw physics trajectories if enabled
    if (showPhysicsPathsRef.current && physicsTrajectoriesRef.current.length > 0) {
      ctx.strokeStyle = "#0f0";
      ctx.lineWidth = 2;
      for (const traj of physicsTrajectoriesRef.current) {
        if (traj.trajectory.length > 1) {
          ctx.beginPath();
          for (let i = 0; i < traj.trajectory.length; i++) {
            const point = traj.trajectory[i];
            const px = point.x - startTileX * TILE;
            const py = point.y - startTileY * TILE;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        // Draw landing marker
        if (traj.landing) {
          const lx = traj.landing.x * TILE + TILE / 2 - startTileX * TILE;
          const ly = traj.landing.y * TILE + TILE / 2 - startTileY * TILE;
          ctx.beginPath();
          ctx.arc(lx, ly, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#0f0";
          ctx.fill();
        }
      }
    }
    
    // Draw Nim's jump arcs when PHYS is ON
    if (showPhysicsPathsRef.current) {
      const nimTileX = Math.round(nimPhysicsRef.current.x / TILE);
      const nimTileY = Math.round(nimPhysicsRef.current.y / TILE);
      const nimTrajs = getJumpTrajectories(
        nimTileX,
        nimTileY,
        nimPhysicsRef.current.gravity as any,
        shipGrid,
        SOLID_TILES
      );
      
      // Draw all possible arcs in pink
      ctx.strokeStyle = "#ff00aa";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      for (const traj of nimTrajs) {
        if (traj.trajectory.length > 1) {
          ctx.beginPath();
          for (let i = 0; i < traj.trajectory.length; i++) {
            const point = traj.trajectory[i];
            const px = point.x - startTileX * TILE;
            const py = point.y - startTileY * TILE;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1.0;
      
      // Draw the SELECTED jump from Nim's current path in bright yellow
      if (nimCurrentPathRef.current.length > 0) {
        const nimProgress = nimPathProgressRef.current;
        const nimJumpIndex = Math.floor(nimProgress);
        if (nimJumpIndex < nimCurrentPathRef.current.length) {
          const selectedAction = nimCurrentPathRef.current[nimJumpIndex];
          if (selectedAction.trajectory && selectedAction.trajectory.length > 1) {
            ctx.strokeStyle = "#ffff00";
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < selectedAction.trajectory.length; i++) {
              const point = selectedAction.trajectory[i];
              const px = point.x - startTileX * TILE;
              const py = point.y - startTileY * TILE;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();
            
            // Yellow landing marker
            if (selectedAction.landing) {
              const lx = selectedAction.landing.x * TILE + TILE / 2 - startTileX * TILE;
              const ly = selectedAction.landing.y * TILE + TILE / 2 - startTileY * TILE;
              ctx.beginPath();
              ctx.arc(lx, ly, 6, 0, Math.PI * 2);
              ctx.fillStyle = "#ffff00";
              ctx.fill();
            }
          }
        }
      }
    }
    
    // Draw debug tiles if enabled
    if (showPathsRef.current && debugTilesRef.current) {
      const { nimbus: nimbusDebug, codex: codexDebug } = debugTilesRef.current;
      if (nimbusDebug) {
        const dx = (nimbusDebug.x - startTileX) * TILE;
        const dy = (nimbusDebug.y - startTileY) * TILE;
        ctx.strokeStyle = "#4ade80";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(dx, dy, TILE, TILE);
        ctx.setLineDash([]);
        ctx.strokeRect(nimbusDebug.floorX * TILE - startTileX * TILE + 4, 
                       nimbusDebug.floorY * TILE - startTileY * TILE + 4, 
                       TILE - 8, TILE - 8);
      }
      if (codexDebug) {
        const dx = (codexDebug.x - startTileX) * TILE;
        const dy = (codexDebug.y - startTileY) * TILE;
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(dx, dy, TILE, TILE);
        ctx.setLineDash([]);
        ctx.strokeRect(codexDebug.floorX * TILE - startTileX * TILE + 4, 
                       codexDebug.floorY * TILE - startTileY * TILE + 4, 
                       TILE - 8, TILE - 8);
      }
    }
    
    // Draw characters
    const drawCharacter = (
      physics: PhysicsState, 
      baked: BakedSprite | null, 
      frame: number,
      dir: "left" | "right",
      rotation: number,
      tint: string
    ) => {
      const spriteOffset = getSpriteOffset(physics.gravity);
      const screenX = Math.round(physics.x - startTileX * TILE + spriteOffset.x);
      const screenY = Math.round(physics.y - startTileY * TILE + spriteOffset.y);
      
      // Cull if off-screen
      if (screenX < -48 || screenX > VIEW_W * TILE ||
          screenY < -48 || screenY > VIEW_H * TILE) return;
      
      ctx.save();
      ctx.translate(screenX + 24, screenY + 24);
      ctx.rotate(rotation * Math.PI / 180);
      if (dir === "left") ctx.scale(-1, 1);
      
      if (baked) {
        ctx.drawImage(
          baked.canvas,
          frame * 48, 0, 48, 48,
          -24, -24, 48, 48
        );
      } else {
        // Fallback: draw colored rectangle while sprites load
        ctx.fillStyle = tint;
        ctx.fillRect(-12, -12, 24, 24);
      }
      ctx.restore();
    };
    
    // Draw JP (Nimbus)
    drawCharacter(
      charPhysicsRef.current, 
      nimbusBaked, 
      charFrameRef.current,
      charDirRef.current,
      displayRotationRef.current,
      "#4ade80"
    );
    
    // Draw Codex
    drawCharacter(
      codexPhysicsRef.current,
      codexBaked,
      codexFrameRef.current,
      codexDirRef.current,
      codexDisplayRotationRef.current,
      "#fb923c"
    );
    
    // Draw Nim
    drawCharacter(
      nimPhysicsRef.current,
      nimBaked,
      nimFrameRef.current,
      nimDirRef.current,
      nimDisplayRotationRef.current,
      "#ff00aa"
    );
    
    // Draw Nim destination marker
    if (nimDestinationRef.current) {
      const destX = (nimDestinationRef.current.x - startTileX) * TILE;
      const destY = (nimDestinationRef.current.y - startTileY) * TILE;
      ctx.strokeStyle = "#ff00aa";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(destX, destY, TILE, TILE);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 0, 170, 0.15)";
      ctx.fillRect(destX, destY, TILE, TILE);
      // Label
      ctx.fillStyle = "#ff00aa";
      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillText("DEST", destX, destY - 4);
    }
    
    // Draw Nim planned path
    if (nimCurrentPathRef.current.length > 0) {
      ctx.strokeStyle = "#ff00aa";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      const nimStartX = nimPhysicsRef.current.x + nimPhysicsRef.current.width / 2 - startTileX * TILE;
      const nimStartY = nimPhysicsRef.current.y + nimPhysicsRef.current.height / 2 - startTileY * TILE;
      ctx.moveTo(nimStartX, nimStartY);
      for (const step of nimCurrentPathRef.current) {
        if (step.landing) {
          const px = (step.landing.x + 0.5) * TILE - startTileX * TILE;
          const py = (step.landing.y + 0.5) * TILE - startTileY * TILE;
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }
    
    ctx.restore();
  }, [nimbusBaked, codexBaked, nimBaked, visibleRooms, shipGrid]);
  
  // Keep ref in sync so rAF loop always calls the latest version
  renderGameCanvasRef.current = renderGameCanvas;
  
  // Debug: log when sprites are loaded
  useEffect(() => {
    if (nimbusBaked && codexBaked && nimBaked) {
      // Sprites loaded - debug log disabled for performance
      // console.log("[Canvas] All sprites loaded!", {
      //   nimbus: nimbusBaked.canvas.width,
      //   codex: codexBaked.canvas.width,
      //   nim: nimBaked.canvas.width,
      // });
    }
  }, [nimbusBaked, codexBaked, nimBaked]);

  // Canvas render refs - read by renderGameCanvas() and rAF loop each frame
  // These are the ONLY source of truth for visual state (no React state)
  const charFrameRef = useRef(0);
  const charDirRef = useRef<"left" | "right">("right");
  const charAnimRef = useRef<"Idle" | "Run" | "Jump">("Idle");
  const displayRotationRef = useRef(0);
  const charTargetRotationRef = useRef(0);
  const codexFrameRef = useRef(0);
  const codexDirRef = useRef<"left" | "right">("left");
  const codexAnimRef = useRef<"Idle" | "Run" | "Jump">("Idle");
  const codexDisplayRotationRef = useRef(0);
  const codexTargetRotationRef = useRef(0);
  const nimFrameRef = useRef(0);
  const nimDirRef = useRef<"left" | "right">("left");
  const nimAnimRef = useRef<"Idle" | "Run" | "Jump">("Idle");
  const nimDisplayRotationRef = useRef(0);
  const nimTargetRotationRef = useRef(180); // Nim starts with UP gravity = 180deg
  const showPathsRef = useRef(true);
  const physicsTrajectoriesRef = useRef<JumpResult[]>([]);
  const debugTilesRef = useRef<{
    nimbus: { x: number; y: number; centerX: number; centerY: number; floorX: number; floorY: number } | null;
    codex: { x: number; y: number; centerX: number; centerY: number; floorX: number; floorY: number } | null;
  }>({ nimbus: null, codex: null });
  
  // Sprite sheet ref for rAF loop (avoid stale closure)
  const sheetRef = useRef<SpriteSheet | null>(null);
  useEffect(() => { sheetRef.current = sheet; }, [sheet]);
  
  // Sync UI toggle refs
  useEffect(() => { showPathsRef.current = showPaths; }, [showPaths]);

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
      <div style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
        <span style={{
          padding: "4px 8px",
          background: fps < 30 ? "#f00" : fps < 55 ? "#ff0" : "#0f0",
          color: "#000",
          fontFamily: "monospace",
          fontWeight: "bold",
        }}>
          {fps} FPS
        </span>
        <button
          onClick={() => setShowPhysicsPaths(p => !p)}
          style={{
            padding: "4px 8px",
            background: showPhysicsPaths ? "#0f0" : "#333",
            color: showPhysicsPaths ? "#000" : "#0f0",
            border: "1px solid #0f0",
            cursor: "pointer",
          }}
        >
          PHYS {showPhysicsPaths ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => setUsePhysicsAI(p => !p)}
          style={{
            padding: "4px 8px",
            background: usePhysicsAI ? "#f0f" : "#333",
            color: usePhysicsAI ? "#000" : "#f0f",
            border: "1px solid #f0f",
            cursor: "pointer",
          }}
        >
          AI: {usePhysicsAI ? "PHYS" : "BFS"}
        </button>
        <button
          onClick={() => {
            if (recording) {
              setRecording(false);
              setGameMessage("⏹️ Recording stopped");
            } else {
              setRecording(true);
              setMoveHistory([]);
              recordingStartTime.current = Date.now();
              setGameMessage("🔴 RECORDING - Move JP to catch Nim!");
            }
          }}
          style={{
            padding: "4px 8px",
            background: recording ? "#f00" : "#333",
            color: recording ? "#fff" : "#f00",
            border: "1px solid #f00",
            cursor: "pointer",
          }}
        >
          {recording ? "⏹️ STOP" : "🔴 RECORD"}
        </button>
        <button
          onClick={() => {
            // Cancel any existing replay
            if (replayIntervalRef.current) {
              clearInterval(replayIntervalRef.current);
              replayIntervalRef.current = null;
            }
            
            if (isReplaying) {
              setIsReplaying(false);
              setGameMessage("⏹️ Replay stopped");
              return;
            }
            
            // Replay: Make CODEX follow recorded path
            if (moveHistory.length === 0) {
              setGameMessage("⚠️ No moves recorded yet!");
              return;
            }
            
            // Reset CODEX to start position
            const firstMove = moveHistory[0];
            setCodexPhysics({
              x: firstMove.from.x * TILE,
              y: firstMove.from.y * TILE - PLAYER.COLLIDER_SIZE,
              vx: 0, vy: 0, gravity: "DOWN", grounded: true,
              width: PLAYER.COLLIDER_SIZE, height: PLAYER.COLLIDER_SIZE, jumpHeld: false
            });
            
            // Replay each move
            setIsReplaying(true);
            setGameMessage("▶️ REPLAYING JP's path...");
            let moveIndex = 0;
            
            // Replay with smooth interpolation
            const STEPS_PER_MOVE = 5; // Interpolate each move into 5 steps
            const STEP_DURATION = 30; // 30ms per step = 150ms total per move
            let stepIndex = 0;
            
            replayIntervalRef.current = setInterval(() => {
              if (moveIndex >= moveHistory.length) {
                clearInterval(replayIntervalRef.current!);
                replayIntervalRef.current = null;
                setIsReplaying(false);
                setGameMessage("✅ Replay complete!");
                return;
              }
              
              const move = moveHistory[moveIndex];
              const progress = stepIndex / STEPS_PER_MOVE;
              
              // Linear interpolation between from and to
              const interpX = move.from.x + (move.to.x - move.from.x) * progress;
              const interpY = move.from.y + (move.to.y - move.from.y) * progress;
              
              setCodexPhysics(prev => ({
                ...prev,
                x: interpX * TILE,
                y: interpY * TILE - PLAYER.COLLIDER_SIZE,
                gravity: "DOWN", 
                grounded: progress > 0.8 || move.action !== "jump", // Show jump mid-air
              }));
              
              stepIndex++;
              if (stepIndex >= STEPS_PER_MOVE) {
                stepIndex = 0;
                moveIndex++;
              }
            }, STEP_DURATION);
          }}
          style={{
            padding: "4px 8px",
            background: isReplaying ? "#f00" : moveHistory.length > 0 ? "#0f0" : "#333",
            color: isReplaying || moveHistory.length > 0 ? "#000" : "#0f0",
            border: "1px solid #0f0",
            cursor: moveHistory.length > 0 ? "pointer" : "not-allowed",
          }}
          disabled={moveHistory.length === 0 && !isReplaying}
        >
          {isReplaying ? "⏹️ STOP" : `▶️ REPLAY (${moveHistory.length})`}
        </button>
        <button
          onClick={() => {
            setNimDestination(null);
            nimCurrentPathRef.current = [];
          }}
          style={{
            padding: "4px 8px",
            background: nimDestination ? "#f0f" : "#333",
            color: nimDestination ? "#000" : "#f0f",
            border: "1px solid #f0f",
            cursor: "pointer",
          }}
        >
          {nimDestination ? `Nim → (${nimDestination.x},${nimDestination.y})` : "Click to set Nim DEST"}
        </button>
        <button
          onClick={() => {
            console.log("Running pathfinding tests...");
            const results = runAllTests(shipGrid, SOLID_TILES);
            setTestResults(results);
            setShowTestPanel(true);
            results.forEach(r => console.log(formatTestResult(r)));
          }}
          style={{
            padding: "4px 8px",
            background: testResults.length > 0 && testResults.every(r => r.success) ? "#0f0" : 
                        testResults.length > 0 ? "#f00" : "#333",
            color: testResults.length > 0 ? "#000" : "#ff0",
            border: "1px solid #ff0",
            cursor: "pointer",
          }}
        >
          🧪 RUN TESTS
        </button>
        <button
          onClick={() => {
            console.log("=== LIVE TEST: Pink Nim → (9,9) ===");
            
            // 1. Reset Nim to spawn position
            const spawnX = 12 * TILE;
            const spawnY = 2 * TILE - PLAYER.COLLIDER_SIZE;
            nimPhysicsRef.current = {
              ...nimPhysicsRef.current,
              x: spawnX,
              y: spawnY,
              vx: 0,
              vy: 0,
              gravity: "UP",
              grounded: true,
            };
            console.log(`[LIVE TEST] Reset Nim to spawn: (${spawnX}, ${spawnY}) gravity=UP`);
            
            // 2. Clear any existing path and executor
            nimCurrentPathRef.current = [];
            nimPathProgressRef.current = 0;
            nimDestKeyRef.current = null;
            nimExecutorRef.current = null;  // Clear old executor
            nimInputRef.current = { up: false, down: false, left: false, right: false, jump: false };
            
            // Ensure executor is enabled for this test
            nimUseExecutorRef.current = true;
            console.log("[LIVE TEST] 🎬 Frame-based executor ENABLED");
            
            // 3. Set destination to (9, 9)
            const destX = 9;
            const destY = 9;
            nimDestinationRef.current = { x: destX, y: destY };
            setNimDestination({ x: destX, y: destY });
            console.log(`[LIVE TEST] Set destination: tile (${destX}, ${destY})`);
            
            // Also run the console test for comparison
            console.log("\n--- Console simulation for reference: ---");
            runPinkNimTest(shipGrid, SOLID_TILES);
          }}
          style={{
            padding: "4px 8px",
            background: "#333",
            color: "#f0f",
            border: "1px solid #f0f",
            cursor: "pointer",
          }}
        >
          🔬 NIM→9,9
        </button>
        <button
          onClick={() => {
            if (visualTestMode) {
              // Stop current test
              visualTestQueueRef.current = [];
              setVisualTestMode(false);
              nimInputRef.current = { up: false, down: false, left: false, right: false, jump: false };
              return;
            }
            
            // Run the last test (most complex) visually
            const results = runAllTests(shipGrid, SOLID_TILES);
            if (results.length === 0) return;
            
            // Use last test (ceiling to shaft is most interesting)
            const testToRun = results[results.length - 1];
            console.log("🎬 Starting visual test:", testToRun.testName);
            
            // Clear Nim's destination to disable AI pathfinding
            setNimDestination(null);
            nimCurrentPathRef.current = [];
            
            // Teleport Nim to start position
            const TILE = 32;
            const startX = testToRun.startTile.x * TILE + TILE / 2 - 14; // PLAYER.COLLIDER_SIZE/2
            const startY = testToRun.startTile.y * TILE + TILE / 2 - 14;
            nimPhysicsRef.current = {
              ...nimPhysicsRef.current,
              x: startX,
              y: startY,
              vx: 0,
              vy: 0,
              gravity: testToRun.startTile.gravity,
              grounded: true,
            };
            
            // Build input queue from planned path
            const queue: {input: ScreenInput; framesLeft: number; action: string}[] = [];
            
            for (const step of testToRun.plannedPath) {
              const isJump = step.action.startsWith("jump");
              const isWalk = step.action.startsWith("walk");
              const isFall = step.action.startsWith("fall");
              
              let lateral = step.lateral;
              if (step.action.includes("-left")) lateral = -1;
              else if (step.action.includes("-right")) lateral = 1;
              
              const input = lateralToInput(lateral, step.start.gravity, isJump);
              
              // Estimate frames needed
              let frames = isWalk ? 30 : isJump ? 60 : isFall ? 45 : 30;
              
              queue.push({ input, framesLeft: frames, action: step.action });
            }
            
            visualTestQueueRef.current = queue;
            visualTestIndexRef.current = 0;
            setVisualTestMode(true);
            setTestResults(results);
            setShowTestPanel(true);
          }}
          style={{
            padding: "4px 8px",
            background: visualTestMode ? "#f00" : "#333",
            color: visualTestMode ? "#fff" : "#f90",
            border: "1px solid #f90",
            cursor: "pointer",
          }}
        >
          {visualTestMode ? "⏹️ STOP" : "🎬 VISUAL"}
        </button>
        <span style={{ color: "#666", alignSelf: "center" }}>
          WASD = move JP | Click = set Nim DEST | Space = jump
        </span>
        <span style={{ 
          color: charPhysics.grounded ? "#4ade80" : "#ff6b6b", 
          alignSelf: "center",
          marginLeft: "auto",
          whiteSpace: "nowrap",
        }}>
          {charPhysics.gravity} | {charPhysics.grounded ? "🦶" : "🪂"}
        </span>
      </div>
      
      {gameMessage && (
        <div style={{
          marginBottom: 10,
          padding: "8px 12px",
          background: recording ? "#f001" : "#0f01",
          border: `1px solid ${recording ? "#f00" : "#0f0"}`,
          color: recording ? "#f00" : "#0f0",
          fontSize: 10,
        }}>
          {gameMessage}
        </div>
      )}

      {/* Test Results Panel */}
      {showTestPanel && testResults.length > 0 && (
        <div style={{
          marginBottom: 10,
          padding: "8px 12px",
          background: "#1a1a2e",
          border: "1px solid #ff0",
          fontSize: 9,
          maxHeight: 300,
          overflow: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: "#ff0", fontWeight: "bold" }}>🧪 PATHFINDING TESTS</span>
            <button onClick={() => setShowTestPanel(false)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer" }}>✕</button>
          </div>
          {testResults.map((result, idx) => (
            <div key={idx} style={{ marginBottom: 12, borderBottom: "1px solid #333", paddingBottom: 8 }}>
              <div style={{ color: result.success ? "#0f0" : "#f00", fontWeight: "bold" }}>
                {result.success ? "✅" : "❌"} {result.testName}
              </div>
              <div style={{ color: "#888", fontSize: 8 }}>
                Start: ({result.startTile.x},{result.startTile.y}) {result.startTile.gravity} → Dest: ({result.destTile.x},{result.destTile.y})
              </div>
              {result.pathFound && (
                <div style={{ color: "#666", fontSize: 8 }}>
                  Path: [{result.plannedActions.join(" → ")}]
                </div>
              )}
              {result.steps.map((step, stepIdx) => (
                <div key={stepIdx} style={{ 
                  marginLeft: 10, 
                  padding: "2px 4px",
                  background: step.passed ? "#0f01" : "#f001",
                  marginTop: 2,
                  fontSize: 8,
                }}>
                  <span style={{ color: step.passed ? "#0f0" : "#f00" }}>
                    {step.passed ? "✓" : "✗"} Step {step.stepIndex}: {step.action}
                  </span>
                  <div style={{ color: "#888", marginLeft: 10 }}>
                    Expected: ({step.expectedStart.x},{step.expectedStart.y}) <span style={{color:"#0af"}}>{step.expectedStart.gravity}</span> → ({step.expectedLanding?.x},{step.expectedLanding?.y}) <span style={{color:"#0af"}}>{step.expectedLanding?.gravity}</span>
                  </div>
                  <div style={{ color: "#888", marginLeft: 10 }}>
                    Actual: ({step.actualStart.x},{step.actualStart.y}) <span style={{color:"#f80"}}>{step.actualStart.gravity}</span> → ({step.actualLanding?.x},{step.actualLanding?.y}) <span style={{color:"#f80"}}>{step.actualLanding?.gravity}</span>
                  </div>
                  {step.errorDetails.map((err, errIdx) => (
                    <div key={errIdx} style={{ color: "#f00", marginLeft: 10, fontSize: 7 }}>
                      ⚠️ {err}
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ color: "#888", marginTop: 4, fontSize: 8 }}>
                Summary: {result.passedSteps}/{result.totalSteps} passed
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Move History Panel */}
      {moveHistory.length > 0 && (
        <div style={{
          marginBottom: 10,
          padding: "8px 12px",
          background: "#1a1a2e",
          border: "1px solid #0ff",
          fontSize: 9,
          maxHeight: 120,
          overflow: "auto",
        }}>
          <div style={{ color: "#0ff", marginBottom: 4 }}>📜 MOVE HISTORY ({moveHistory.length} moves)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {moveHistory.slice(-10).map((move, i) => (
              <div key={i} style={{ display: "flex", gap: 8, color: "#ccc" }}>
                <span style={{ color: "#4ade80" }}>{move.action}</span>
                <span>({move.from.x},{move.from.y}) → ({move.to.x},{move.to.y})</span>
                <span style={{ color: "#666" }}>{move.time}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
          cursor: "crosshair",
        }}
        tabIndex={0}
        onClick={(e) => {
          // Click to set NIM destination (pink character)
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          
          // Convert to ship coordinates (camera is ref-driven; React viewX/viewY may be stale)
          const shipX = viewXRef.current * TILE + clickX;
          const shipY = viewYRef.current * TILE + clickY;
          
          const tileX = Math.floor(shipX / TILE);
          const tileY = Math.floor(shipY / TILE);
          
          if (tileX >= 0 && tileX < SHIP_W && tileY >= 0 && tileY < SHIP_H) {
            // Update both React state (for UI) and ref (for AI loop) immediately
            nimDestinationRef.current = { x: tileX, y: tileY };
            nimDestKeyRef.current = null; // force-plan on next AI tick
            nimPlanMetaRef.current = { destKey: null, bestKey: null, minDist: Infinity, cost: Infinity };
            setNimDestination({ x: tileX, y: tileY });
            nimCurrentPathRef.current = [];
            nimPathProgressRef.current = 0;
            
            // Calculate physics-based path for Nim
            const reachable = calculateReachableCells(
              Math.round(nimPhysicsRef.current.x / TILE),
              Math.round(nimPhysicsRef.current.y / TILE),
              nimPhysicsRef.current.gravity as any,
              shipGrid,
              SOLID_TILES as string[]
            );
            
            // Find best path to clicked destination
            let bestCell = null;
            let minDist = Infinity;
            for (const cell of reachable) {
              const dist = Math.abs(cell.x - tileX) + Math.abs(cell.y - tileY);
              if (dist < minDist) {
                minDist = dist;
                bestCell = cell;
              }
            }
            
            if (bestCell && bestCell.path.length > 0) {
              nimCurrentPathRef.current = bestCell.path;
              nimPathProgressRef.current = 0;
              setNimPath(bestCell.path.flatMap((jump: any): PathStep[] => {
                if (!jump.landing) return [];
                return [
                  { node: { x: jump.start.x, y: jump.start.y, gravity: jump.start.gravity as GravityDir }, action: 'start' },
                  { node: { x: jump.landing.x, y: jump.landing.y, gravity: jump.landing.gravity as GravityDir }, action: 'jump' }
                ];
              }));
              if (DEBUG_NIM) console.log(`[Nim AI] Path to (${tileX}, ${tileY}): ${bestCell.path.length} actions`);
            } else {
              if (DEBUG_NIM) console.log(`[Nim AI] No path to (${tileX}, ${tileY})`);
            }
          }
        }}
      >
        {/* GAME CANVAS - renders tiles, characters, paths at 60fps */}
        <canvas
          ref={gameCanvasRef}
          width={VIEW_W * TILE}
          height={VIEW_H * TILE}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: VIEW_W * TILE,
            height: VIEW_H * TILE,
            imageRendering: "pixelated",
            zIndex: 20,
          }}
        />
        
        {/* REMOVED: SVG path and trajectory overlays - now rendered on game canvas */}
        
        {/* Debug: Path segment viability */}
        {showPaths && codexPathSegments.length > 0 && (
          <div style={{
            position: "absolute",
            right: 8,
            top: 8,
            zIndex: 50,
            maxWidth: 420,
            maxHeight: 220,
            overflow: "auto",
            background: "rgba(0,0,0,0.75)",
            border: "1px solid rgba(0,240,255,0.4)",
            padding: 8,
            fontSize: 10,
            color: "#c7f9ff",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            pointerEvents: "none",
          }}>
            <div style={{ color: "#00f0ff", marginBottom: 6 }}>Codex path segments</div>
            {codexPathSegments.slice(0, 40).map((s: any, i: number) => (
              <div key={i} style={{
                color: s.viability === "invalid" ? "#ff6b6b" : "#c7f9ff",
                opacity: 0.95,
                marginBottom: 2,
              }}>
                {String(i).padStart(2, "0")} {s.type ?? s.action} ({s.from.x},{s.from.y},{s.from.gravity},{s.from.jumpPhase ?? 0}) → ({s.to.x},{s.to.y},{s.to.gravity},{s.to.jumpPhase ?? 0})
                {s.viability === "invalid" && s.reason ? ` — ${s.reason}` : ""}
              </div>
            ))}
          </div>
        )}

        {/* REMOVED: Debug tile SVG overlay - now rendered on game canvas */}
        
        {/* REMOVED: Old DOM character elements (Nimbus, Codex, Nim)
            All characters now render via the game canvas */}
        
        {/* Nim Destination marker */}
        {nimDestination && (
          <div
            style={{
              position: "absolute",
              left: (nimDestination.x - viewX) * TILE,
              top: (nimDestination.y - viewY) * TILE,
              width: TILE,
              height: TILE,
              border: "2px dashed #ff00aa",
              background: "rgba(255, 0, 170, 0.2)",
              pointerEvents: "none",
              zIndex: 8,
            }}
          >
            <span style={{ color: "#ff00aa", fontSize: 8, position: "absolute", top: -12 }}>DEST</span>
          </div>
        )}
        
        {/* Nim Path visualization */}
        {showPhysicsPaths && nimPath.length > 1 && (
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
            <polyline
              points={nimPath.map(step => 
                `${step.node.x * TILE + TILE/2},${step.node.y * TILE + TILE/2}`
              ).join(" ")}
              fill="none"
              stroke="#ff00aa"
              strokeWidth="3"
              strokeOpacity="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6,3"
            />
            {nimPath.map((step, i) => (
              <circle
                key={i}
                cx={step.node.x * TILE + TILE/2}
                cy={step.node.y * TILE + TILE/2}
                r={i === 0 ? 6 : 4}
                fill={step.action === "jump" ? "#ff1493" : "#ff00aa"}
                opacity="0.9"
              />
            ))}
          </svg>
        )}
        
        {/* JP Path visualization (REMOVED - JP is player controlled) */}
        {false && jpPath.length > 1 && (
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
            <polyline
              points={jpPath.map(step => 
                `${step.node.x * TILE + TILE/2},${step.node.y * TILE + TILE/2}`
              ).join(" ")}
              fill="none"
              stroke="#4ade80"
              strokeWidth="3"
              strokeOpacity="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="8,4"
            />
            {jpPath.map((step, i) => (
              <circle
                key={i}
                cx={step.node.x * TILE + TILE/2}
                cy={step.node.y * TILE + TILE/2}
                r={i === 0 ? 6 : 4}
                fill={step.action === "jump" ? "#ff6b6b" : step.action === "fall" ? "#fbbf24" : "#4ade80"}
                opacity="0.8"
              />
            ))}
          </svg>
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
          {/* Nim marker on minimap */}
          <div style={{
            position: "absolute",
            left: (nimPhysics.x / TILE) * 4,
            top: (nimPhysics.y / TILE) * 4,
            width: 6,
            height: 6,
            background: "#ff00aa",
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
          
          {/* Reset Position (ALL characters) */}
          <button
            onClick={() => {
              // Reset CODEX
              setCodexPhysics({
                x: 13 * TILE,
                y: 5 * TILE - PLAYER.COLLIDER_SIZE,
                vx: 0,
                vy: 0,
                gravity: "DOWN",
                grounded: true,
                width: PLAYER.COLLIDER_SIZE,
                height: PLAYER.COLLIDER_SIZE,
                jumpHeld: false,
              });
              setCodexPath([]);
              
              // Reset NIM (Pink Nim on ceiling)
              setNimPhysics({
                x: 12 * TILE,
                y: 2 * TILE - PLAYER.COLLIDER_SIZE,
                vx: 0,
                vy: 0,
                gravity: "UP",
                grounded: true,
                width: PLAYER.COLLIDER_SIZE,
                height: PLAYER.COLLIDER_SIZE,
                jumpHeld: false,
              });
              nimPhysicsRef.current = {
                x: 12 * TILE,
                y: 2 * TILE - PLAYER.COLLIDER_SIZE,
                vx: 0,
                vy: 0,
                gravity: "UP",
                grounded: true,
                width: PLAYER.COLLIDER_SIZE,
                height: PLAYER.COLLIDER_SIZE,
                jumpHeld: false,
              };
              // Clear Nim's path
              nimCurrentPathRef.current = [];
              nimPathProgressRef.current = 0;
              
              setCommandResults(prev => [...prev.slice(-9), {
                name: "Reset",
                expected: "All characters at spawn positions",
                actual: "Reset complete (Codex + Nim)",
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
