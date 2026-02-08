/**
 * Bitship Physics Controller
 * 2D Platformer with omnidirectional gravity (gravity boots)
 */

// Gravity directions (4 cardinal for now, 8 with diagonals later)
export type GravityDirection = "DOWN" | "UP" | "LEFT" | "RIGHT";

// Physics constants
export const PHYSICS = {
  // Gravity & jumping
  GRAVITY: 0.35,          // Acceleration per frame
  JUMP_FORCE: 6.67,          // Initial jump velocity (~2 tile height)
  MAX_FALL_SPEED: 6,      // Terminal velocity
  
  // Ground movement (smooth acceleration model)
  GROUND_MAX_SPEED: 5,    // Max run speed on ground
  GROUND_ACCEL: 0.8,      // Acceleration toward target speed
  GROUND_DECEL: 0.6,      // Deceleration when no input (friction)
  
  // Air movement
  AIR_MAX_SPEED: 4,       // Max horizontal speed in air
  AIR_ACCEL: 0.5,        // Air control acceleration (reduced)
  AIR_DECEL: 0.02,        // Very low air friction (space station!)
  
  TILE_SIZE: 32,
};

// Character physics state
export interface PhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: GravityDirection;
  grounded: boolean;
  width: number;
  height: number;
  jumpHeld: boolean;  // Track if jump was held last frame (for edge detection)
  onSlope: boolean;   // Currently on a slope (for stair dilemma fix)
}

// Collision result
export interface CollisionResult {
  collided: boolean;
  surfaceNormal: GravityDirection | null;
  tileX: number;
  tileY: number;
}

// Triangle slope types (named by which corner is solid)
export const SLOPE_TILES = ["slopeBL", "slopeBR", "slopeUL", "slopeUR"];

// Check if a point is inside the solid part of a triangle tile
// Returns true if the point should collide with this triangle
export function isPointInSlopeSolid(
  tileType: string,
  px: number, // Point x relative to tile (0-32)
  py: number  // Point y relative to tile (0-32)
): boolean {
  const size = PHYSICS.TILE_SIZE;
  // Normalize to 0-1 (y=0 is top, y=1 is bottom in screen coords)
  const nx = px / size;
  const ny = py / size;
  
  switch (tileType) {
    case "slopeBL": // ◣ solid bottom-left, diagonal y=x from (0,0) to (1,1)
      // Solid where: y >= x (below/on the diagonal)
      return ny >= nx;
    case "slopeBR": // ◢ solid bottom-right, diagonal y=1-x from (1,0) to (0,1)
      // Solid where: y >= 1-x (below/on the diagonal)
      return ny >= 1 - nx;
    case "slopeUL": // ◤ solid upper-left, diagonal y=1-x from (1,0) to (0,1)
      // Solid where: y <= 1-x (above/on the diagonal)
      return ny <= 1 - nx;
    case "slopeUR": // ◥ solid upper-right, diagonal y=x from (0,0) to (1,1)
      // Solid where: y <= x (above/on the diagonal)
      return ny <= nx;
    default:
      return false;
  }
}

// Get the surface normal for a triangle slope (the 45° diagonal surface)
export function getSlopeNormal(tileType: string): GravityDirection {
  // Surface normal points AWAY from the solid part
  switch (tileType) {
    case "slopeBL": return "UP";     // ◣ surface faces up-right, simplified to UP for now
    case "slopeBR": return "UP";     // ◢ surface faces up-left, simplified to UP for now
    case "slopeUL": return "DOWN";   // ◤ surface faces down-right, simplified to DOWN
    case "slopeUR": return "DOWN";   // ◥ surface faces down-left, simplified to DOWN
    default: return "DOWN";
  }
}

// Get the Y position of a slope surface at a given X position
// Returns the Y coordinate of the diagonal surface at that X
export function getSlopeSurfaceY(
  tileType: string,
  tileLeft: number,
  tileTop: number,
  footX: number
): number | null {
  const tileSize = PHYSICS.TILE_SIZE;
  const relX = footX - tileLeft;
  
  // Only valid if footX is within tile bounds
  if (relX < 0 || relX > tileSize) return null;
  
  const normalizedX = relX / tileSize;
  
  switch (tileType) {
    case "slopeBL": // ◣ surface goes from top-left (y=0) to bottom-right (y=1)
      return tileTop + normalizedX * tileSize;
    case "slopeBR": // ◢ surface goes from top-right (y=0) to bottom-left (y=1)
      return tileTop + (1 - normalizedX) * tileSize;
    case "slopeUL": // ◤ ceiling slope - top-right to bottom-left
      return tileTop + (1 - normalizedX) * tileSize;
    case "slopeUR": // ◥ ceiling slope - top-left to bottom-right
      return tileTop + normalizedX * tileSize;
    default:
      return null;
  }
}

// Check if a slope is a floor slope (walkable from above)
export function isFloorSlope(tileType: string): boolean {
  return tileType === "slopeBL" || tileType === "slopeBR";
}

// Tile types for collision
export type TileType = "empty" | "solid" | "platform"; // platform = solid from above only

// Get the direction vector for a gravity direction
export function getGravityVector(gravity: GravityDirection): { x: number; y: number } {
  switch (gravity) {
    case "DOWN": return { x: 0, y: 1 };
    case "UP": return { x: 0, y: -1 };
    case "LEFT": return { x: -1, y: 0 };
    case "RIGHT": return { x: 1, y: 0 };
  }
}

// Get rotation angle in degrees for rendering
export function getGravityRotation(gravity: GravityDirection): number {
  switch (gravity) {
    case "DOWN": return 0;
    case "LEFT": return 90;
    case "UP": return 180;
    case "RIGHT": return 270;
  }
}

// Get the "up" direction relative to current gravity (for jumping)
export function getJumpVector(gravity: GravityDirection): { x: number; y: number } {
  const grav = getGravityVector(gravity);
  return { x: -grav.x, y: -grav.y };
}

// Get "right" direction relative to current gravity (for horizontal movement)
export function getMoveRightVector(gravity: GravityDirection): { x: number; y: number } {
  switch (gravity) {
    case "DOWN": return { x: 1, y: 0 };
    case "UP": return { x: -1, y: 0 };
    case "LEFT": return { x: 0, y: 1 };   // Wall on left, "right" is down
    case "RIGHT": return { x: 0, y: -1 }; // Wall on right, "right" is up
  }
}

// Determine which face of a tile was hit based on approach direction
export function getSurfaceNormal(
  charX: number, charY: number,
  charW: number, charH: number,
  tileX: number, tileY: number,
  vx: number, vy: number
): GravityDirection {
  const tileSize = PHYSICS.TILE_SIZE;
  const tileCenterX = tileX * tileSize + tileSize / 2;
  const tileCenterY = tileY * tileSize + tileSize / 2;
  const charCenterX = charX + charW / 2;
  const charCenterY = charY + charH / 2;
  
  // Calculate overlap on each axis
  const dx = charCenterX - tileCenterX;
  const dy = charCenterY - tileCenterY;
  
  // Determine which face based on position and velocity
  const overlapX = (charW / 2 + tileSize / 2) - Math.abs(dx);
  const overlapY = (charH / 2 + tileSize / 2) - Math.abs(dy);
  
  // The face with less overlap is the one we hit
  if (overlapX < overlapY) {
    // Hit left or right face
    return dx > 0 ? "LEFT" : "RIGHT";
  } else {
    // Hit top or bottom face
    return dy > 0 ? "UP" : "DOWN";
  }
}

// Check if a tile is solid
export function isTileSolid(
  tileGrid: string[][],
  tileX: number,
  tileY: number,
  solidTypes: string[]
): boolean {
  if (tileY < 0 || tileY >= tileGrid.length) return false;
  if (tileX < 0 || tileX >= tileGrid[0].length) return false;
  return solidTypes.includes(tileGrid[tileY][tileX]);
}

// Get all tiles the character overlaps with
export function getOverlappingTiles(
  x: number, y: number, w: number, h: number
): { x: number; y: number }[] {
  const tileSize = PHYSICS.TILE_SIZE;
  const tiles: { x: number; y: number }[] = [];
  
  const startX = Math.floor(x / tileSize);
  const endX = Math.floor((x + w - 1) / tileSize);
  const startY = Math.floor(y / tileSize);
  const endY = Math.floor((y + h - 1) / tileSize);
  
  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      tiles.push({ x: tx, y: ty });
    }
  }
  
  return tiles;
}

// Screen-relative input (raw WASD)
export interface ScreenInput {
  up: boolean;     // W - toward top of screen
  down: boolean;   // S - toward bottom of screen
  left: boolean;   // A - toward left of screen
  right: boolean;  // D - toward right of screen
  jump: boolean;   // Space
}

// Gravity-relative input (what the character perceives)
export interface GravityRelativeInput {
  forward: boolean;  // Away from floor (jump direction) - NO air thrust
  back: boolean;     // Toward floor
  left: boolean;     // Perpendicular to gravity (air control OK)
  right: boolean;    // Perpendicular to gravity (air control OK)
  jump: boolean;
}

// Convert screen input to gravity-relative input
// WASD meaning shifts based on which way gravity pulls
export function toGravityRelative(input: ScreenInput, gravity: GravityDirection): GravityRelativeInput {
  switch (gravity) {
    case "DOWN": // Normal: W=forward, S=back, A=left, D=right
      return {
        forward: input.up,
        back: input.down,
        left: input.left,
        right: input.right,
        jump: input.jump,
      };
    case "UP": // Ceiling: S=forward, W=back, D=left, A=right
      return {
        forward: input.down,
        back: input.up,
        left: input.right,
        right: input.left,
        jump: input.jump,
      };
    case "LEFT": // Left wall: D=forward, A=back, W=left, S=right
      return {
        forward: input.right,
        back: input.left,
        left: input.up,
        right: input.down,
        jump: input.jump,
      };
    case "RIGHT": // Right wall: A=forward, D=back, S=left, W=right
      return {
        forward: input.left,
        back: input.right,
        left: input.down,
        right: input.up,
        jump: input.jump,
      };
  }
}

// Main physics update function
export function updatePhysics(
  state: PhysicsState,
  input: ScreenInput,
  tileGrid: string[][],
  solidTypes: string[]
): PhysicsState {
  const newState = { ...state };
  const { GRAVITY, JUMP_FORCE, MAX_FALL_SPEED } = PHYSICS;
  
  // Get movement vectors relative to current gravity
  const gravVec = getGravityVector(state.gravity);
  const jumpVec = getJumpVector(state.gravity);
  
  // Only apply gravity when NOT grounded
  if (!state.grounded) {
    newState.vx += gravVec.x * GRAVITY;
    newState.vy += gravVec.y * GRAVITY;
    
    // Clamp fall speed
    const fallSpeed = newState.vx * gravVec.x + newState.vy * gravVec.y;
    if (fallSpeed > MAX_FALL_SPEED) {
      const excess = fallSpeed - MAX_FALL_SPEED;
      newState.vx -= gravVec.x * excess;
      newState.vy -= gravVec.y * excess;
    }
  } else {
    // When grounded, zero out velocity in gravity direction to prevent jitter
    const gravVel = newState.vx * gravVec.x + newState.vy * gravVec.y;
    if (gravVel > 0) {
      newState.vx -= gravVec.x * gravVel;
      newState.vy -= gravVec.y * gravVel;
    }
  }
  
  // Convert screen input to gravity-relative input
  const relInput = toGravityRelative(input, state.gravity);
  
  // Get movement vectors relative to current gravity
  const moveRightVec = getMoveRightVector(state.gravity);  // Perpendicular to gravity
  
  // === SMOOTH ACCELERATION MODEL ===
  // Instead of adding velocity directly (stuttery), we:
  // 1. Calculate target velocity from input
  // 2. Smoothly accelerate toward target
  // 3. Decelerate when no input
  
  const maxSpeed = state.grounded ? PHYSICS.GROUND_MAX_SPEED : PHYSICS.AIR_MAX_SPEED;
  const accel = state.grounded ? PHYSICS.GROUND_ACCEL : PHYSICS.AIR_ACCEL;
  const decel = state.grounded ? PHYSICS.GROUND_DECEL : PHYSICS.AIR_DECEL;
  
  // Calculate target lateral velocity (perpendicular to gravity)
  // -1 = full left, 0 = stop, +1 = full right
  let lateralIntent = 0;
  if (relInput.left) lateralIntent -= 1;
  if (relInput.right) lateralIntent += 1;
  
  const targetLateralSpeed = lateralIntent * maxSpeed;
  
  // Get current lateral velocity (dot product with moveRight vector)
  const currentLateral = newState.vx * moveRightVec.x + newState.vy * moveRightVec.y;
  
  // Smoothly move toward target
  let newLateral: number;
  if (lateralIntent !== 0) {
    // Input held: accelerate toward target
    const diff = targetLateralSpeed - currentLateral;
    const change = Math.sign(diff) * Math.min(Math.abs(diff), accel);
    newLateral = currentLateral + change;
  } else {
    // No input: decelerate toward zero
    if (Math.abs(currentLateral) < decel) {
      newLateral = 0;
    } else {
      newLateral = currentLateral - Math.sign(currentLateral) * decel;
    }
  }
  
  // Apply the lateral velocity change
  const lateralDiff = newLateral - currentLateral;
  newState.vx += moveRightVec.x * lateralDiff;
  newState.vy += moveRightVec.y * lateralDiff;
  
  // Note: Forward/Back keys (W/S relative to gravity) don't move the character
  // Only lateral movement (A/D relative) + JUMP. Forward/back reserved for
  // future use (crouch, interact, climb ladders, etc.)
  
  // Jump (only when grounded AND jump just pressed, not held)
  // This prevents auto-bunny-hopping when holding jump through gravity changes
  const jumpPressed = relInput.jump && !state.jumpHeld;  // Rising edge detection
  if (jumpPressed && state.grounded) {
    newState.vx += jumpVec.x * JUMP_FORCE;
    newState.vy += jumpVec.y * JUMP_FORCE;
    newState.grounded = false;
  }
  
  // Track jump held state for next frame
  newState.jumpHeld = relInput.jump;
  
  // Clamp very small velocities to zero (prevents drift)
  if (Math.abs(newState.vx) < 0.05) newState.vx = 0;
  if (Math.abs(newState.vy) < 0.05) newState.vy = 0;
  
  // Store if we were grounded before moving
  const wasGrounded = state.grounded;
  
  // Move and check collisions (separate X and Y for better collision response)
  // Move X - BUT skip X collision when on slope to prevent getting stuck on adjacent tiles
  newState.x += newState.vx;
  let collision: CollisionResult = { collided: false, surfaceNormal: null, tileX: -1, tileY: -1 };
  
  if (!state.onSlope) {
    // Only check X collision when NOT on a slope
    collision = checkAndResolveCollision(newState, tileGrid, solidTypes, "x");
    if (collision.collided && !wasGrounded) {
      // Hit a wall while airborne - change gravity!
      newState.gravity = collision.surfaceNormal!;
      newState.grounded = true;
      // Zero out velocity in the direction of the surface
      const newGravVec = getGravityVector(newState.gravity);
      newState.vx -= newGravVec.x * (newState.vx * newGravVec.x + newState.vy * newGravVec.y);
      newState.vy -= newGravVec.y * (newState.vx * newGravVec.x + newState.vy * newGravVec.y);
    }
  }
  
  // Move Y
  newState.y += newState.vy;
  collision = checkAndResolveCollision(newState, tileGrid, solidTypes, "y");
  if (collision.collided) {
    if (!wasGrounded) {
      // Hit floor/ceiling while airborne - change gravity!
      newState.gravity = collision.surfaceNormal!;
      newState.grounded = true;
    } else {
      // Already grounded, just stay grounded
      newState.grounded = true;
    }
    // Zero out velocity toward surface
    const newGravVec = getGravityVector(newState.gravity);
    const velTowardSurface = newState.vx * newGravVec.x + newState.vy * newGravVec.y;
    if (velTowardSurface > 0) {
      newState.vx -= newGravVec.x * velTowardSurface;
      newState.vy -= newGravVec.y * velTowardSurface;
    }
  }
  
  // === SLOPE POST-PROCESSING ===
  // Slopes are NON-SOLID for regular collision, so we handle them here.
  // Based on: https://danjb.com/game_dev/tilebased_platformer_slopes
  
  const tileSize = PHYSICS.TILE_SIZE;
  const footX = newState.x + newState.width / 2;  // "Slope node" = center of bottom edge
  const footY = newState.y + newState.height;
  const footTileX = Math.floor(footX / tileSize);
  const footTileY = Math.floor(footY / tileSize);
  
  // Find slope at current foot position (or adjacent tiles)
  let currentSlope: { tileX: number; tileY: number; type: string; surfaceY: number } | null = null;
  
  // Check current tile and tile above (slope might be at tile boundary)
  const tilesToCheck = [
    { x: footTileX, y: footTileY },
    { x: footTileX, y: footTileY - 1 },
  ];
  
  for (const t of tilesToCheck) {
    if (t.y < 0 || t.y >= tileGrid.length) continue;
    if (t.x < 0 || t.x >= tileGrid[0].length) continue;
    
    const tileType = tileGrid[t.y][t.x];
    if (!isFloorSlope(tileType)) continue;
    
    const surfaceY = getSlopeSurfaceY(tileType, t.x * tileSize, t.y * tileSize, footX);
    if (surfaceY === null) continue;
    
    // Check if foot is at or below the slope surface (within this tile)
    if (footY >= surfaceY - 4) {
      // Pick the highest (smallest Y) surface we're intersecting
      if (!currentSlope || surfaceY < currentSlope.surfaceY) {
        currentSlope = { tileX: t.x, tileY: t.y, type: tileType, surfaceY };
      }
    }
  }
  
  // === THE STAIR DILEMMA FIX ===
  // If player WAS on a slope but isn't anymore, and wasn't jumping,
  // try to pull them down onto the slope below.
  if (!currentSlope && state.onSlope && newState.grounded && newState.gravity === "DOWN") {
    // Check tiles below current position for slopes
    const checkTileY = footTileY + 1;
    if (checkTileY >= 0 && checkTileY < tileGrid.length) {
      const tileType = tileGrid[checkTileY]?.[footTileX];
      if (isFloorSlope(tileType)) {
        const surfaceY = getSlopeSurfaceY(tileType, footTileX * tileSize, checkTileY * tileSize, footX);
        if (surfaceY !== null) {
          // Pull down to slope (stair dilemma fix)
          currentSlope = { tileX: footTileX, tileY: checkTileY, type: tileType, surfaceY };
        }
      }
    }
  }
  
  // Apply slope snapping
  if (currentSlope && newState.gravity === "DOWN") {
    const targetY = currentSlope.surfaceY - newState.height;
    newState.y = targetY;
    newState.grounded = true;
    newState.onSlope = true;
    
    // Zero out vertical velocity when on slope
    if (newState.vy > 0) {
      newState.vy = 0;
    }
  } else {
    newState.onSlope = false;
  }
  
  // === CHECK IF STILL GROUNDED (non-slope) ===
  if (newState.grounded && !newState.onSlope) {
    if (newState.gravity === "DOWN") {
      // Check if there's a solid tile below
      const checkY = newState.y + newState.height + 2;
      const checkTileY = Math.floor(checkY / tileSize);
      const checkTileX = Math.floor((newState.x + newState.width / 2) / tileSize);
      
      if (checkTileY >= 0 && checkTileY < tileGrid.length && 
          checkTileX >= 0 && checkTileX < tileGrid[0].length) {
        const tileBelow = tileGrid[checkTileY][checkTileX];
        const isSolid = solidTypes.includes(tileBelow) && !SLOPE_TILES.includes(tileBelow);
        if (!isSolid) {
          newState.grounded = false;
        }
      } else {
        newState.grounded = false;
      }
    } else {
      // Non-DOWN gravity: use original check
      const gravVec = getGravityVector(newState.gravity);
      const checkX = newState.x + gravVec.x * 2;
      const checkY = newState.y + gravVec.y * 2;
      const tiles = getOverlappingTiles(checkX, checkY, newState.width, newState.height);
      const stillOnGround = tiles.some(t => isTileSolid(tileGrid, t.x, t.y, solidTypes));
      if (!stillOnGround) {
        newState.grounded = false;
      }
    }
  }
  
  return newState;
}

// Check if character collides with a specific tile
// IMPORTANT: Slopes are NON-SOLID for regular collision detection!
// They are handled separately in post-processing (slope snapping)
function checkTileCollision(
  state: PhysicsState,
  tileGrid: string[][],
  tileX: number,
  tileY: number,
  solidTypes: string[]
): { collides: boolean; tileType: string } {
  if (tileY < 0 || tileY >= tileGrid.length) return { collides: false, tileType: "" };
  if (tileX < 0 || tileX >= tileGrid[0].length) return { collides: false, tileType: "" };
  
  const tileType = tileGrid[tileY][tileX];
  if (!solidTypes.includes(tileType)) return { collides: false, tileType: "" };
  
  // Slopes are NON-SOLID for regular collision - handled in post-processing
  if (SLOPE_TILES.includes(tileType)) {
    return { collides: false, tileType: "" };
  }
  
  // Regular solid tile - always collides
  return { collides: true, tileType };
}

// Check collision and resolve (push character out of solid tiles)
function checkAndResolveCollision(
  state: PhysicsState,
  tileGrid: string[][],
  solidTypes: string[],
  axis: "x" | "y"
): CollisionResult {
  const tiles = getOverlappingTiles(state.x, state.y, state.width, state.height);
  const tileSize = PHYSICS.TILE_SIZE;
  
  for (const tile of tiles) {
    const collision = checkTileCollision(state, tileGrid, tile.x, tile.y, solidTypes);
    
    if (collision.collides) {
      const tileLeft = tile.x * tileSize;
      const tileTop = tile.y * tileSize;
      
      // Handle slope tiles differently
      if (SLOPE_TILES.includes(collision.tileType)) {
        // For slopes, push character up/down based on position on slope
        const footX = state.x + state.width / 2;
        const relX = footX - tileLeft;
        const normalizedX = relX / tileSize;
        
        // Calculate where the slope surface is at this X position
        // Surface Y = where the diagonal line is at this X
        let slopeY: number;
        switch (collision.tileType) {
          case "slopeBL": // ◣ diagonal y=x, surface goes from top-left to bottom-right
            slopeY = tileTop + normalizedX * tileSize;
            break;
          case "slopeBR": // ◢ diagonal y=1-x, surface goes from top-right to bottom-left
            slopeY = tileTop + (1 - normalizedX) * tileSize;
            break;
          case "slopeUL": // ◤ diagonal y=1-x, surface goes from top-right to bottom-left
            slopeY = tileTop + (1 - normalizedX) * tileSize;
            break;
          case "slopeUR": // ◥ diagonal y=x, surface goes from top-left to bottom-right
            slopeY = tileTop + normalizedX * tileSize;
            break;
          default:
            slopeY = tileTop;
        }
        
        // Push character to stand on slope surface
        if (collision.tileType === "slopeBL" || collision.tileType === "slopeBR") {
          // Floor slopes - push up
          state.y = slopeY - state.height;
          return { collided: true, surfaceNormal: "DOWN", tileX: tile.x, tileY: tile.y };
        } else {
          // Ceiling slopes - push down
          state.y = slopeY;
          return { collided: true, surfaceNormal: "UP", tileX: tile.x, tileY: tile.y };
        }
      }
      
      // Regular solid tile - use normal collision resolution
      const normal = getSurfaceNormal(
        state.x, state.y, state.width, state.height,
        tile.x, tile.y, state.vx, state.vy
      );
      
      // Push out based on the normal
      if (axis === "x") {
        if (normal === "LEFT") {
          state.x = tile.x * tileSize + tileSize;
        } else if (normal === "RIGHT") {
          state.x = tile.x * tileSize - state.width;
        }
      } else {
        if (normal === "UP") {
          state.y = tile.y * tileSize + tileSize;
        } else if (normal === "DOWN") {
          state.y = tile.y * tileSize - state.height;
        }
      }
      
      return { collided: true, surfaceNormal: normal, tileX: tile.x, tileY: tile.y };
    }
  }
  
  return { collided: false, surfaceNormal: null, tileX: -1, tileY: -1 };
}
