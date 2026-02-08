/**
 * Bitship Pathfinding System
 * BFS-based pathfinding for multi-gravity navigation
 * 
 * The state space is (x, y, gravity) tuples, not just (x, y).
 * This allows pathfinding across gravity transitions.
 */

export type GravityDir = "DOWN" | "UP" | "LEFT" | "RIGHT";

// A node in the pathfinding graph
export interface PathNode {
  x: number;
  y: number;
  gravity: GravityDir;
}

// An edge represents a possible movement
export interface PathEdge {
  action: "walk" | "jump" | "fall";
  cost: number;  // For weighted pathfinding later (BFS uses cost=1)
}

// A step in a path (node + how we got there)
export interface PathStep {
  node: PathNode;
  action: "start" | "walk" | "jump" | "fall";
}

// Serialize node for use as map key
function nodeKey(node: PathNode): string {
  return `${node.x},${node.y},${node.gravity}`;
}

// Parse node from key
function parseKey(key: string): PathNode {
  const [x, y, gravity] = key.split(",");
  return { x: parseInt(x), y: parseInt(y), gravity: gravity as GravityDir };
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
  jumpHeight: number = 3  // Max tiles the character can jump
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

// Get all neighbors of a node (walk + jump + fall)
export function getNeighbors(
  node: PathNode,
  grid: string[][],
  solidTypes: string[]
): { node: PathNode; action: "walk" | "jump" | "fall" }[] {
  const neighbors: { node: PathNode; action: "walk" | "jump" | "fall" }[] = [];
  
  // Walking neighbors
  for (const n of getWalkNeighbors(node, grid, solidTypes)) {
    neighbors.push({ node: n, action: "walk" });
  }
  
  // Jump neighbors (gravity changes)
  for (const n of getJumpNeighbors(node, grid, solidTypes)) {
    neighbors.push({ node: n, action: "jump" });
  }
  
  // Fall neighbors
  for (const n of getFallNeighbors(node, grid, solidTypes)) {
    neighbors.push({ node: n, action: "fall" });
  }
  
  return neighbors;
}

/**
 * BFS Pathfinding
 * Finds the shortest path from start to goal considering gravity
 */
export function findPath(
  grid: string[][],
  solidTypes: string[],
  start: PathNode,
  goal: { x: number; y: number; gravity?: GravityDir }
): PathStep[] | null {
  // Validate start position
  if (!canStand(grid, start.x, start.y, start.gravity, solidTypes)) {
    console.warn("Invalid start position:", start);
    return null;
  }
  
  // BFS setup
  const visited = new Set<string>();
  const parent = new Map<string, { node: PathNode; action: "walk" | "jump" | "fall" }>();
  const queue: PathNode[] = [start];
  
  visited.add(nodeKey(start));
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = nodeKey(current);
    
    // Check if we've reached the goal
    // If goal.gravity is specified, must match exactly
    // Otherwise, any gravity at that position counts
    if (current.x === goal.x && current.y === goal.y) {
      if (!goal.gravity || current.gravity === goal.gravity) {
        // Reconstruct path
        return reconstructPath(start, current, parent);
      }
    }
    
    // Explore neighbors
    for (const { node: neighbor, action } of getNeighbors(current, grid, solidTypes)) {
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
  parent: Map<string, { node: PathNode; action: "walk" | "jump" | "fall" }>
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
  goalGravity?: GravityDir
): PathStep[] | null {
  return findPath(
    grid,
    solidTypes,
    { x: startX, y: startY, gravity: startGravity },
    { x: goalX, y: goalY, gravity: goalGravity }
  );
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
