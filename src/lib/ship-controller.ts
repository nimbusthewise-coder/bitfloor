/**
 * ShipController - Centralized game simulation controller
 * 
 * Owns the physics simulation, grid, boundaries, and all inhabitants.
 * Single source of truth for all character positions.
 */

import { PhysicsState, ScreenInput, updatePhysics, GravityDirection, PHYSICS, PLAYER } from './physics';

// Intent types - what a character WANTS to do (not direct position control)
export type CharacterIntent =
  | { type: 'idle' }
  | { type: 'input'; keys: ScreenInput }  // Direct input (player)
  | { type: 'pathfind'; target: { x: number; y: number } }  // AI pathfinding
  | { type: 'follow'; targetId: string }  // Follow another character

// Character attributes (immutable per character)
export interface CharacterAttributes {
  id: string;
  name: string;
  speed: number;
  jumpPower: number;
  colliderSize: number;
}

// Character state managed by ShipController
export interface CharacterState {
  physics: PhysicsState;
  intent: CharacterIntent;
  // AI state (managed per-character but read by Ship)
  pathProgress: number;
  currentPath: any[];  // PathAction[]
  planMeta: { destKey: string | null; bestKey: string | null; minDist: number; cost: number };
}

// Inhabitant = attributes + state
export interface Inhabitant {
  attributes: CharacterAttributes;
  state: CharacterState;
  // Visual state (for rendering)
  facing: 'left' | 'right';
  animation: string;
  frame: number;
  displayRotation: number;
  targetRotation: number;
}

// Ship configuration
export interface ShipConfig {
  grid: string[][];
  solidTiles: string[];
  tileSize: number;
  // Bounds derived from grid
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
}

/**
 * ShipController class
 * 
 * Manages all inhabitants and runs physics simulation in lockstep.
 * All position changes MUST go through this controller.
 */
export class ShipController {
  private config: ShipConfig;
  private inhabitants: Map<string, Inhabitant> = new Map();
  private aiTickCounter: number = 0;
  private readonly AI_TICK_INTERVAL = 12; // Run AI every 12 physics ticks (~5Hz at 60fps)

  constructor(grid: string[][], solidTiles: string[]) {
    const heightTiles = grid.length;
    const widthTiles = grid[0]?.length ?? 0;
    
    this.config = {
      grid,
      solidTiles,
      tileSize: PHYSICS.TILE_SIZE,
      widthTiles,
      heightTiles,
      widthPx: widthTiles * PHYSICS.TILE_SIZE,
      heightPx: heightTiles * PHYSICS.TILE_SIZE,
    };
  }

  /**
   * Add a character to the ship
   */
  addInhabitant(
    attributes: CharacterAttributes,
    spawnX: number,
    spawnY: number,
    gravity: GravityDirection = 'DOWN'
  ): Inhabitant {
    const inhabitant: Inhabitant = {
      attributes,
      state: {
        physics: {
          x: spawnX,
          y: spawnY,
          vx: 0,
          vy: 0,
          gravity,
          grounded: false,
          width: attributes.colliderSize,
          height: attributes.colliderSize,
          jumpHeld: false,
        },
        intent: { type: 'idle' },
        pathProgress: 0,
        currentPath: [],
        planMeta: { destKey: null, bestKey: null, minDist: Infinity, cost: Infinity },
      },
      facing: 'right',
      animation: 'Idle',
      frame: 0,
      displayRotation: 0,
      targetRotation: 0,
    };

    this.inhabitants.set(attributes.id, inhabitant);
    return inhabitant;
  }

  /**
   * Remove a character from the ship
   */
  removeInhabitant(id: string): boolean {
    return this.inhabitants.delete(id);
  }

  /**
   * Get an inhabitant by ID
   */
  getInhabitant(id: string): Inhabitant | undefined {
    return this.inhabitants.get(id);
  }

  /**
   * Get all inhabitants
   */
  getAllInhabitants(): Inhabitant[] {
    return Array.from(this.inhabitants.values());
  }

  /**
   * Set a character's intent (called by player input or AI decision)
   */
  setIntent(id: string, intent: CharacterIntent): void {
    const inhabitant = this.inhabitants.get(id);
    if (inhabitant) {
      inhabitant.state.intent = intent;
    }
  }

  /**
   * Main simulation tick - runs physics for ALL inhabitants in lockstep
   * Called from the game loop's fixed timestep
   */
  tick(): void {
    this.aiTickCounter++;
    const runAI = this.aiTickCounter >= this.AI_TICK_INTERVAL;
    if (runAI) this.aiTickCounter = 0;

    for (const [id, inhabitant] of this.inhabitants) {
      // 1. If AI tick, process pathfinding intent → input
      if (runAI) {
        this.processAI(inhabitant);
      }

      // 2. Convert intent to input
      const input = this.intentToInput(inhabitant);

      // 3. Run physics
      const newPhysics = updatePhysics(
        inhabitant.state.physics,
        input,
        this.config.grid,
        this.config.solidTiles
      );

      // 4. Enforce boundaries (SINGLE POINT OF CONTROL)
      this.clampToBounds(newPhysics);

      // 5. Update state
      inhabitant.state.physics = newPhysics;

      // 6. Update visual state
      this.updateVisuals(inhabitant);
    }
  }

  /**
   * Process AI pathfinding for a character
   * Converts pathfind intent into path execution
   */
  private processAI(inhabitant: Inhabitant): void {
    const { intent } = inhabitant.state;
    
    if (intent.type !== 'pathfind') return;
    
    // TODO: Move the AI logic from page.tsx here
    // This will include:
    // - Path calculation via calculateReachableCells
    // - Path step execution
    // - Walk merging logic
    // - Jump/fall handling
    // 
    // For now, we'll keep the existing AI interval but have it set intent
    // and let this method translate to input
  }

  /**
   * Convert intent to physics input
   */
  private intentToInput(inhabitant: Inhabitant): ScreenInput {
    const { intent } = inhabitant.state;
    const input: ScreenInput = { up: false, down: false, left: false, right: false, jump: false };

    switch (intent.type) {
      case 'idle':
        // No input
        break;
      
      case 'input':
        // Direct input passthrough (player)
        return intent.keys;
      
      case 'pathfind':
        // AI pathfinding - input determined by processAI setting path state
        // For now, this is handled externally via nimInputRef
        // TODO: Move all AI input generation here
        break;
      
      case 'follow':
        // Follow another character
        const target = this.inhabitants.get(intent.targetId);
        if (target) {
          // Simple follow logic - move toward target
          const dx = target.state.physics.x - inhabitant.state.physics.x;
          if (dx > PHYSICS.TILE_SIZE) input.right = true;
          else if (dx < -PHYSICS.TILE_SIZE) input.left = true;
        }
        break;
    }

    return input;
  }

  /**
   * Clamp physics state to world bounds
   * THE SINGLE POINT where boundary enforcement happens
   */
  private clampToBounds(physics: PhysicsState): void {
    const { widthPx, heightPx } = this.config;

    if (physics.x < 0) {
      physics.x = 0;
      physics.vx = 0;
    } else if (physics.x + physics.width > widthPx) {
      physics.x = widthPx - physics.width;
      physics.vx = 0;
    }

    if (physics.y < 0) {
      physics.y = 0;
      physics.vy = 0;
    } else if (physics.y + physics.height > heightPx) {
      physics.y = heightPx - physics.height;
      physics.vy = 0;
    }
  }

  /**
   * Update visual state based on physics
   */
  private updateVisuals(inhabitant: Inhabitant): void {
    const { physics } = inhabitant.state;
    
    // Update facing direction
    if (physics.vx > 0.3) inhabitant.facing = 'right';
    else if (physics.vx < -0.3) inhabitant.facing = 'left';

    // Update animation
    const isMoving = Math.abs(physics.vx) > 0.3 || Math.abs(physics.vy) > 0.3;
    inhabitant.animation = !physics.grounded ? 'Jump' : isMoving ? 'Run' : 'Idle';

    // Update rotation target
    inhabitant.targetRotation = this.getGravityRotation(physics.gravity);
  }

  private getGravityRotation(gravity: GravityDirection): number {
    switch (gravity) {
      case 'DOWN': return 0;
      case 'LEFT': return 90;
      case 'UP': return 180;
      case 'RIGHT': return 270;
    }
  }

  /**
   * Get ship configuration (for rendering, pathfinding, etc.)
   */
  getConfig(): Readonly<ShipConfig> {
    return this.config;
  }
}

// Export singleton factory for ship pages
export function createShipController(grid: string[][], solidTiles: string[]): ShipController {
  return new ShipController(grid, solidTiles);
}
