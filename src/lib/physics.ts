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
  JUMP_FORCE: 6.60,          // Initial jump velocity (~2 tile height)
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

// Character collider configuration (tunable)
// Visual sprite is 44px tall, but physics collider is smaller and positioned at feet
export const PLAYER = {
  COLLIDER_SIZE: 30,           // 24-30px range for tuning (default: 30)
  SPRITE_HEIGHT: 44,           // Visual sprite height (unchanged)
  SPRITE_WIDTH: 32,            // Visual sprite width (unchanged)
  get COLLIDER_OFFSET_Y() {    // Offset from top of sprite to top of collider
    return this.SPRITE_HEIGHT - this.COLLIDER_SIZE; // 14px for 30px collider
  },
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
}

// Collision result
export interface CollisionResult {
  collided: boolean;
  surfaceNormal: GravityDirection | null;
  tileX: number;
  tileY: number;
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

  // Optional: analog lateral axis relative to CURRENT GRAVITY.
  // Range: [-1..+1], where -1 = full "left" (gravity-relative), +1 = full "right".
  // If provided, it overrides left/right booleans for movement intent.
  lateral?: number;
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
  // Gravity direction is maintained until hitting a new surface
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

  // If we have an analog axis, use it (gravity-relative).
  // Otherwise fall back to digital buttons.
  if (typeof input.lateral === "number" && Number.isFinite(input.lateral)) {
    lateralIntent = Math.max(-1, Math.min(1, input.lateral));
  } else {
    if (relInput.left) lateralIntent -= 1;
    if (relInput.right) lateralIntent += 1;
  }

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
  // Move X
  newState.x += newState.vx;
  let collision = checkAndResolveCollision(newState, tileGrid, solidTypes, "x");
  if (collision.collided && !wasGrounded) {
    // Hit a wall while airborne - change gravity!
    newState.gravity = collision.surfaceNormal!;
    newState.grounded = true;
    // Zero out velocity in the direction of the surface
    const newGravVec = getGravityVector(newState.gravity);
    newState.vx -= newGravVec.x * (newState.vx * newGravVec.x + newState.vy * newGravVec.y);
    newState.vy -= newGravVec.y * (newState.vx * newGravVec.x + newState.vy * newGravVec.y);
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
  
  // Check if still grounded (not floating)
  if (newState.grounded) {
    const gravVec = getGravityVector(newState.gravity);
    const checkX = newState.x + gravVec.x * 2;
    const checkY = newState.y + gravVec.y * 2;
    const tiles = getOverlappingTiles(checkX, checkY, newState.width, newState.height);
    const stillOnGround = tiles.some(t => isTileSolid(tileGrid, t.x, t.y, solidTypes));
    if (!stillOnGround) {
      newState.grounded = false;
    }
  }
  
  // === WORLD BOUNDARY CLAMPING ===
  // Prevent entities from leaving the playable area
  const worldWidth = tileGrid[0].length * PHYSICS.TILE_SIZE;
  const worldHeight = tileGrid.length * PHYSICS.TILE_SIZE;
  
  // DEBUG: Log if we're about to clamp
  const needsClampX = newState.x < 0 || newState.x + newState.width > worldWidth;
  const needsClampY = newState.y < 0 || newState.y + newState.height > worldHeight;
  if (needsClampX || needsClampY) {
    console.log(`[CLAMP] Before: (${newState.x.toFixed(1)},${newState.y.toFixed(1)}) vel=(${newState.vx.toFixed(2)},${newState.vy.toFixed(2)}) bounds=(${worldWidth},${worldHeight})`);
  }
  
  // Clamp position to world bounds
  if (newState.x < 0) {
    newState.x = 0;
    newState.vx = 0;
  } else if (newState.x + newState.width > worldWidth) {
    newState.x = worldWidth - newState.width;
    newState.vx = 0;
  }
  
  if (newState.y < 0) {
    newState.y = 0;
    newState.vy = 0;
  } else if (newState.y + newState.height > worldHeight) {
    newState.y = worldHeight - newState.height;
    newState.vy = 0;
  }
  
  // DEBUG: Confirm clamp result
  if (needsClampX || needsClampY) {
    console.log(`[CLAMP] After:  (${newState.x.toFixed(1)},${newState.y.toFixed(1)}) vel=(${newState.vx.toFixed(2)},${newState.vy.toFixed(2)})`);
  }
  
  return newState;
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
    if (isTileSolid(tileGrid, tile.x, tile.y, solidTypes)) {
      // Collision! Resolve by pushing out
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
