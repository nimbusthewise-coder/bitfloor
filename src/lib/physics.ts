/**
 * Bitship Physics Controller
 * 2D Platformer with omnidirectional gravity (gravity boots)
 * Uses vector-based collision system
 */

import {
  checkCollisions,
  getGravityDirection as getGravityDir,
  CollisionResult as VectorCollisionResult,
} from "./vector-collision";

// Gravity directions (4 cardinal for now, 8 with diagonals later)
export type GravityDirection = "DOWN" | "UP" | "LEFT" | "RIGHT";

// Physics constants
export const PHYSICS = {
  // Gravity & jumping
  GRAVITY: 0.35,          // Acceleration per frame
  JUMP_FORCE: 6.67,       // Initial jump velocity (~2 tile height)
  MAX_FALL_SPEED: 6,      // Terminal velocity (falling toward floor)
  MAX_JUMP_SPEED: 8,      // Max upward velocity (away from floor)
  
  // Ground movement (smooth acceleration model)
  GROUND_MAX_SPEED: 5,    // Max run speed on ground
  GROUND_ACCEL: 0.8,      // Acceleration toward target speed
  GROUND_DECEL: 0.6,      // Deceleration when no input (friction)
  
  // Air movement
  AIR_MAX_SPEED: 4,       // Max horizontal speed in air
  AIR_ACCEL: 0.5,         // Air control acceleration (reduced)
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
  const moveRightVec = getMoveRightVector(state.gravity);
  
  // Apply gravity when NOT grounded
  if (!state.grounded) {
    newState.vx += gravVec.x * GRAVITY;
    newState.vy += gravVec.y * GRAVITY;
    
    // Clamp fall speed (positive = moving toward floor)
    const fallSpeed = newState.vx * gravVec.x + newState.vy * gravVec.y;
    if (fallSpeed > MAX_FALL_SPEED) {
      const excess = fallSpeed - MAX_FALL_SPEED;
      newState.vx -= gravVec.x * excess;
      newState.vy -= gravVec.y * excess;
    }
    
    // Clamp jump speed (negative = moving away from floor)
    const jumpSpeed = -(newState.vx * gravVec.x + newState.vy * gravVec.y);
    if (jumpSpeed > PHYSICS.MAX_JUMP_SPEED) {
      const excess = jumpSpeed - PHYSICS.MAX_JUMP_SPEED;
      newState.vx += gravVec.x * excess;
      newState.vy += gravVec.y * excess;
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
  
  // Jump (only when grounded AND jump just pressed, not held)
  const jumpPressed = relInput.jump && !state.jumpHeld;
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
  
  // Apply velocity to position
  newState.x += newState.vx;
  newState.y += newState.vy;
  
  // === VECTOR-BASED COLLISION DETECTION ===
  const collision = checkCollisions(
    newState.x,
    newState.y,
    newState.width,
    newState.height,
    newState.vx,
    newState.vy,
    newState.gravity,
    tileGrid,
    PHYSICS.TILE_SIZE
  );
  
  // Apply collision adjustments
  newState.x += collision.adjustment.x;
  newState.y += collision.adjustment.y;
  
  // Update grounded state
  newState.grounded = collision.grounded;
  
  // If we hit a ceiling, zero out upward velocity
  if (collision.ceilinged) {
    const gravVel = newState.vx * (-gravVec.x) + newState.vy * (-gravVec.y);
    if (gravVel > 0) {
      newState.vx -= (-gravVec.x) * gravVel;
      newState.vy -= (-gravVec.y) * gravVel;
    }
  }
  
  // If we hit walls, zero out lateral velocity in that direction
  if (collision.walledLeft) {
    const leftDir = { x: -moveRightVec.x, y: -moveRightVec.y };
    const leftVel = newState.vx * leftDir.x + newState.vy * leftDir.y;
    if (leftVel > 0) {
      newState.vx -= leftDir.x * leftVel;
      newState.vy -= leftDir.y * leftVel;
    }
  }
  
  if (collision.walledRight) {
    const rightVel = newState.vx * moveRightVec.x + newState.vy * moveRightVec.y;
    if (rightVel > 0) {
      newState.vx -= moveRightVec.x * rightVel;
      newState.vy -= moveRightVec.y * rightVel;
    }
  }
  
  // Slope surface snapping for smooth slope traversal
  if (collision.grounded && collision.groundNormal && collision.groundPoint) {
    const normal = collision.groundNormal;
    
    // Check if this is a slope (not axis-aligned)
    const isSlope = Math.abs(normal.x) > 0.1 && Math.abs(normal.y) > 0.1;
    
    if (isSlope) {
      // Project velocity along slope surface
      const velDotNormal = newState.vx * normal.x + newState.vy * normal.y;
      if (velDotNormal > 0) {
        // Moving into surface - project along it
        newState.vx -= normal.x * velDotNormal;
        newState.vy -= normal.y * velDotNormal;
      }
    } else {
      // Flat surface - zero gravity-direction velocity when grounded
      const gravVel = newState.vx * gravVec.x + newState.vy * gravVec.y;
      if (gravVel > 0) {
        newState.vx -= gravVec.x * gravVel;
        newState.vy -= gravVec.y * gravVel;
      }
    }
  }
  
  return newState;
}
