/**
 * Path Executor - Frame-based trajectory replay
 * 
 * Instead of trying to recreate physics via input translation,
 * we directly replay the pre-simulated trajectory frames.
 * 
 * This guarantees execution matches the planned path exactly.
 */

import { JumpResult } from "./physics-pathfinding";
import { GravityDirection, PLAYER } from "./physics";

const TILE = 32;

export interface ExecutorFrame {
  x: number;      // top-left position (for physics state)
  y: number;
  centerX: number; // center position (for rendering)
  centerY: number;
  vx: number;     // velocity (derived from position delta)
  vy: number;
  gravity: GravityDirection;
  grounded: boolean;
  action: string;  // Current action being executed (for animation)
}

export interface ExecutorState {
  frames: ExecutorFrame[];
  currentFrame: number;
  isComplete: boolean;
}

/**
 * Convert a path (array of JumpResults) into a flat array of executor frames.
 * Each JumpResult contains a trajectory with frame-by-frame positions.
 */
const WALK_FRAMES_PER_TILE = 15;  // ~0.25 seconds per tile at 60fps (walking)
const RUN_FRAMES_PER_TILE = 6;    // ~0.1 seconds per tile at 60fps (running)
const RUN_THRESHOLD_TILES = 1;    // Run when distance > 1 tile

export function pathToFrames(path: JumpResult[]): ExecutorFrame[] {
  const frames: ExecutorFrame[] = [];
  const halfCollider = PLAYER.COLLIDER_SIZE / 2;
  
  for (let actionIdx = 0; actionIdx < path.length; actionIdx++) {
    const action = path[actionIdx];
    const trajectory = action.trajectory;
    const isWalk = action.action.startsWith("walk");
    
    // For walks with empty trajectory, generate interpolated frames
    if (isWalk && trajectory.length === 0 && action.landing) {
      const startX = action.start.x * TILE + TILE / 2;
      const startY = action.start.y * TILE + TILE / 2;
      const endX = action.landing.x * TILE + TILE / 2;
      const endY = action.landing.y * TILE + TILE / 2;
      
      const dx = endX - startX;
      const dy = endY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Count consecutive walks in the same direction to determine run vs walk
      let consecutiveWalks = 1;
      const walkDir = action.action; // "walk-left" or "walk-right"
      for (let j = actionIdx + 1; j < path.length; j++) {
        if (path[j].action === walkDir) {
          consecutiveWalks++;
        } else {
          break;
        }
      }
      
      // Run if total walk distance > threshold, otherwise walk
      const framesPerTile = consecutiveWalks > RUN_THRESHOLD_TILES 
        ? RUN_FRAMES_PER_TILE 
        : WALK_FRAMES_PER_TILE;
      const numFrames = Math.max(1, Math.round(distance / TILE * framesPerTile));
      
      for (let i = 0; i <= numFrames; i++) {
        const t = i / numFrames;
        const x = startX + dx * t;
        const y = startY + dy * t;
        const vx = dx / numFrames;
        const vy = dy / numFrames;
        
          // Use "run-left"/"run-right" action when running for animation purposes
        const isRunning = consecutiveWalks > RUN_THRESHOLD_TILES;
        const animAction = isRunning 
          ? action.action.replace("walk", "run") 
          : action.action;
        
        frames.push({
          x: x - halfCollider,
          y: y - halfCollider,
          centerX: x,
          centerY: y,
          vx: i === numFrames ? 0 : vx,  // Zero velocity on last frame
          vy: i === numFrames ? 0 : vy,
          gravity: action.landing.gravity as GravityDirection,
          grounded: true,
          action: animAction,
        });
      }
      continue;  // Skip the normal trajectory loop
    }
    
    for (let i = 0; i < trajectory.length; i++) {
      const point = trajectory[i];
      const prevPoint = i > 0 ? trajectory[i - 1] : point;
      
      // Calculate velocity from position delta
      const vx = point.x - prevPoint.x;
      const vy = point.y - prevPoint.y;
      
      // Determine grounded state
      // Walking is always grounded; jump/fall is grounded only on last frame if landing exists
      const isLastFrame = i === trajectory.length - 1;
      const hasLanding = action.landing !== null;
      const grounded = isWalk || (isLastFrame && hasLanding);
      
      // Determine gravity - use landing gravity if we've landed, otherwise start gravity
      const gravity = (isLastFrame && action.landing) 
        ? action.landing.gravity as GravityDirection
        : action.start.gravity as GravityDirection;
      
      frames.push({
        x: point.x - halfCollider,     // Convert center to top-left
        y: point.y - halfCollider,
        centerX: point.x,
        centerY: point.y,
        vx,
        vy,
        gravity,
        grounded,
        action: action.action,
      });
    }
  }
  
  return frames;
}

/**
 * Create a new executor state from a planned path.
 */
export function createExecutor(path: JumpResult[]): ExecutorState {
  return {
    frames: pathToFrames(path),
    currentFrame: 0,
    isComplete: false,
  };
}

/**
 * Advance the executor by one frame and return the current state.
 * Returns null if execution is complete.
 */
export function stepExecutor(state: ExecutorState): ExecutorFrame | null {
  if (state.isComplete || state.currentFrame >= state.frames.length) {
    state.isComplete = true;
    return null;
  }
  
  const frame = state.frames[state.currentFrame];
  state.currentFrame++;
  
  if (state.currentFrame >= state.frames.length) {
    state.isComplete = true;
  }
  
  return frame;
}

/**
 * Get progress as a percentage (0-100).
 */
export function getProgress(state: ExecutorState): number {
  if (state.frames.length === 0) return 100;
  return Math.round((state.currentFrame / state.frames.length) * 100);
}

/**
 * Check if execution is complete.
 */
export function isComplete(state: ExecutorState): boolean {
  return state.isComplete;
}

/**
 * Reset executor to start (for replay/debugging).
 */
export function resetExecutor(state: ExecutorState): void {
  state.currentFrame = 0;
  state.isComplete = false;
}
