/**
 * Physics-based Pathfinding with Jump Trajectory Calculation
 * 
 * Solves: "From my current position with current gravity, where can I reach with a jump?"
 * Includes chained jumps, gravity changes, and closest-point fallback.
 */

import { PHYSICS, PLAYER, getMoveRightVector, getGravityVector, GravityDirection } from "./physics";

// AABB helpers for walk viability checks (must match real collider footprint)
const COLLIDER = PLAYER.COLLIDER_SIZE;

export type PhysGravity = "DOWN" | "UP" | "LEFT" | "RIGHT";

export interface PhysState {
  x: number;  // pixel position
  y: number;
  vx: number;
  vy: number;
  gravity: PhysGravity;
  grounded: boolean;
}

export interface JumpResult {
  start: { x: number; y: number; gravity: PhysGravity };
  trajectory: Array<{ x: number; y: number; frame: number }>;
  landing: { x: number; y: number; gravity: PhysGravity } | null;

  // Analog lateral input used during simulation/execution (gravity-relative).
  // Range [-1..+1]. Critical for making runtime execution match the planned yellow arc.
  lateral: number;

  action: string;
  cost: number;
}

export interface ReachableCell {
  x: number;
  y: number;
  gravity: PhysGravity;
  cost: number;  // frames to reach
  path: JumpResult[];  // sequence of jumps
}

const TILE = 32;
const CELL_COST = 4;  // Cost per cell traversed (walk or jump arc)

// Calculate jump cost based on unique cells traversed in the arc
function calculateJumpCellCost(trajectory: Array<{ x: number; y: number }>): number {
  const visited = new Set<string>();
  for (const point of trajectory) {
    const cellX = Math.floor(point.x / TILE);
    const cellY = Math.floor(point.y / TILE);
    visited.add(`${cellX},${cellY}`);
  }
  // Minimum cost of 1 cell even for very short jumps
  return Math.max(1, visited.size) * CELL_COST;
}

// Convert grid cell to pixel position based on gravity
// The position is the character's center point
// For DOWN gravity: standing on floor at y, so center is at y * TILE + TILE/2
// For UP gravity: standing on ceiling at y, so center is at (y+1) * TILE - TILE/2
function cellToPixel(x: number, y: number, gravity: PhysGravity): { x: number; y: number } {
  const centerX = x * TILE + TILE / 2;
  const centerY = y * TILE + TILE / 2;
  
  switch (gravity) {
    case "DOWN":
    case "UP":
    case "LEFT":
    case "RIGHT":
      return { x: centerX, y: centerY };
  }
}

// Convert pixel to grid cell
function pixelToCell(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.floor(x / TILE),
    y: Math.floor(y / TILE)
  };
}

function aabbOverlapsSolidAtCenter(
  cx: number,
  cy: number,
  grid: string[][],
  solidTypes: string[]
): boolean {
  const w = COLLIDER;
  const h = COLLIDER;
  const left = cx - w / 2;
  const top = cy - h / 2;

  const startX = Math.floor(left / TILE);
  const endX = Math.floor((left + w - 1) / TILE);
  const startY = Math.floor(top / TILE);
  const endY = Math.floor((top + h - 1) / TILE);

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return true;
      if (solidTypes.includes(grid[ty][tx])) return true;
    }
  }
  return false;
}

function hasSupportAtCenter(
  cx: number,
  cy: number,
  gravity: PhysGravity,
  grid: string[][],
  solidTypes: string[]
): boolean {
  const gv = getGravVec(gravity);
  const mr = getMoveRightVector(gravity as any);

  // Probe a few points along the collider's gravity-facing edge.
  // This is much closer to how the real collider can be "partially" supported,
  // and avoids false negatives in tight gaps/notches.
  const edgeDist = COLLIDER / 2 + 1;
  const span = COLLIDER / 2 - 2;
  const samples = [-span, 0, span];

  for (const t of samples) {
    const px = cx + gv.x * edgeDist + mr.x * t;
    const py = cy + gv.y * edgeDist + mr.y * t;
    const c = pixelToCell(px, py);
    if (isSolid(grid, c.x, c.y, solidTypes)) return true;
  }
  return false;
}

// Check if solid
function isSolid(grid: string[][], x: number, y: number, solidTypes: string[]): boolean {
  if (y < 0 || y >= grid.length) return true;
  if (x < 0 || x >= grid[0].length) return true;
  return solidTypes.includes(grid[y][x]);
}

// Check if empty
function isEmpty(grid: string[][], x: number, y: number, solidTypes: string[]): boolean {
  if (y < 0 || y >= grid.length) return false;
  if (x < 0 || x >= grid[0].length) return false;
  return !solidTypes.includes(grid[y][x]);
}

// Get gravity vector
function getGravVec(gravity: PhysGravity): { x: number; y: number } {
  switch (gravity) {
    case "DOWN": return { x: 0, y: 1 };
    case "UP": return { x: 0, y: -1 };
    case "LEFT": return { x: -1, y: 0 };
    case "RIGHT": return { x: 1, y: 0 };
  }
}

// Simulate one jump or fall with given lateral input
// When isJump=false, simulates stepping off an edge and falling (no upward impulse)
function simulateJump(
  startX: number,
  startY: number,
  gravity: PhysGravity,
  lateralInput: number,  // -1.0 to 1.0 (left/right input)
  grid: string[][],
  solidTypes: string[],
  maxFrames: number = 120,
  debug: boolean = false,
  isJump: boolean = true  // false = fall/drop off edge
): JumpResult | null {
  const gravVec = getGravVec(gravity);
  const jumpDir = { x: -gravVec.x, y: -gravVec.y };
  const moveRightVec = getMoveRightVector(gravity);
  
  let x = startX;
  let y = startY;
  // Jump: apply upward impulse; Fall: start with zero vertical velocity
  let vx = isJump ? jumpDir.x * PHYSICS.JUMP_FORCE : 0;
  let vy = isJump ? jumpDir.y * PHYSICS.JUMP_FORCE : 0;
  
  // Note: No initial lateral velocity - matches actual physics
  // Lateral velocity builds up through air control during jump
  
  if (debug) {
    console.log(`  Jump start: (${startX.toFixed(1)}, ${startY.toFixed(1)}), grav=${gravity}, lateral=${lateralInput}`);
    console.log(`  Initial vel: (${vx.toFixed(2)}, ${vy.toFixed(2)})`);
  }
  
  const trajectory: Array<{ x: number; y: number; frame: number }> = [];
  
  for (let frame = 0; frame < maxFrames; frame++) {
    // Apply gravity
    vx += gravVec.x * PHYSICS.GRAVITY;
    vy += gravVec.y * PHYSICS.GRAVITY;
    
    // Clamp fall speed
    const fallSpeed = vx * gravVec.x + vy * gravVec.y;
    if (fallSpeed > PHYSICS.MAX_FALL_SPEED) {
      const excess = fallSpeed - PHYSICS.MAX_FALL_SPEED;
      vx -= gravVec.x * excess;
      vy -= gravVec.y * excess;
    }
    
    // Apply air control (matches actual physics - no speed multiplier)
    const currentLateral = vx * moveRightVec.x + vy * moveRightVec.y;
    const targetLateral = lateralInput * PHYSICS.AIR_MAX_SPEED;
    const diff = targetLateral - currentLateral;
    const change = Math.sign(diff) * Math.min(Math.abs(diff), PHYSICS.AIR_ACCEL);
    vx += moveRightVec.x * change;
    vy += moveRightVec.y * change;
    
    // Move
    x += vx;
    y += vy;
    
    trajectory.push({ x, y, frame });
    
    const cell = pixelToCell(x, y);
    
    // Check bounds
    if (cell.x < 0 || cell.x >= grid[0].length || cell.y < 0 || cell.y >= grid.length) {
      if (debug) console.log(`  Frame ${frame}: Out of bounds at (${cell.x}, ${cell.y})`);
      break;
    }
    
    // Check collision using AABB (full hitbox, not just center point)
    // This prevents planning arcs where the character body would clip through geometry
    if (aabbOverlapsSolidAtCenter(x, y, grid, solidTypes)) {
      // Hit something - check if we can land on it
      const hitCell = { x: cell.x, y: cell.y };
      
      if (debug) {
        console.log(`  Frame ${frame}: HIT solid at (${hitCell.x}, ${hitCell.y}), vel=(${vx.toFixed(2)}, ${vy.toFixed(2)})`);
      }
      
      // Calculate which cell we were in before the collision
      const prevX = x - vx;
      const prevY = y - vy;
      const prevCell = pixelToCell(prevX, prevY);
      
      // Determine gravity toward the surface we hit
      // The new gravity points toward the solid we collided with
      let newGravity: PhysGravity;
      
      // Check which face of the solid we hit based on our approach direction
      const dx = hitCell.x - prevCell.x;
      const dy = hitCell.y - prevCell.y;
      
      if (Math.abs(dx) > Math.abs(dy)) {
        // Hit from the side
        newGravity = dx > 0 ? "RIGHT" : "LEFT";
      } else {
        // Hit from above/below
        newGravity = dy > 0 ? "DOWN" : "UP";
      }
      
      if (debug) {
        console.log(`  -> Hit from: dx=${dx}, dy=${dy}`);
      }
      
      // The landing cell is the last empty cell before hitting the solid
      const landingCell = prevCell;
      
      if (debug) {
        console.log(`  -> New gravity: ${newGravity}, landing cell: (${landingCell.x}, ${landingCell.y})`);
        console.log(`  -> Landing cell is ${isEmpty(grid, landingCell.x, landingCell.y, solidTypes) ? 'EMPTY' : 'SOLID'}`);
      }
      
      // Check if landing position is valid
      if (isEmpty(grid, landingCell.x, landingCell.y, solidTypes)) {
        const startCell = pixelToCell(startX, startY);
        return {
          start: { x: startCell.x, y: startCell.y, gravity },
          trajectory,
          landing: { x: landingCell.x, y: landingCell.y, gravity: newGravity },
          lateral: lateralInput,
          action: isJump 
            ? (lateralInput === 0 ? "jump" : lateralInput < 0 ? "jump-left" : "jump-right")
            : (lateralInput === 0 ? "fall" : lateralInput < 0 ? "fall-left" : "fall-right"),
          cost: calculateJumpCellCost(trajectory)
        };
      }
      break; // Invalid landing
    }
  }
  
  return null; // No landing found
}

// Simple priority queue for Dijkstra's algorithm
class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];
  
  push(item: T, priority: number) {
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }
  
  pop(): T | undefined {
    return this.items.shift()?.item;
  }
  
  get length() {
    return this.items.length;
  }
}

// Calculate all reachable cells from a starting position using Dijkstra's algorithm
export function calculateReachableCells(
  startX: number,
  startY: number,
  startGravity: PhysGravity,
  grid: string[][],
  solidTypes: string[]
): ReachableCell[] {
  const reachable: ReachableCell[] = [];
  const seen = new Set<string>();
  const bestCost = new Map<string, number>(); // Track best cost to reach each state
  
  // Priority queue for Dijkstra: always expand lowest cost first
  const queue = new PriorityQueue<{
    x: number;
    y: number;
    gravity: PhysGravity;
    cost: number;
    path: JumpResult[];
  }>();
  
  queue.push({
    x: startX,
    y: startY,
    gravity: startGravity,
    cost: 0,
    path: []
  }, 0);
  
  bestCost.set(`${startX},${startY},${startGravity}`, 0);
  
  // Test different lateral inputs - more granular for precise gap navigation
  const lateralInputs = [-1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0];
  
  let iterations = 0;
  let jumpsFound = 0;
  let walksFound = 0;
  const MAX_ITERATIONS = 3000;
  
  // Helper to get floor cell based on gravity
  const getFloorCell = (x: number, y: number, gravity: PhysGravity) => {
    switch (gravity) {
      case "DOWN": return { x, y: y + 1 };
      case "UP": return { x, y: y - 1 };
      case "LEFT": return { x: x - 1, y };
      case "RIGHT": return { x: x + 1, y };
    }
  };
  
  // Helper to get left/right cells based on gravity
  const getLateralCells = (x: number, y: number, gravity: PhysGravity) => {
    switch (gravity) {
      case "DOWN": return { left: { x: x - 1, y }, right: { x: x + 1, y } };
      case "UP": return { left: { x: x + 1, y }, right: { x: x - 1, y } };
      case "LEFT": return { left: { x, y: y - 1 }, right: { x, y: y + 1 } };
      case "RIGHT": return { left: { x, y: y + 1 }, right: { x, y: y - 1 } };
    }
  };
  
  while (queue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const current = queue.pop()!;
    
    // Check if we've already found a better path to this state
    const stateKey = `${current.x},${current.y},${current.gravity}`;
    const currentBest = bestCost.get(stateKey);
    if (currentBest !== undefined && current.cost > currentBest) {
      continue; // Skip if we already have a better path
    }
    
    // Record this as reachable
    reachable.push({
      x: current.x,
      y: current.y,
      gravity: current.gravity,
      cost: current.cost,
      path: current.path
    });
    
    // Limit chain depth (allow up to 10 actions)
    if (current.path.length >= 10) continue;
    
    // === WALKING OPTIONS (explored first due to lower cost) ===
    // Can walk left/right if there's solid ground and empty destination
    const laterals = getLateralCells(current.x, current.y, current.gravity);
    
    // Check walking left
    const leftDest = laterals.left;
    const leftCenter = cellToPixel(leftDest.x, leftDest.y, current.gravity);
    if (!aabbOverlapsSolidAtCenter(leftCenter.x, leftCenter.y, grid, solidTypes) &&
        hasSupportAtCenter(leftCenter.x, leftCenter.y, current.gravity, grid, solidTypes)) {
      const key = `${leftDest.x},${leftDest.y},${current.gravity}`;
      const newCost = current.cost + CELL_COST; // Walking cost: 4 per cell
      const existingCost = bestCost.get(key);
      
      if (existingCost === undefined || newCost < existingCost) {
        bestCost.set(key, newCost);
        walksFound++;
        queue.push({
          x: leftDest.x,
          y: leftDest.y,
          gravity: current.gravity,
          cost: newCost,
          path: [...current.path, {
            start: { x: current.x, y: current.y, gravity: current.gravity },
            trajectory: [],
            landing: { x: leftDest.x, y: leftDest.y, gravity: current.gravity },
            lateral: -1,
            action: "walk-left",
            cost: CELL_COST
          }]
        }, newCost);
      }
    }
    
    // Check walking right
    const rightDest = laterals.right;
    const rightCenter = cellToPixel(rightDest.x, rightDest.y, current.gravity);
    if (!aabbOverlapsSolidAtCenter(rightCenter.x, rightCenter.y, grid, solidTypes) &&
        hasSupportAtCenter(rightCenter.x, rightCenter.y, current.gravity, grid, solidTypes)) {
      const key = `${rightDest.x},${rightDest.y},${current.gravity}`;
      const newCost = current.cost + CELL_COST; // Walking cost: 4 per cell
      const existingCost = bestCost.get(key);
      
      if (existingCost === undefined || newCost < existingCost) {
        bestCost.set(key, newCost);
        walksFound++;
        queue.push({
          x: rightDest.x,
          y: rightDest.y,
          gravity: current.gravity,
          cost: newCost,
          path: [...current.path, {
            start: { x: current.x, y: current.y, gravity: current.gravity },
            trajectory: [],
            landing: { x: rightDest.x, y: rightDest.y, gravity: current.gravity },
            lateral: 1,
            action: "walk-right",
            cost: CELL_COST
          }]
        }, newCost);
      }
    }
    
    // === JUMPING OPTIONS ===
    // Simulate jumps from here
    const startPixel = cellToPixel(current.x, current.y, current.gravity);
    
    for (const lateral of lateralInputs) {
      const result = simulateJump(
        startPixel.x,
        startPixel.y,
        current.gravity,
        lateral,
        grid,
        solidTypes
      );
      
      if (result?.landing) {
        jumpsFound++;
        const key = `${result.landing.x},${result.landing.y},${result.landing.gravity}`;
        const newCost = current.cost + result.cost;
        const existingCost = bestCost.get(key);
        
        // Only add if we haven't seen this state or found a cheaper path
        if (existingCost === undefined || newCost < existingCost) {
          bestCost.set(key, newCost);
          queue.push({
            x: result.landing.x,
            y: result.landing.y,
            gravity: result.landing.gravity,
            cost: newCost,
            path: [...current.path, result]
          }, newCost);
        }
      }
    }
    
    // === FALL OPTIONS (walk off edge and drop) ===
    // Sometimes stepping off a ledge is better than jumping
    // Only try falls from edges (where we DON'T have lateral support)
    for (const lateral of lateralInputs) {
      if (lateral === 0) continue; // Need lateral movement to walk off edge
      
      // Check if there's empty space in the lateral direction (edge to fall from)
      const destCell = lateral < 0 ? laterals.left : laterals.right;
      const destCenter = cellToPixel(destCell.x, destCell.y, current.gravity);
      
      // Can only fall if destination has no ground support (it's an edge)
      if (!aabbOverlapsSolidAtCenter(destCenter.x, destCenter.y, grid, solidTypes) &&
          !hasSupportAtCenter(destCenter.x, destCenter.y, current.gravity, grid, solidTypes)) {
        
        const fallResult = simulateJump(
          destCenter.x,  // Start from the edge cell (one step over)
          destCenter.y,
          current.gravity,
          lateral,
          grid,
          solidTypes,
          120,
          false,
          false  // isJump = false (fall)
        );
        
        if (fallResult?.landing) {
          const key = `${fallResult.landing.x},${fallResult.landing.y},${fallResult.landing.gravity}`;
          // Fall cost: 1 walk cell + trajectory cells
          const newCost = current.cost + CELL_COST + fallResult.cost;
          const existingCost = bestCost.get(key);
          
          if (existingCost === undefined || newCost < existingCost) {
            bestCost.set(key, newCost);
            queue.push({
              x: fallResult.landing.x,
              y: fallResult.landing.y,
              gravity: fallResult.landing.gravity,
              cost: newCost,
              path: [...current.path, fallResult]
            }, newCost);
          }
        }
      }
    }
  }
  
  // Debug: log summary
  if (reachable.length > 0) {
    const multiJump = reachable.filter(r => r.path.length > 1);
    console.log(`[Pathfind] ${reachable.length} reachable, ${multiJump.length} multi-jump paths`);
  }
  
  return reachable;
}

// Find closest reachable cell to target
export function findClosestReachable(
  startX: number,
  startY: number,
  startGravity: PhysGravity,
  targetX: number,
  targetY: number,
  grid: string[][],
  solidTypes: string[]
): { cell: ReachableCell | null; distance: number } {
  const reachable = calculateReachableCells(startX, startY, startGravity, grid, solidTypes);
  
  let closest: ReachableCell | null = null;
  let minDist = Infinity;
  
  for (const cell of reachable) {
    const dist = Math.abs(cell.x - targetX) + Math.abs(cell.y - targetY);
    if (dist < minDist) {
      minDist = dist;
      closest = cell;
    }
  }
  
  return { cell: closest, distance: minDist };
}

// Multi-jump pathfinder: chain jumps to reach target
export function findJumpPath(
  startX: number,
  startY: number,
  startGravity: PhysGravity,
  targetX: number,
  targetY: number,
  grid: string[][],
  solidTypes: string[]
): JumpResult[] | null {
  const result = findClosestReachable(
    startX, startY, startGravity,
    targetX, targetY,
    grid, solidTypes
  );
  
  if (result.cell && result.distance === 0) {
    // Exact match!
    return result.cell.path;
  }
  
  // Not reachable - return path to closest
  return result.cell?.path || null;
}

// Visualize reachable cells as jump trajectories
export function getJumpTrajectories(
  startX: number,
  startY: number,
  startGravity: PhysGravity,
  grid: string[][],
  solidTypes: string[],
  debug: boolean = false
): JumpResult[] {
  const results: JumpResult[] = [];
  const lateralInputs = [-1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0];
  const startPixel = cellToPixel(startX, startY, startGravity);
  
  if (debug) {
    console.log(`[getJumpTrajectories] Start cell: (${startX}, ${startY}, ${startGravity})`);
    console.log(`[getJumpTrajectories] Start pixel: (${startPixel.x}, ${startPixel.y})`);
  }
  
  for (const lateral of lateralInputs) {
    const result = simulateJump(
      startPixel.x,
      startPixel.y,
      startGravity,
      lateral,
      grid,
      solidTypes,
      120,
      debug && lateral === -1.0  // Only debug the left jump
    );
    
    if (result) {
      results.push(result);
    } else if (debug) {
      console.log(`[getJumpTrajectories] No result for lateral=${lateral}`);
    }
  }
  
  return results;
}
