import { CellType } from './ship-grid';
import { PHYSICS, getGravityVector, getMoveRightVector } from './physics';

export interface ShipGrid {
  width: number;
  height: number;
  cells: CellType[][];
}

export type GravityDirection = 'down' | 'up' | 'left' | 'right';

export interface GravityState {
  x: number;
  y: number;
  gravity: GravityDirection;
}

export interface GravityPathSegment {
  from: GravityState;
  to: GravityState;
  action: 'walk' | 'jump' | 'wall-jump' | 'fall';
}

interface AStarNode {
  state: GravityState;
  g: number;
  f: number;
  parent: AStarNode | null;
  action: 'walk' | 'jump' | 'wall-jump' | 'fall' | null;
}

const GRAVITY_VECTORS: Record<GravityDirection, { dx: number; dy: number }> = {
  down: { dx: 0, dy: 1 },
  up: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const PERPENDICULAR_GRAVITIES: Record<GravityDirection, GravityDirection[]> = {
  down: ['left', 'right'],
  up: ['left', 'right'],
  left: ['up', 'down'],
  right: ['up', 'down'],
};

function getSurfaceDirection(gravity: GravityDirection): { dx: number; dy: number } {
  switch (gravity) {
    case 'down':
    case 'up':
      return { dx: 1, dy: 0 };
    case 'left':
    case 'right':
      return { dx: 0, dy: 1 };
  }
}

function isSolid(grid: ShipGrid, x: number, y: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return true;
  const cell = grid.cells[y]?.[x];
  return cell === 'hull' || cell === 'hullLight' || cell === 'floor' || cell === 'console' || cell === 'desk';
}

function isEmpty(grid: ShipGrid, x: number, y: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return false;
  const cell = grid.cells[y]?.[x];
  return cell === 'space' || cell === 'interior' || cell === 'hallway' || cell === 'shaft';
}

function isWalkable(grid: ShipGrid, x: number, y: number): boolean {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return false;
  const cell = grid.cells[y]?.[x];
  return cell === 'floor' || cell === 'hull' || cell === 'console' || cell === 'desk' || cell === 'hallway';
}

function hasSurfaceBelow(grid: ShipGrid, x: number, y: number, gravity: GravityDirection): boolean {
  const g = GRAVITY_VECTORS[gravity];
  return isWalkable(grid, x + g.dx, y + g.dy);
}

function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function stateKey(state: GravityState): string {
  return `${state.x},${state.y},${state.gravity}`;
}

export interface JumpTrajectory {
  points: Array<{ x: number; y: number }>;
  landed: boolean;
  landingX?: number;
  landingY?: number;
  /** True if the arc would collide with a solid mid-flight (causing gravity change) */
  hitMidArcSolid: boolean;
  /** The tile that was hit mid-arc (for debugging) */
  midArcCollision?: { x: number; y: number };
}

// Calculate all jump trajectories for visualization
export function calculateJumpTrajectories(
  grid: ShipGrid,
  startX: number,
  startY: number,
  gravity: GravityDirection
): JumpTrajectory[] {
  const trajectories: JumpTrajectory[] = [];
  const gravVec = GRAVITY_VECTORS[gravity];
  const jumpVec = { x: -gravVec.dx, y: -gravVec.dy };
  
  const moveRightVec = getSurfaceDirection(gravity);
  const lateralInputs = [-1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0];
  
  for (const lateralInput of lateralInputs) {
    for (const controlFrame of [0, 5, 10, 15]) {
      const points: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
      let x = startX;
      let y = startY;
      
      let vx = jumpVec.x * (PHYSICS.JUMP_FORCE / PHYSICS.TILE_SIZE);
      let vy = jumpVec.y * (PHYSICS.JUMP_FORCE / PHYSICS.TILE_SIZE);
      
      vx += moveRightVec.dx * lateralInput * (PHYSICS.GROUND_MAX_SPEED * 0.5 / PHYSICS.TILE_SIZE);
      vy += moveRightVec.dy * lateralInput * (PHYSICS.GROUND_MAX_SPEED * 0.5 / PHYSICS.TILE_SIZE);
      
      let landed = false;
      let landingX: number | undefined;
      let landingY: number | undefined;
      let hitMidArcSolid = false;
      let midArcCollision: { x: number; y: number } | undefined;
      
      for (let frame = 0; frame < 90; frame++) {
        vx += gravVec.dx * (PHYSICS.GRAVITY / PHYSICS.TILE_SIZE);
        vy += gravVec.dy * (PHYSICS.GRAVITY / PHYSICS.TILE_SIZE);
        
        const fallSpeed = vx * gravVec.dx + vy * gravVec.dy;
        if (fallSpeed > PHYSICS.MAX_FALL_SPEED / PHYSICS.TILE_SIZE) {
          const excess = fallSpeed - PHYSICS.MAX_FALL_SPEED / PHYSICS.TILE_SIZE;
          vx -= gravVec.dx * excess;
          vy -= gravVec.dy * excess;
        }
        
        if (frame >= controlFrame) {
          const currentLateral = vx * moveRightVec.dx + vy * moveRightVec.dy;
          const targetLateral = lateralInput * (PHYSICS.AIR_MAX_SPEED / PHYSICS.TILE_SIZE);
          const diff = targetLateral - currentLateral;
          const change = Math.sign(diff) * Math.min(Math.abs(diff), PHYSICS.AIR_ACCEL / PHYSICS.TILE_SIZE);
          vx += moveRightVec.dx * change;
          vy += moveRightVec.dy * change;
        }
        
        x += vx;
        y += vy;
        points.push({ x, y });
        
        if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) break;
        
        const tileX = Math.round(x);
        const tileY = Math.round(y);
        const falling = vx * gravVec.dx + vy * gravVec.dy > 0.1;
        
        if (falling && isWalkable(grid, tileX, tileY)) {
          const standX = tileX - gravVec.dx;
          const standY = tileY - gravVec.dy;
          
          if (
            standX >= 0 && standX < grid.width &&
            standY >= 0 && standY < grid.height &&
            isEmpty(grid, Math.round(x), Math.round(y))
          ) {
            landingX = Math.round(standX);
            landingY = Math.round(standY);
            landed = true;
          }
          break;
        }
        
        // Check for mid-arc collision with solid (would cause gravity change)
        if (isSolid(grid, tileX, tileY) && !isWalkable(grid, tileX, tileY)) {
          hitMidArcSolid = true;
          midArcCollision = { x: tileX, y: tileY };
          break;
        }
        
        // Also check if we're passing through a walkable solid at an angle
        // (hitting the side of a floor tile mid-arc, not landing on top)
        if (isSolid(grid, tileX, tileY) && !falling) {
          // We hit a solid while still ascending or moving laterally
          hitMidArcSolid = true;
          midArcCollision = { x: tileX, y: tileY };
          break;
        }
      }
      
      trajectories.push({ points, landed, landingX, landingY, hitMidArcSolid, midArcCollision });
    }
  }
  
  return trajectories;
}

// Calculate all valid jump landing positions using physics simulation
// Excludes trajectories that would hit solid tiles mid-arc (causing gravity change)
export function calculateJumpTargets(
  grid: ShipGrid,
  startX: number,
  startY: number,
  gravity: GravityDirection
): Array<{ x: number; y: number }> {
  const trajectories = calculateJumpTrajectories(grid, startX, startY, gravity);
  const targets: Array<{ x: number; y: number }> = [];
  
  for (const traj of trajectories) {
    // Skip trajectories that would collide mid-arc (unreliable due to gravity change)
    if (traj.hitMidArcSolid) {
      continue;
    }
    
    if (traj.landed && traj.landingX !== undefined && traj.landingY !== undefined) {
      if (!targets.some(t => t.x === traj.landingX && t.y === traj.landingY)) {
        targets.push({ x: traj.landingX, y: traj.landingY });
      }
    }
  }
  
  return targets;
}

function getNeighbors(grid: ShipGrid, state: GravityState): Array<{ state: GravityState; action: 'walk' | 'jump' | 'wall-jump' | 'fall'; cost: number }> {
  const neighbors: Array<{ state: GravityState; action: 'walk' | 'jump' | 'wall-jump' | 'fall'; cost: number }> = [];
  const { x, y, gravity } = state;

  const onSurface = hasSurfaceBelow(grid, x, y, gravity);

  if (onSurface) {
    const surfaceDir = getSurfaceDirection(gravity);
    
    // Walk in positive direction (if surface continues)
    const walkX1 = x + surfaceDir.dx;
    const walkY1 = y + surfaceDir.dy;
    if (isEmpty(grid, walkX1, walkY1)) {
      if (hasSurfaceBelow(grid, walkX1, walkY1, gravity)) {
        // Normal walk on surface
        neighbors.push({ state: { x: walkX1, y: walkY1, gravity }, action: 'walk', cost: 1 });
      } else {
        // Step off ledge - will fall
        neighbors.push({ state: { x: walkX1, y: walkY1, gravity }, action: 'walk', cost: 1 });
      }
    }

    // Walk in negative direction (if surface continues)
    const walkX2 = x - surfaceDir.dx;
    const walkY2 = y - surfaceDir.dy;
    if (isEmpty(grid, walkX2, walkY2)) {
      if (hasSurfaceBelow(grid, walkX2, walkY2, gravity)) {
        // Normal walk on surface
        neighbors.push({ state: { x: walkX2, y: walkY2, gravity }, action: 'walk', cost: 1 });
      } else {
        // Step off ledge - will fall
        neighbors.push({ state: { x: walkX2, y: walkY2, gravity }, action: 'walk', cost: 1 });
      }
    }

    // Calculate physics-based jump targets
    const jumpTargets = calculateJumpTargets(grid, x, y, gravity);
    for (const target of jumpTargets) {
      // Calculate distance-based cost
      const dist = Math.abs(target.x - x) + Math.abs(target.y - y);
      const cost = 2 + Math.floor(dist / 3); // Base jump cost + distance penalty
      neighbors.push({ state: { x: target.x, y: target.y, gravity }, action: 'jump', cost });
    }

    const perpGravs = PERPENDICULAR_GRAVITIES[gravity];
    for (const newGravity of perpGravs) {
      const newG = GRAVITY_VECTORS[newGravity];
      const wallX = x + newG.dx;
      const wallY = y + newG.dy;
      if (isSolid(grid, wallX, wallY)) {
        const landX = x - newG.dx;
        const landY = y - newG.dy;
        if (isEmpty(grid, landX, landY)) {
          neighbors.push({ state: { x: landX, y: landY, gravity: newGravity }, action: 'wall-jump', cost: 3 });
        }
      }
    }
  }

  if (!onSurface) {
    const g = GRAVITY_VECTORS[gravity];
    const fallX = x + g.dx;
    const fallY = y + g.dy;
    if (isEmpty(grid, fallX, fallY)) {
      neighbors.push({ state: { x: fallX, y: fallY, gravity }, action: 'fall', cost: 1 });
    }
  }

  return neighbors;
}

export function findGravityPathAStar(
  start: GravityState,
  target: { x: number; y: number },
  grid: ShipGrid
): GravityPathSegment[] | null {
  const openSet = new Map<string, AStarNode>();
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    state: start,
    g: 0,
    f: manhattanDistance(start.x, start.y, target.x, target.y),
    parent: null,
    action: null,
  };

  openSet.set(stateKey(start), startNode);

  while (openSet.size > 0) {
    let current: AStarNode | null = null;
    let currentKey = '';
    for (const [key, node] of openSet) {
      if (!current || node.f < current.f) {
        current = node;
        currentKey = key;
      }
    }

    if (!current) break;

    if (current.state.x === target.x && current.state.y === target.y) {
      const path: GravityPathSegment[] = [];
      let node: AStarNode | null = current;
      while (node?.parent && node.action) {
        path.unshift({
          from: node.parent.state,
          to: node.state,
          action: node.action,
        });
        node = node.parent;
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    const neighbors = getNeighbors(grid, current.state);
    for (const { state: neighborState, action, cost } of neighbors) {
      const neighborKey = stateKey(neighborState);
      if (closedSet.has(neighborKey)) continue;

      const gScore = current.g + cost;
      const hScore = manhattanDistance(neighborState.x, neighborState.y, target.x, target.y);
      const fScore = gScore + hScore;

      const existing = openSet.get(neighborKey);
      if (!existing || gScore < existing.g) {
        openSet.set(neighborKey, {
          state: neighborState,
          g: gScore,
          f: fScore,
          parent: current,
          action,
        });
      }
    }
  }

  return null;
}

// Find the closest reachable point to the target (for when no path exists)
export function findClosestReachablePoint(
  start: GravityState,
  target: { x: number; y: number },
  grid: ShipGrid
): { state: GravityState; distance: number; path: GravityPathSegment[] } | null {
  const openSet = new Map<string, AStarNode>();
  const closedSet = new Set<string>();
  let closestNode: AStarNode | null = null;
  let closestDistance = Infinity;

  const startNode: AStarNode = {
    state: start,
    g: 0,
    f: manhattanDistance(start.x, start.y, target.x, target.y),
    parent: null,
    action: null,
  };

  openSet.set(stateKey(start), startNode);

  while (openSet.size > 0) {
    let current: AStarNode | null = null;
    let currentKey = '';
    for (const [key, node] of openSet) {
      if (!current || node.f < current.f) {
        current = node;
        currentKey = key;
      }
    }

    if (!current) break;

    // Track closest point to target
    const distToTarget = manhattanDistance(current.state.x, current.state.y, target.x, target.y);
    if (distToTarget < closestDistance) {
      closestDistance = distToTarget;
      closestNode = current;
    }

    // If we reached the target, return the path
    if (current.state.x === target.x && current.state.y === target.y) {
      const path: GravityPathSegment[] = [];
      let node: AStarNode | null = current;
      while (node?.parent && node.action) {
        path.unshift({
          from: node.parent.state,
          to: node.state,
          action: node.action,
        });
        node = node.parent;
      }
      return { state: current.state, distance: 0, path };
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    // Limit search to prevent infinite loops on large grids
    if (closedSet.size > 1000) break;

    const neighbors = getNeighbors(grid, current.state);
    for (const { state: neighborState, action, cost } of neighbors) {
      const neighborKey = stateKey(neighborState);
      if (closedSet.has(neighborKey)) continue;

      const gScore = current.g + cost;
      const hScore = manhattanDistance(neighborState.x, neighborState.y, target.x, target.y);
      const fScore = gScore + hScore;

      const existing = openSet.get(neighborKey);
      if (!existing || gScore < existing.g) {
        openSet.set(neighborKey, {
          state: neighborState,
          g: gScore,
          f: fScore,
          parent: current,
          action,
        });
      }
    }
  }

  // Return closest point found
  if (closestNode) {
    const path: GravityPathSegment[] = [];
    let node: AStarNode | null = closestNode;
    while (node?.parent && node.action) {
      path.unshift({
        from: node.parent.state,
        to: node.state,
        action: node.action,
      });
      node = node.parent;
    }
    return { state: closestNode.state, distance: closestDistance, path };
  }

  return null;
}

export function getGravityArrow(gravity: GravityDirection): string {
  switch (gravity) {
    case 'down': return '↓';
    case 'up': return '↑';
    case 'left': return '←';
    case 'right': return '→';
  }
}
