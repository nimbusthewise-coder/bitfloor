/**
 * Bitship Pathfinding System
 * BFS-based pathfinding for multi-gravity navigation
 * 
 * The state space is (x, y, gravity) tuples, not just (x, y).
 * This allows pathfinding across gravity transitions.
 */

export type GravityDir = "DOWN" | "UP" | "LEFT" | "RIGHT";

// A node in the pathfinding graph
//
// NOTE: jumpPhase expands the state-space so pathfinding can represent
// grounded vs airborne (jumping/falling). This prevents impossible paths
// like "walk down from ceiling into a shaft" without first leaving the surface.
export interface PathNode {
  x: number;
  y: number;
  gravity: GravityDir;
  /** 0 = grounded (canStand), 1..MAX_JUMP_PHASE = rising, >MAX_JUMP_PHASE = falling */
  jumpPhase?: number;
}

// An edge represents a possible movement
export interface PathEdge {
  action: "walk" | "jump" | "fall";
  cost: number;  // For weighted pathfinding later (BFS uses cost=1)
}

// A step in a path (node + how we got there)
export interface PathStep {
  node: PathNode;
  action: "start" | "walk" | "jump" | "fall" | "step";
}

const MAX_JUMP_PHASE = 6;
const MAX_FALL_PHASE = 20; // cap falling exploration to keep the graph finite

export type MovementAction = "walk" | "jump" | "fall" | "step";
export type MovementMap = Map<string, { node: PathNode; action: MovementAction }[]>;

export type SegmentViability = "ok" | "invalid";
export type SegmentType = "walk" | "step" | "jump" | "fall" | "jumpAcross" | "invalid";

export interface PathSegment {
  from: PathNode;
  to: PathNode;
  action: MovementAction;
  /** Higher-level label for debugging: e.g. jumpAcross when gravity changes on a stick/land */
  type: SegmentType;
  viability: SegmentViability;
  reason?: string;
}

// Serialize node for use as map key
function nodeKey(node: PathNode): string {
  const jp = node.jumpPhase ?? 0;
  return `${node.x},${node.y},${node.gravity},${jp}`;
}

// Parse node from key
function parseKey(key: string): PathNode {
  const [x, y, gravity, jp] = key.split(",");
  return {
    x: parseInt(x),
    y: parseInt(y),
    gravity: gravity as GravityDir,
    jumpPhase: jp ? parseInt(jp) : 0,
  };
}

// Check if a cell is solid
function isSolid(
  grid: string[][],
  x: number,
  y: number,
  solidTypes: string[]
): boolean {
  // Out of bounds = solid (boundary walls)
  if (y < 0 || y >= grid.length) return true;
  if (x < 0 || x >= grid[0].length) return true;
  return solidTypes.includes(grid[y][x]);
}

// Check if a cell is empty (passable)
function isEmpty(
  grid: string[][],
  x: number,
  y: number,
  solidTypes: string[]
): boolean {
  if (y < 0 || y >= grid.length) return false;
  if (x < 0 || x >= grid[0].length) return false;
  return !solidTypes.includes(grid[y][x]);
}

// Get the "floor" offset for a gravity direction
function getFloorOffset(gravity: GravityDir): { dx: number; dy: number } {
  switch (gravity) {
    case "DOWN": return { dx: 0, dy: 1 };   // Floor is below
    case "UP": return { dx: 0, dy: -1 };    // Floor is above (ceiling)
    case "LEFT": return { dx: -1, dy: 0 };  // Floor is to the left (wall)
    case "RIGHT": return { dx: 1, dy: 0 };  // Floor is to the right (wall)
  }
}

// Get lateral movement directions for a gravity (perpendicular to gravity)
function getLateralDirs(gravity: GravityDir): { dx: number; dy: number }[] {
  switch (gravity) {
    case "DOWN":
    case "UP":
      return [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }];  // Left/Right
    case "LEFT":
    case "RIGHT":
      return [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];  // Up/Down
  }
}

// Check if a position is valid for standing with given gravity
export function canStand(
  grid: string[][],
  x: number,
  y: number,
  gravity: GravityDir,
  solidTypes: string[]
): boolean {
  // Cell must be empty (not solid)
  if (!isEmpty(grid, x, y, solidTypes)) return false;
  
  // Must have solid "floor" in gravity direction
  const floor = getFloorOffset(gravity);
  return isSolid(grid, x + floor.dx, y + floor.dy, solidTypes);
}

// Get all valid standing positions in the grid
export function getAllValidStates(
  grid: string[][],
  solidTypes: string[]
): PathNode[] {
  const states: PathNode[] = [];
  const gravities: GravityDir[] = ["DOWN", "UP", "LEFT", "RIGHT"];
  
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      for (const gravity of gravities) {
        if (canStand(grid, x, y, gravity, solidTypes)) {
          states.push({ x, y, gravity });
        }
      }
    }
  }
  
  return states;
}

// Get neighboring states reachable by walking (same gravity)
function getWalkNeighbors(
  node: PathNode,
  grid: string[][],
  solidTypes: string[]
): PathNode[] {
  const neighbors: PathNode[] = [];
  const lateralDirs = getLateralDirs(node.gravity);
  
  for (const dir of lateralDirs) {
    const newX = node.x + dir.dx;
    const newY = node.y + dir.dy;
    
    if (canStand(grid, newX, newY, node.gravity, solidTypes)) {
      neighbors.push({ x: newX, y: newY, gravity: node.gravity });
    }
  }
  
  return neighbors;
}

// Get states reachable by jumping (may change gravity)
// This is a simplified model - we check if jumping leads to a surface
function getJumpNeighbors(
  node: PathNode,
  grid: string[][],
  solidTypes: string[],
  jumpHeight: number = 5  // Max tiles the character can jump (5 allows deck transitions)
): PathNode[] {
  const neighbors: PathNode[] = [];
  const floor = getFloorOffset(node.gravity);
  
  // Jump direction is opposite to gravity (away from floor)
  const jumpDir = { dx: -floor.dx, dy: -floor.dy };
  
  // Trace upward (in jump direction) to find surfaces to land on
  for (let dist = 1; dist <= jumpHeight; dist++) {
    const checkX = node.x + jumpDir.dx * dist;
    const checkY = node.y + jumpDir.dy * dist;
    
    // If we hit a solid, we can stick to it (gravity change)
    if (isSolid(grid, checkX, checkY, solidTypes)) {
      // The landing position is one step back from the solid
      const landX = node.x + jumpDir.dx * (dist - 1);
      const landY = node.y + jumpDir.dy * (dist - 1);
      
      // Determine new gravity (opposite of jump direction = toward the surface we hit)
      let newGravity: GravityDir;
      if (jumpDir.dy < 0) newGravity = "UP";      // Jumped up, hit ceiling
      else if (jumpDir.dy > 0) newGravity = "DOWN";  // Jumped down, hit floor
      else if (jumpDir.dx < 0) newGravity = "LEFT";  // Jumped left, hit wall
      else newGravity = "RIGHT";  // Jumped right, hit wall
      
      if (canStand(grid, landX, landY, newGravity, solidTypes)) {
        neighbors.push({ x: landX, y: landY, gravity: newGravity });
      }
      break;  // Can't jump through solids
    }
    
    // Also check for lateral surfaces while in the air (walls)
    // This handles jumping and grabbing a wall mid-air
    const laterals = getLateralDirs(node.gravity);
    for (const lat of laterals) {
      const wallX = checkX + lat.dx;
      const wallY = checkY + lat.dy;
      
      if (isSolid(grid, wallX, wallY, solidTypes)) {
        // Can land on this wall with gravity toward it
        let wallGravity: GravityDir;
        if (lat.dx < 0) wallGravity = "LEFT";
        else if (lat.dx > 0) wallGravity = "RIGHT";
        else if (lat.dy < 0) wallGravity = "UP";
        else wallGravity = "DOWN";
        
        if (canStand(grid, checkX, checkY, wallGravity, solidTypes)) {
          neighbors.push({ x: checkX, y: checkY, gravity: wallGravity });
        }
      }
    }
  }
  
  return neighbors;
}

// Get states reachable by falling off an edge
function getFallNeighbors(
  node: PathNode,
  grid: string[][],
  solidTypes: string[],
  maxFall: number = 10  // Max tiles to trace fall
): PathNode[] {
  const neighbors: PathNode[] = [];
  const lateralDirs = getLateralDirs(node.gravity);
  const floor = getFloorOffset(node.gravity);
  
  // For each lateral direction, check if we can walk off and fall
  for (const lat of lateralDirs) {
    const edgeX = node.x + lat.dx;
    const edgeY = node.y + lat.dy;
    
    // If the adjacent cell is empty but has no floor, we can fall from there
    if (isEmpty(grid, edgeX, edgeY, solidTypes) && 
        !isSolid(grid, edgeX + floor.dx, edgeY + floor.dy, solidTypes)) {
      
      // Trace the fall
      for (let dist = 1; dist <= maxFall; dist++) {
        const fallX = edgeX + floor.dx * dist;
        const fallY = edgeY + floor.dy * dist;
        
        if (isSolid(grid, fallX, fallY, solidTypes)) {
          // Land one step before the solid
          const landX = edgeX + floor.dx * (dist - 1);
          const landY = edgeY + floor.dy * (dist - 1);
          
          if (canStand(grid, landX, landY, node.gravity, solidTypes)) {
            neighbors.push({ x: landX, y: landY, gravity: node.gravity });
          }
          break;
        }
        
        // Check for walls during fall (can grab and change gravity)
        for (const lat2 of lateralDirs) {
          const wallX = fallX + lat2.dx - floor.dx;  // One step back from check
          const wallY = fallY + lat2.dy - floor.dy;
          
          if (isSolid(grid, fallX + lat2.dx - floor.dx * dist, fallY + lat2.dy - floor.dy * dist, solidTypes)) {
            // Simplified: just check if there's a wall to grab
          }
        }
      }
    }
  }
  
  return neighbors;
}

// Get states reachable by stepping up/down (1 tile height difference)
// This connects shaft bottoms to deck floors
function getStepNeighbors(
  node: PathNode,
  grid: string[][],
  solidTypes: string[]
): PathNode[] {
  const neighbors: PathNode[] = [];
  const lateralDirs = getLateralDirs(node.gravity);
  const floor = getFloorOffset(node.gravity);
  
  for (const lat of lateralDirs) {
    // Check stepping up: move lateral + up one in gravity direction
    // e.g., from (17,10,DOWN) step to (16,9,DOWN)
    const stepUpX = node.x + lat.dx - floor.dx;
    const stepUpY = node.y + lat.dy - floor.dy;
    if (canStand(grid, stepUpX, stepUpY, node.gravity, solidTypes)) {
      neighbors.push({ x: stepUpX, y: stepUpY, gravity: node.gravity });
    }
    
    // Check stepping down: move lateral + down one in gravity direction  
    // e.g., from (16,9,DOWN) step to (17,10,DOWN)
    const stepDownX = node.x + lat.dx + floor.dx;
    const stepDownY = node.y + lat.dy + floor.dy;
    if (canStand(grid, stepDownX, stepDownY, node.gravity, solidTypes)) {
      neighbors.push({ x: stepDownX, y: stepDownY, gravity: node.gravity });
    }
  }
  
  return neighbors;
}

// Determine gravity dir that points *toward* a solid surface we collide with.
function gravityToward(dx: number, dy: number): GravityDir {
  if (dy < 0) return "UP";
  if (dy > 0) return "DOWN";
  if (dx < 0) return "LEFT";
  return "RIGHT";
}

function isAirCell(
  grid: string[][],
  x: number,
  y: number,
  solidTypes: string[]
): boolean {
  return isEmpty(grid, x, y, solidTypes);
}

// Airborne neighbors: simulate jump rise then fall one tile at a time.
function getAirNeighbors(
  node: PathNode,
  grid: string[][],
  solidTypes: string[]
): { node: PathNode; action: "jump" | "fall" }[] {
  const neighbors: { node: PathNode; action: "jump" | "fall" }[] = [];
  const jp = node.jumpPhase ?? 0;
  const floor = getFloorOffset(node.gravity);
  const jumpDir = { dx: -floor.dx, dy: -floor.dy };

  // Rising phase
  if (jp > 0 && jp <= MAX_JUMP_PHASE) {
    const laterals = getLateralDirs(node.gravity);

    // 1) Move one tile along jump direction ("up" relative to gravity)
    const nextX = node.x + jumpDir.dx;
    const nextY = node.y + jumpDir.dy;

    // If we collide with a solid in jump direction, we can "stick" to it (gravity changes)
    if (isSolid(grid, nextX, nextY, solidTypes)) {
      const newGravity = gravityToward(jumpDir.dx, jumpDir.dy);
      if (canStand(grid, node.x, node.y, newGravity, solidTypes)) {
        neighbors.push({ node: { x: node.x, y: node.y, gravity: newGravity, jumpPhase: 0 }, action: "jump" });
      }
    } else if (isAirCell(grid, nextX, nextY, solidTypes)) {
      const nextPhase = jp + 1;
      // After the apex, we transition into falling.
      const nextJumpPhase = nextPhase > MAX_JUMP_PHASE ? MAX_JUMP_PHASE + 1 : nextPhase;
      neighbors.push({ node: { x: nextX, y: nextY, gravity: node.gravity, jumpPhase: nextJumpPhase }, action: "jump" });
    }

    // 2) Air control: allow drifting laterally while rising
    for (const lat of laterals) {
      const driftX = node.x + lat.dx;
      const driftY = node.y + lat.dy;

      // Stick to a wall mid-air if adjacent solid laterally
      if (isSolid(grid, driftX, driftY, solidTypes)) {
        const wallGravity = gravityToward(lat.dx, lat.dy);
        if (canStand(grid, node.x, node.y, wallGravity, solidTypes)) {
          neighbors.push({ node: { x: node.x, y: node.y, gravity: wallGravity, jumpPhase: 0 }, action: "jump" });
        }
        continue;
      }

      if (isAirCell(grid, driftX, driftY, solidTypes)) {
        const nextPhase = jp + 1;
        const nextJumpPhase = nextPhase > MAX_JUMP_PHASE ? MAX_JUMP_PHASE + 1 : nextPhase;
        neighbors.push({ node: { x: driftX, y: driftY, gravity: node.gravity, jumpPhase: nextJumpPhase }, action: "jump" });
      }
    }

    return neighbors;
  }

  // Falling phase (jp > MAX_JUMP_PHASE)
  if (jp > MAX_JUMP_PHASE) {
    // Cap falling exploration so the graph stays finite.
    if (jp >= MAX_JUMP_PHASE + MAX_FALL_PHASE) return neighbors;

    const laterals = getLateralDirs(node.gravity);

    // 1) Move one tile along gravity direction
    const nextX = node.x + floor.dx;
    const nextY = node.y + floor.dy;

    // Land when the next cell in gravity direction is solid.
    if (isSolid(grid, nextX, nextY, solidTypes)) {
      if (canStand(grid, node.x, node.y, node.gravity, solidTypes)) {
        neighbors.push({ node: { x: node.x, y: node.y, gravity: node.gravity, jumpPhase: 0 }, action: "fall" });
      }
      return neighbors;
    }

    if (isAirCell(grid, nextX, nextY, solidTypes)) {
      neighbors.push({ node: { x: nextX, y: nextY, gravity: node.gravity, jumpPhase: jp + 1 }, action: "fall" });
    }

    // 2) Air control: allow drifting laterally while falling
    for (const lat of laterals) {
      const driftX = node.x + lat.dx;
      const driftY = node.y + lat.dy;

      // Stick to a wall mid-air if adjacent solid laterally
      if (isSolid(grid, driftX, driftY, solidTypes)) {
        const wallGravity = gravityToward(lat.dx, lat.dy);
        if (canStand(grid, node.x, node.y, wallGravity, solidTypes)) {
          neighbors.push({ node: { x: node.x, y: node.y, gravity: wallGravity, jumpPhase: 0 }, action: "jump" });
        }
        continue;
      }

      if (isAirCell(grid, driftX, driftY, solidTypes)) {
        neighbors.push({ node: { x: driftX, y: driftY, gravity: node.gravity, jumpPhase: jp + 1 }, action: "fall" });
      }
    }
  }

  return neighbors;
}

// Get all neighbors of a node (walk + jump + fall + step)
export function getNeighbors(
  node: PathNode,
  grid: string[][],
  solidTypes: string[]
): { node: PathNode; action: "walk" | "jump" | "fall" | "step" }[] {
  const neighbors: { node: PathNode; action: "walk" | "jump" | "fall" | "step" }[] = [];
  const jp = node.jumpPhase ?? 0;

  // Airborne: only simulate jump/fall progression.
  if (jp > 0) {
    for (const n of getAirNeighbors(node, grid, solidTypes)) {
      neighbors.push(n);
    }
    return neighbors;
  }

  // Grounded neighbors
  for (const n of getWalkNeighbors(node, grid, solidTypes)) {
    neighbors.push({ node: { ...n, jumpPhase: 0 }, action: "walk" });
  }

  // Jump start: instead of teleporting to a landing spot, enter airborne state.
  // (This replaces the old simplified jump neighbor model.)
  const floor = getFloorOffset(node.gravity);
  const jumpDir = { dx: -floor.dx, dy: -floor.dy };
  const upX = node.x + jumpDir.dx;
  const upY = node.y + jumpDir.dy;
  if (isAirCell(grid, upX, upY, solidTypes)) {
    neighbors.push({ node: { x: upX, y: upY, gravity: node.gravity, jumpPhase: 1 }, action: "jump" });
  }

  // Fall start: if there is no floor, enter falling state.
  const downX = node.x + floor.dx;
  const downY = node.y + floor.dy;
  if (!isSolid(grid, downX, downY, solidTypes)) {
    if (isAirCell(grid, downX, downY, solidTypes)) {
      neighbors.push({ node: { x: downX, y: downY, gravity: node.gravity, jumpPhase: MAX_JUMP_PHASE + 1 }, action: "fall" });
    }
  }

  // Step neighbors (1-tile height changes)
  for (const n of getStepNeighbors(node, grid, solidTypes)) {
    neighbors.push({ node: { ...n, jumpPhase: 0 }, action: "step" });
  }

  return neighbors;
}

/**
 * Precompute movement transitions for the entire ship.
 *
 * This builds an adjacency list for the full (x,y,gravity,jumpPhase) state space,
 * capped by MAX_JUMP_PHASE + MAX_FALL_PHASE for airborne exploration.
 */
export function precomputeMovements(
  grid: string[][],
  solidTypes: string[]
): MovementMap {
  const map: MovementMap = new Map();
  const gravities: GravityDir[] = ["DOWN", "UP", "LEFT", "RIGHT"];

  const maxPhase = MAX_JUMP_PHASE + MAX_FALL_PHASE;

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      for (const gravity of gravities) {
        for (let jumpPhase = 0; jumpPhase <= maxPhase; jumpPhase++) {
          // Only include grounded nodes that are actually standable.
          if (jumpPhase === 0 && !canStand(grid, x, y, gravity, solidTypes)) continue;
          // Only include airborne nodes that are in empty space.
          if (jumpPhase > 0 && !isEmpty(grid, x, y, solidTypes)) continue;

          const node: PathNode = { x, y, gravity, jumpPhase };
          const neighbors = getNeighbors(node, grid, solidTypes);
          map.set(nodeKey(node), neighbors);
        }
      }
    }
  }

  return map;
}

/**
 * BFS Pathfinding
 * Finds the shortest path from start to goal considering gravity
 */
export function transitionKey(from: PathNode, to: PathNode): string {
  return `${nodeKey(from)}->${nodeKey(to)}`;
}

function canExecuteSegment(
  grid: string[][],
  solidTypes: string[],
  seg: { from: PathNode; to: PathNode; action: MovementAction }
): { ok: true } | { ok: false; reason: string } {
  const fromJP = seg.from.jumpPhase ?? 0;
  const toJP = seg.to.jumpPhase ?? 0;

  const dx = seg.to.x - seg.from.x;
  const dy = seg.to.y - seg.from.y;

  if (seg.action === "walk") {
    if (fromJP !== 0 || toJP !== 0) return { ok: false, reason: "walk while airborne" };
    if (seg.from.gravity !== seg.to.gravity) return { ok: false, reason: "walk changed gravity" };
    const laterals = getLateralDirs(seg.from.gravity);
    const ok = laterals.some((d) => d.dx === dx && d.dy === dy);
    if (!ok) return { ok: false, reason: `walk moved (${dx},${dy}) not lateral` };
    if (!canStand(grid, seg.to.x, seg.to.y, seg.to.gravity, solidTypes)) return { ok: false, reason: "walk to non-standable" };
    return { ok: true };
  }

  if (seg.action === "step") {
    if (fromJP !== 0 || toJP !== 0) return { ok: false, reason: "step while airborne" };
    if (seg.from.gravity !== seg.to.gravity) return { ok: false, reason: "step changed gravity" };
    const laterals = getLateralDirs(seg.from.gravity);
    const floor = getFloorOffset(seg.from.gravity);
    const ok = laterals.some((lat) =>
      (dx === lat.dx - floor.dx && dy === lat.dy - floor.dy) ||
      (dx === lat.dx + floor.dx && dy === lat.dy + floor.dy)
    );
    if (!ok) return { ok: false, reason: `step moved (${dx},${dy}) not step pattern` };
    if (!canStand(grid, seg.to.x, seg.to.y, seg.to.gravity, solidTypes)) return { ok: false, reason: "step to non-standable" };
    return { ok: true };
  }

  if (seg.action === "jump") {
    const floor = getFloorOffset(seg.from.gravity);
    const jumpDir = { dx: -floor.dx, dy: -floor.dy };

    // Start jump: grounded -> airborne(1) moving one tile along jumpDir
    if (fromJP === 0 && toJP === 1) {
      if (dx !== jumpDir.dx || dy !== jumpDir.dy) return { ok: false, reason: "jump start not along jumpDir" };
      if (!isEmpty(grid, seg.to.x, seg.to.y, solidTypes)) return { ok: false, reason: "jump start into solid" };

      // Heuristic/viability rule: pure vertical jump segments that do not reach any
      // collision surface within the next few tiles are considered non-walkable.
      // This forces the solver to walk laterally to an edge/opening first.
      const isScreenVerticalJump = dx === 0;
      if (isScreenVerticalJump) {
        let foundSurfaceSoon = false;
        for (let dist = 1; dist <= 3; dist++) {
          const cx = seg.from.x + jumpDir.dx * dist;
          const cy = seg.from.y + jumpDir.dy * dist;
          if (isSolid(grid, cx, cy, solidTypes)) {
            foundSurfaceSoon = true;
            break;
          }
        }
        if (!foundSurfaceSoon) {
          return { ok: false, reason: "vertical jump: no collision surface within 3 tiles" };
        }
      }

      return { ok: true };
    }

    // Rising continuation: airborne -> airborne, moving either along jumpDir or laterally (air control)
    if (fromJP > 0 && fromJP <= MAX_JUMP_PHASE && toJP > 0) {
      const laterals = getLateralDirs(seg.from.gravity);
      const isJumpDir = dx === jumpDir.dx && dy === jumpDir.dy;
      const isLateral = laterals.some((d) => d.dx === dx && d.dy === dy);
      if (!isJumpDir && !isLateral) return { ok: false, reason: "jump rise moved in invalid direction" };
      if (!isEmpty(grid, seg.to.x, seg.to.y, solidTypes)) return { ok: false, reason: "jump rise into solid" };
      return { ok: true };
    }

    // Stick/land from airborne: same tile, gravity can change, to grounded
    if (fromJP > 0 && toJP === 0) {
      if (dx !== 0 || dy !== 0) return { ok: false, reason: "airborne->grounded should not move tiles" };
      if (!canStand(grid, seg.to.x, seg.to.y, seg.to.gravity, solidTypes)) return { ok: false, reason: "airborne->grounded not standable" };
      return { ok: true };
    }

    return { ok: false, reason: `unexpected jump phase transition ${fromJP}->${toJP}` };
  }

  if (seg.action === "fall") {
    const floor = getFloorOffset(seg.from.gravity);

    // Start fall: grounded -> falling (first fall step moves one tile along gravity)
    if (fromJP === 0 && toJP === MAX_JUMP_PHASE + 1) {
      if (dx !== floor.dx || dy !== floor.dy) return { ok: false, reason: "fall start not along gravity" };
      if (!isEmpty(grid, seg.to.x, seg.to.y, solidTypes)) return { ok: false, reason: "fall start into solid" };
      return { ok: true };
    }

    // Falling continuation: falling -> falling, move one tile along gravity or laterally (air control)
    if (fromJP > MAX_JUMP_PHASE && toJP > MAX_JUMP_PHASE) {
      const laterals = getLateralDirs(seg.from.gravity);
      const isGrav = dx === floor.dx && dy === floor.dy;
      const isLateral = laterals.some((d) => d.dx === dx && d.dy === dy);
      if (!isGrav && !isLateral) return { ok: false, reason: "fall moved in invalid direction" };
      if (!isEmpty(grid, seg.to.x, seg.to.y, solidTypes)) return { ok: false, reason: "fall into solid" };
      return { ok: true };
    }

    // Land: falling -> grounded at same tile
    if (fromJP > MAX_JUMP_PHASE && toJP === 0) {
      if (dx !== 0 || dy !== 0) return { ok: false, reason: "fall->grounded should not move tiles" };
      if (!canStand(grid, seg.to.x, seg.to.y, seg.to.gravity, solidTypes)) return { ok: false, reason: "fall->grounded not standable" };
      return { ok: true };
    }

    return { ok: false, reason: `unexpected fall phase transition ${fromJP}->${toJP}` };
  }

  return { ok: false, reason: "unknown action" };
}

function toSegments(path: PathStep[]): { from: PathNode; to: PathNode; action: MovementAction }[] {
  const segs: { from: PathNode; to: PathNode; action: MovementAction }[] = [];
  for (let i = 1; i < path.length; i++) {
    const action = path[i].action;
    if (action === "start") continue;
    segs.push({
      from: path[i - 1].node,
      to: path[i].node,
      action: action === "step" ? "step" : action === "walk" ? "walk" : action === "jump" ? "jump" : "fall",
    });
  }
  return segs;
}

export function findPath(
  grid: string[][],
  solidTypes: string[],
  start: PathNode,
  goal: { x: number; y: number; gravity?: GravityDir },
  movementMap?: MovementMap,
  blockedTransitions?: Set<string>
): PathStep[] | null {
  const startNode: PathNode = { ...start, jumpPhase: start.jumpPhase ?? 0 };

  // Validate start position (must be grounded and standable)
  if ((startNode.jumpPhase ?? 0) !== 0 || !canStand(grid, startNode.x, startNode.y, startNode.gravity, solidTypes)) {
    console.warn("Invalid start position:", startNode);
    return null;
  }
  
  // BFS setup
  const visited = new Set<string>();
  const parent = new Map<string, { node: PathNode; action: "walk" | "jump" | "fall" | "step" }>();
  const queue: PathNode[] = [startNode];
  
  visited.add(nodeKey(startNode));
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = nodeKey(current);
    
    // Check if we've reached the goal
    // If goal.gravity is specified, must match exactly
    // Otherwise, any gravity at that position counts
    if (current.x === goal.x && current.y === goal.y) {
      if (!goal.gravity || current.gravity === goal.gravity) {
        // Reconstruct path
        return reconstructPath(startNode, current, parent);
      }
    }
    
    // Explore neighbors
    const neighborList = movementMap ? (movementMap.get(nodeKey(current)) ?? []) : getNeighbors(current, grid, solidTypes);
    for (const { node: neighbor, action } of neighborList) {
      if (blockedTransitions && blockedTransitions.has(transitionKey(current, neighbor))) continue;
      const neighborKey = nodeKey(neighbor);
      
      if (!visited.has(neighborKey)) {
        visited.add(neighborKey);
        parent.set(neighborKey, { node: current, action });
        queue.push(neighbor);
      }
    }
  }
  
  // No path found
  return null;
}

// Reconstruct path from BFS parent map
function reconstructPath(
  start: PathNode,
  goal: PathNode,
  parent: Map<string, { node: PathNode; action: "walk" | "jump" | "fall" | "step" }>
): PathStep[] {
  const path: PathStep[] = [];
  let current = goal;
  
  while (nodeKey(current) !== nodeKey(start)) {
    const parentInfo = parent.get(nodeKey(current));
    if (!parentInfo) break;
    
    path.unshift({ node: current, action: parentInfo.action });
    current = parentInfo.node;
  }
  
  // Add start node
  path.unshift({ node: start, action: "start" });
  
  return path;
}

/**
 * Find path between two positions, auto-detecting current gravity
 * Useful when you just know positions, not gravity states
 */
export function findPathBetweenPositions(
  grid: string[][],
  solidTypes: string[],
  startX: number,
  startY: number,
  startGravity: GravityDir,
  goalX: number,
  goalY: number,
  goalGravity?: GravityDir,
  movementMap?: MovementMap
): PathStep[] | null {
  return findPath(
    grid,
    solidTypes,
    { x: startX, y: startY, gravity: startGravity },
    { x: goalX, y: goalY, gravity: goalGravity },
    movementMap
  );
}

/**
 * Iterative refinement: if a path contains an invalid transition, block that
 * specific transition and retry.
 */
export function findExecutablePath(
  grid: string[][],
  solidTypes: string[],
  start: PathNode,
  goal: { x: number; y: number; gravity?: GravityDir },
  movementMap: MovementMap,
  blockedTransitions: Set<string> = new Set(),
  maxRetries: number = 30
): { path: PathStep[]; segments: PathSegment[] } | null {
  if (maxRetries <= 0) return null;

  const path = findPath(grid, solidTypes, start, goal, movementMap, blockedTransitions);
  if (!path) return null;

  const segmentsRaw = toSegments(path);
  const segments: PathSegment[] = segmentsRaw.map((s) => {
    const exec = canExecuteSegment(grid, solidTypes, s);
    const fromJP = s.from.jumpPhase ?? 0;
    const toJP = s.to.jumpPhase ?? 0;

    // Higher-level classification
    let type: SegmentType = s.action;
    if (s.action === "jump" && fromJP > 0 && toJP === 0 && s.from.gravity !== s.to.gravity) {
      type = "jumpAcross";
    }

    if (!exec.ok) type = "invalid";

    return exec.ok
      ? { ...s, type, viability: "ok" }
      : { ...s, type, viability: "invalid", reason: exec.reason };
  });

  const bad = segments.find((s) => s.viability === "invalid");
  if (!bad) return { path, segments };

  blockedTransitions.add(transitionKey(bad.from, bad.to));
  return findExecutablePath(grid, solidTypes, start, goal, movementMap, blockedTransitions, maxRetries - 1);
}

export function buildPathSegments(
  grid: string[][],
  solidTypes: string[],
  path: PathStep[]
): PathSegment[] {
  const segmentsRaw = toSegments(path);
  return segmentsRaw.map((s) => {
    const exec = canExecuteSegment(grid, solidTypes, s);
    const fromJP = s.from.jumpPhase ?? 0;
    const toJP = s.to.jumpPhase ?? 0;

    let type: SegmentType = s.action;
    if (s.action === "jump" && fromJP > 0 && toJP === 0 && s.from.gravity !== s.to.gravity) {
      type = "jumpAcross";
    }

    if (!exec.ok) type = "invalid";

    return exec.ok
      ? { ...s, type, viability: "ok" }
      : { ...s, type, viability: "invalid", reason: exec.reason };
  });
}

export interface IncrementalSearchState {
  start: PathNode;
  goal: { x: number; y: number; gravity?: GravityDir };
  visited: Set<string>;
  parent: Map<string, { node: PathNode; action: MovementAction }>;
  queue: PathNode[];
  done: boolean;
  foundKey?: string;
}

export function createIncrementalSearch(
  start: PathNode,
  goal: { x: number; y: number; gravity?: GravityDir }
): IncrementalSearchState {
  const s: PathNode = { ...start, jumpPhase: start.jumpPhase ?? 0 };
  return {
    start: s,
    goal,
    visited: new Set([nodeKey(s)]),
    parent: new Map(),
    queue: [s],
    done: false,
    foundKey: undefined,
  };
}

function matchesGoal(node: PathNode, goal: { x: number; y: number; gravity?: GravityDir }): boolean {
  if (node.x !== goal.x || node.y !== goal.y) return false;
  if (goal.gravity && node.gravity !== goal.gravity) return false;
  // We only consider goal reached when grounded.
  if ((node.jumpPhase ?? 0) !== 0) return false;
  return true;
}

export function stepIncrementalSearch(
  state: IncrementalSearchState,
  grid: string[][],
  solidTypes: string[],
  movementMap: MovementMap,
  blockedTransitions: Set<string>,
  budget: number
): { status: "searching" } | { status: "found"; path: PathStep[]; segments: PathSegment[] } | { status: "not_found" } {
  if (state.done) {
    if (state.foundKey) {
      const goalNode = parseKey(state.foundKey);
      const path = reconstructPath(state.start, goalNode, state.parent as any);
      return { status: "found", path, segments: buildPathSegments(grid, solidTypes, path) };
    }
    return { status: "not_found" };
  }

  for (let i = 0; i < budget; i++) {
    const current = state.queue.shift();
    if (!current) {
      state.done = true;
      state.foundKey = undefined;
      return { status: "not_found" };
    }

    if (matchesGoal(current, state.goal)) {
      state.done = true;
      state.foundKey = nodeKey(current);
      const path = reconstructPath(state.start, current, state.parent as any);
      return { status: "found", path, segments: buildPathSegments(grid, solidTypes, path) };
    }

    const neighbors = movementMap.get(nodeKey(current)) ?? [];
    for (const { node: neighbor, action } of neighbors) {
      // skip blocked transitions
      const tKey = transitionKey(current, neighbor);
      if (blockedTransitions.has(tKey)) continue;

      // Validate *walkability* as we expand. If not viable, learn it.
      const exec = canExecuteSegment(grid, solidTypes, { from: current, to: neighbor, action });
      if (!exec.ok) {
        blockedTransitions.add(tKey);
        continue;
      }

      const nKey = nodeKey(neighbor);
      if (state.visited.has(nKey)) continue;
      state.visited.add(nKey);
      state.parent.set(nKey, { node: current, action });
      state.queue.push(neighbor);
    }
  }

  return { status: "searching" };
}

/**
 * Debug: Print path in human-readable format
 */
export function describePath(path: PathStep[]): string {
  if (!path || path.length === 0) return "No path";
  
  const descriptions: string[] = [];
  
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const { x, y, gravity } = step.node;
    
    if (step.action === "start") {
      descriptions.push(`Start at (${x}, ${y}) with gravity ${gravity}`);
    } else if (step.action === "walk") {
      const prev = path[i - 1].node;
      const dx = x - prev.x;
      const dy = y - prev.y;
      const dir = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
      descriptions.push(`Walk ${dir} to (${x}, ${y})`);
    } else if (step.action === "jump") {
      descriptions.push(`Jump to (${x}, ${y}), gravity → ${gravity}`);
    } else if (step.action === "fall") {
      descriptions.push(`Fall to (${x}, ${y})`);
    } else if (step.action === "step") {
      const prev = path[i - 1].node;
      const dy = y - prev.y;
      const dir = dy > 0 ? "down" : "up";
      descriptions.push(`Step ${dir} to (${x}, ${y})`);
    }
  }
  
  return descriptions.join("\n");
}

/**
 * Get a navigation graph summary for debugging
 */
export function getNavigationStats(
  grid: string[][],
  solidTypes: string[]
): { 
  totalStates: number;
  byGravity: Record<GravityDir, number>;
  walkableArea: number;
} {
  const states = getAllValidStates(grid, solidTypes);
  const byGravity: Record<GravityDir, number> = {
    DOWN: 0, UP: 0, LEFT: 0, RIGHT: 0
  };
  
  const uniquePositions = new Set<string>();
  
  for (const state of states) {
    byGravity[state.gravity]++;
    uniquePositions.add(`${state.x},${state.y}`);
  }
  
  return {
    totalStates: states.length,
    byGravity,
    walkableArea: uniquePositions.size
  };
}
