/**
 * Vector-Based Collision System
 * Line-segment collision for tiles that works in all gravity directions
 */

export interface CollisionSegment {
  x1: number;  // Start point (relative to tile, 0-1 normalized)
  y1: number;
  x2: number;  // End point
  y2: number;
  normal: { x: number; y: number };  // Surface normal (points away from solid)
  oneWay?: boolean;  // Only collide from normal direction (platforms)
}

// Tile collision definitions - each tile is a set of line segments
export const TILE_COLLISION: Record<string, CollisionSegment[]> = {
  // Solid tile = 4 edges forming a box
  "floor": [
    { x1: 0, y1: 0, x2: 1, y2: 0, normal: { x: 0, y: -1 } },  // Top edge
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },   // Right edge
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },   // Bottom edge
    { x1: 0, y1: 1, x2: 0, y2: 0, normal: { x: -1, y: 0 } },  // Left edge
  ],
  
  // Hull tiles (same as floor - solid box)
  "hull": [
    { x1: 0, y1: 0, x2: 1, y2: 0, normal: { x: 0, y: -1 } },
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },
    { x1: 0, y1: 1, x2: 0, y2: 0, normal: { x: -1, y: 0 } },
  ],
  
  "hullLight": [
    { x1: 0, y1: 0, x2: 1, y2: 0, normal: { x: 0, y: -1 } },
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },
    { x1: 0, y1: 1, x2: 0, y2: 0, normal: { x: -1, y: 0 } },
  ],
  
  // Console/Desk tiles (solid box)
  "console": [
    { x1: 0, y1: 0, x2: 1, y2: 0, normal: { x: 0, y: -1 } },
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },
    { x1: 0, y1: 1, x2: 0, y2: 0, normal: { x: -1, y: 0 } },
  ],
  
  "desk": [
    { x1: 0, y1: 0, x2: 1, y2: 0, normal: { x: 0, y: -1 } },
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },
    { x1: 0, y1: 1, x2: 0, y2: 0, normal: { x: -1, y: 0 } },
  ],
  
  // === SLOPE TILES (45° diagonals) ===
  
  // slopeBR (◢) - solid bottom-right, walkable diagonal from bottom-left to top-right
  // Player walks UP going RIGHT
  "slopeBR": [
    { x1: 0, y1: 1, x2: 1, y2: 0, normal: { x: 0.707, y: -0.707 } },  // Diagonal surface (NE normal)
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },           // Right edge
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },           // Bottom edge
  ],
  
  // slopeBL (◣) - solid bottom-left, walkable diagonal from bottom-right to top-left
  // Player walks UP going LEFT
  "slopeBL": [
    { x1: 1, y1: 1, x2: 0, y2: 0, normal: { x: -0.707, y: -0.707 } }, // Diagonal surface (NW normal)
    { x1: 0, y1: 0, x2: 0, y2: 1, normal: { x: -1, y: 0 } },          // Left edge
    { x1: 0, y1: 1, x2: 1, y2: 1, normal: { x: 0, y: 1 } },           // Bottom edge
  ],
  
  // slopeUR (◥) - solid upper-right, ceiling slope
  "slopeUR": [
    { x1: 0, y1: 0, x2: 1, y2: 1, normal: { x: 0.707, y: 0.707 } },   // Diagonal surface (SE normal)
    { x1: 1, y1: 1, x2: 1, y2: 0, normal: { x: 1, y: 0 } },           // Right edge
    { x1: 1, y1: 0, x2: 0, y2: 0, normal: { x: 0, y: -1 } },          // Top edge
  ],
  
  // slopeUL (◤) - solid upper-left, ceiling slope
  "slopeUL": [
    { x1: 1, y1: 0, x2: 0, y2: 1, normal: { x: -0.707, y: 0.707 } },  // Diagonal surface (SW normal)
    { x1: 0, y1: 1, x2: 0, y2: 0, normal: { x: -1, y: 0 } },          // Left edge
    { x1: 0, y1: 0, x2: 1, y2: 0, normal: { x: 0, y: -1 } },          // Top edge
  ],
};

// Line segment intersection test
// Returns the parameter t (0-1) along the ray where intersection occurs, or null if no intersection
export function lineIntersection(
  rayX: number, rayY: number,      // Ray start point
  rayDx: number, rayDy: number,    // Ray direction (normalized)
  segX1: number, segY1: number,    // Segment start
  segX2: number, segY2: number,    // Segment end
  maxDistance: number               // Maximum ray distance to check
): { t: number; point: { x: number; y: number } } | null {
  // Ray: P = (rayX, rayY) + t * (rayDx, rayDy)
  // Segment: Q = (segX1, segY1) + s * (segX2 - segX1, segY2 - segY1)
  // Solve: P = Q for t and s
  
  const segDx = segX2 - segX1;
  const segDy = segY2 - segY1;
  
  // Cross product to check if parallel
  const cross = rayDx * segDy - rayDy * segDx;
  if (Math.abs(cross) < 0.0001) return null; // Parallel
  
  // Solve for t and s
  const dx = segX1 - rayX;
  const dy = segY1 - rayY;
  
  const t = (dx * segDy - dy * segDx) / cross;
  const s = (dx * rayDy - dy * rayDx) / cross;
  
  // Check if intersection is within bounds
  if (t < 0 || t > maxDistance) return null;  // Ray doesn't reach
  if (s < 0 || s > 1) return null;            // Outside segment
  
  return {
    t,
    point: {
      x: rayX + t * rayDx,
      y: rayY + t * rayDy,
    },
  };
}

export interface SensorHit {
  distance: number;
  point: { x: number; y: number };
  normal: { x: number; y: number };
  tileX: number;
  tileY: number;
  segment: CollisionSegment;
}

// Cast a sensor ray and find the closest collision
export function castSensor(
  x: number, y: number,              // Sensor position (world space)
  dirX: number, dirY: number,        // Direction (normalized)
  maxDistance: number,               // Max ray length
  tileGrid: string[][],              // Tile map
  tileSize: number                   // Tile size in pixels
): SensorHit | null {
  let closestHit: SensorHit | null = null;
  let closestDistance = maxDistance;
  
  // Determine which tiles the ray might intersect (simple grid traversal)
  const startTileX = Math.floor(x / tileSize);
  const startTileY = Math.floor(y / tileSize);
  
  // Check tiles in a radius around the start point (simple approach)
  const tileRadius = Math.ceil(maxDistance / tileSize) + 1;
  
  for (let ty = startTileY - tileRadius; ty <= startTileY + tileRadius; ty++) {
    for (let tx = startTileX - tileRadius; tx <= startTileX + tileRadius; tx++) {
      // Check bounds
      if (ty < 0 || ty >= tileGrid.length) continue;
      if (tx < 0 || tx >= tileGrid[0].length) continue;
      
      const tileType = tileGrid[ty][tx];
      const segments = TILE_COLLISION[tileType];
      if (!segments) continue;
      
      // Check each segment in this tile
      for (const segment of segments) {
        // Convert segment to world space
        const segX1 = tx * tileSize + segment.x1 * tileSize;
        const segY1 = ty * tileSize + segment.y1 * tileSize;
        const segX2 = tx * tileSize + segment.x2 * tileSize;
        const segY2 = ty * tileSize + segment.y2 * tileSize;
        
        const hit = lineIntersection(
          x, y,
          dirX, dirY,
          segX1, segY1, segX2, segY2,
          maxDistance
        );
        
        if (hit && hit.t < closestDistance) {
          // Check if we're approaching from the correct side (for one-way platforms)
          if (segment.oneWay) {
            const dot = dirX * segment.normal.x + dirY * segment.normal.y;
            if (dot >= 0) continue; // Wrong side
          }
          
          closestDistance = hit.t;
          closestHit = {
            distance: hit.t,
            point: hit.point,
            normal: segment.normal,
            tileX: tx,
            tileY: ty,
            segment,
          };
        }
      }
    }
  }
  
  return closestHit;
}

// Character sensor configuration (relative positions)
// These are offsets from the character's position, rotated based on gravity
export interface SensorConfig {
  floorLeft: { x: number; y: number };
  floorRight: { x: number; y: number };
  floorCenter: { x: number; y: number };
  ceilLeft: { x: number; y: number };
  ceilRight: { x: number; y: number };
  wallLeft: { x: number; y: number };
  wallRight: { x: number; y: number };
}

// Get sensor positions relative to character (for DOWN gravity)
// These positions represent the character's collision box edges
export function getBaseSensorPositions(width: number, height: number): SensorConfig {
  return {
    // Floor sensors at bottom edge
    floorLeft: { x: 4, y: height },
    floorRight: { x: width - 4, y: height },
    floorCenter: { x: width / 2, y: height },
    
    // Ceiling sensors at top edge
    ceilLeft: { x: 4, y: 0 },
    ceilRight: { x: width - 4, y: 0 },
    
    // Wall sensors at mid-height
    wallLeft: { x: 0, y: height / 2 },
    wallRight: { x: width, y: height / 2 },
  };
}

// Rotate sensor positions based on gravity direction
export function rotateSensors(
  sensors: SensorConfig,
  gravity: string,  // "DOWN" | "UP" | "LEFT" | "RIGHT"
  charWidth: number,
  charHeight: number
): SensorConfig {
  const rotate = (x: number, y: number): { x: number; y: number } => {
    switch (gravity) {
      case "DOWN": return { x, y };
      case "UP": return { x: charWidth - x, y: charHeight - y };
      case "LEFT": return { x: y, y: charWidth - x };
      case "RIGHT": return { x: charHeight - y, y: x };
      default: return { x, y };
    }
  };
  
  return {
    floorLeft: rotate(sensors.floorLeft.x, sensors.floorLeft.y),
    floorRight: rotate(sensors.floorRight.x, sensors.floorRight.y),
    floorCenter: rotate(sensors.floorCenter.x, sensors.floorCenter.y),
    ceilLeft: rotate(sensors.ceilLeft.x, sensors.ceilLeft.y),
    ceilRight: rotate(sensors.ceilRight.x, sensors.ceilRight.y),
    wallLeft: rotate(sensors.wallLeft.x, sensors.wallLeft.y),
    wallRight: rotate(sensors.wallRight.x, sensors.wallRight.y),
  };
}

// Get the direction vector for gravity
export function getGravityDirection(gravity: string): { x: number; y: number } {
  switch (gravity) {
    case "DOWN": return { x: 0, y: 1 };
    case "UP": return { x: 0, y: -1 };
    case "LEFT": return { x: -1, y: 0 };
    case "RIGHT": return { x: 1, y: 0 };
    default: return { x: 0, y: 1 };
  }
}

// Get perpendicular direction (for wall sensors)
export function getPerpendicularDirection(gravity: string, right: boolean): { x: number; y: number } {
  const g = getGravityDirection(gravity);
  // Perpendicular is (-y, x) for left, (y, -x) for right
  if (right) {
    return { x: -g.y, y: g.x };
  } else {
    return { x: g.y, y: -g.x };
  }
}

export interface CollisionResult {
  grounded: boolean;
  ceilinged: boolean;
  walledLeft: boolean;
  walledRight: boolean;
  groundNormal: { x: number; y: number } | null;
  groundPoint: { x: number; y: number } | null;
  adjustment: { x: number; y: number };
}

// Check if a point is inside a solid tile
function isPointInSolid(
  px: number, py: number,
  tileGrid: string[][],
  tileSize: number
): { solid: boolean; tileX: number; tileY: number } {
  const tx = Math.floor(px / tileSize);
  const ty = Math.floor(py / tileSize);
  
  if (ty < 0 || ty >= tileGrid.length || tx < 0 || tx >= tileGrid[0].length) {
    return { solid: false, tileX: tx, tileY: ty };
  }
  
  const tile = tileGrid[ty][tx];
  // Check if tile has collision segments (meaning it's solid)
  const solid = TILE_COLLISION[tile] !== undefined && TILE_COLLISION[tile].length > 0;
  return { solid, tileX: tx, tileY: ty };
}

// Main collision detection for character
export function checkCollisions(
  x: number, y: number,
  width: number, height: number,
  vx: number, vy: number,
  gravity: string,
  tileGrid: string[][],
  tileSize: number
): CollisionResult {
  const result: CollisionResult = {
    grounded: false,
    ceilinged: false,
    walledLeft: false,
    walledRight: false,
    groundNormal: null,
    groundPoint: null,
    adjustment: { x: 0, y: 0 },
  };
  
  const baseSensors = getBaseSensorPositions(width, height);
  const sensors = rotateSensors(baseSensors, gravity, width, height);
  
  const gravDir = getGravityDirection(gravity);
  const sensorRange = tileSize * 1.5; // Increased range for better detection
  
  // Calculate velocity in gravity direction
  // Positive = falling toward floor, Negative = jumping away from floor
  const gravVelocity = vx * gravDir.x + vy * gravDir.y;
  const isJumpingUp = gravVelocity < -0.5; // Moving away from floor with significant velocity
  
  // First, check if feet are inside a solid tile (overlap detection)
  const footCheck = isPointInSolid(
    x + sensors.floorCenter.x,
    y + sensors.floorCenter.y,
    tileGrid,
    tileSize
  );
  
  if (footCheck.solid) {
    // Feet are inside a solid tile - push out in opposite of gravity direction
    const tileTop = footCheck.tileY * tileSize;
    const footY = y + sensors.floorCenter.y;
    const overlap = footY - tileTop;
    
    if (overlap > 0 && overlap < tileSize) {
      // Push feet to top of tile
      result.adjustment.y = -overlap;
      // Only ground if not jumping upward (prevents instant re-ground after jump)
      result.grounded = !isJumpingUp;
      result.groundNormal = { x: 0, y: -1 };
      return result; // Early exit - overlap takes priority
    }
  }
  
  // Floor sensors (cast in gravity direction)
  const floorHits = [
    castSensor(
      x + sensors.floorLeft.x, y + sensors.floorLeft.y,
      gravDir.x, gravDir.y,
      sensorRange,
      tileGrid, tileSize
    ),
    castSensor(
      x + sensors.floorCenter.x, y + sensors.floorCenter.y,
      gravDir.x, gravDir.y,
      sensorRange,
      tileGrid, tileSize
    ),
    castSensor(
      x + sensors.floorRight.x, y + sensors.floorRight.y,
      gravDir.x, gravDir.y,
      sensorRange,
      tileGrid, tileSize
    ),
  ].filter(h => h !== null) as SensorHit[];
  
  if (floorHits.length > 0) {
    // Find closest floor hit
    const closest = floorHits.reduce((a, b) => a.distance < b.distance ? a : b);
    
    // Grounded only when:
    // 1. Very close to surface (within 3 pixels)
    // 2. NOT jumping upward (prevents instant re-ground after jump)
    const groundedThreshold = 3;
    
    if (closest.distance < groundedThreshold && !isJumpingUp) {
      result.grounded = true;
      result.groundNormal = closest.normal;
      result.groundPoint = closest.point;
      
      // Snap to surface if not already touching
      if (closest.distance > 0.5) {
        result.adjustment.x = -gravDir.x * closest.distance;
        result.adjustment.y = -gravDir.y * closest.distance;
      }
    } else if (closest.distance < sensorRange) {
      // Not grounded but floor detected - will land soon
      // Store ground info for landing, but don't set grounded=true
      result.groundNormal = closest.normal;
      result.groundPoint = closest.point;
    }
  }
  
  // Ceiling sensors (cast opposite to gravity)
  const ceilDir = { x: -gravDir.x, y: -gravDir.y };
  const ceilHits = [
    castSensor(
      x + sensors.ceilLeft.x, y + sensors.ceilLeft.y,
      ceilDir.x, ceilDir.y,
      sensorRange,
      tileGrid, tileSize
    ),
    castSensor(
      x + sensors.ceilRight.x, y + sensors.ceilRight.y,
      ceilDir.x, ceilDir.y,
      sensorRange,
      tileGrid, tileSize
    ),
  ].filter(h => h !== null) as SensorHit[];
  
  if (ceilHits.length > 0) {
    const closest = ceilHits.reduce((a, b) => a.distance < b.distance ? a : b);
    if (closest.distance < 4) {
      result.ceilinged = true;
      // Push AWAY from ceiling (opposite of ceiling direction = toward gravity)
      result.adjustment.x += gravDir.x * closest.distance;
      result.adjustment.y += gravDir.y * closest.distance;
    }
  }
  
  // Wall sensors (perpendicular to gravity)
  const leftDir = getPerpendicularDirection(gravity, false);
  const rightDir = getPerpendicularDirection(gravity, true);
  
  const leftHit = castSensor(
    x + sensors.wallLeft.x, y + sensors.wallLeft.y,
    leftDir.x, leftDir.y,
    sensorRange,
    tileGrid, tileSize
  );
  
  const rightHit = castSensor(
    x + sensors.wallRight.x, y + sensors.wallRight.y,
    rightDir.x, rightDir.y,
    sensorRange,
    tileGrid, tileSize
  );
  
  if (leftHit && leftHit.distance < 4) {
    result.walledLeft = true;
    result.adjustment.x += -leftDir.x * leftHit.distance;
    result.adjustment.y += -leftDir.y * leftHit.distance;
  }
  
  if (rightHit && rightHit.distance < 4) {
    result.walledRight = true;
    result.adjustment.x += -rightDir.x * rightHit.distance;
    result.adjustment.y += -rightDir.y * rightHit.distance;
  }
  
  return result;
}
