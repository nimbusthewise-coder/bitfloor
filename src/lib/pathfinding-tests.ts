/**
 * Pathfinding Test Harness
 * 
 * Compares planned path expectations vs actual physics execution.
 * Identifies where simulation diverges from reality.
 */

import {
  calculateReachableCells,
  JumpResult,
  PhysGravity,
} from "./physics-pathfinding";
import {
  PhysicsState,
  ScreenInput,
  updatePhysics,
  getMoveRightVector,
  PLAYER,
} from "./physics";

const TILE = 32;

export interface TestStep {
  stepIndex: number;
  action: string;
  
  // Expected (from planner)
  expectedStart: { x: number; y: number; gravity: PhysGravity };
  expectedLanding: { x: number; y: number; gravity: PhysGravity } | null;
  expectedLateral: number;
  
  // Actual (from physics simulation)
  actualStart: { x: number; y: number; gravity: PhysGravity };
  actualLanding: { x: number; y: number; gravity: PhysGravity } | null;
  actualInput: ScreenInput;
  
  // Comparison
  passed: boolean;
  errorDetails: string[];
}

export interface TestResult {
  testName: string;
  startTile: { x: number; y: number; gravity: PhysGravity };
  destTile: { x: number; y: number };
  
  // Path planning result
  pathFound: boolean;
  plannedActions: string[];
  plannedPath: JumpResult[];
  
  // Execution results
  steps: TestStep[];
  
  // Summary
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  success: boolean;
}

/**
 * Convert lateral direction to screen input based on gravity
 */
export function lateralToInput(lateral: number, gravity: PhysGravity, isJump: boolean): ScreenInput {
  const input: ScreenInput = { up: false, down: false, left: false, right: false, jump: isJump };
  
  if (lateral === 0) return input;
  
  switch (gravity) {
    case "DOWN":
      if (lateral < 0) input.left = true;
      else input.right = true;
      break;
    case "UP":
      // UP gravity inverts left/right
      if (lateral < 0) input.right = true;
      else input.left = true;
      break;
    case "LEFT":
      if (lateral < 0) input.up = true;
      else input.down = true;
      break;
    case "RIGHT":
      if (lateral < 0) input.down = true;
      else input.up = true;
      break;
  }
  
  return input;
}

/**
 * Run physics simulation for a single action and return landing position
 */
function simulateAction(
  startState: PhysicsState,
  action: JumpResult,
  grid: string[][],
  solidTypes: string[],
  maxFrames: number = 300
): { landing: { x: number; y: number; gravity: PhysGravity } | null; frames: number; inputUsed: ScreenInput } {
  
  const isJump = action.action.startsWith("jump");
  const isWalk = action.action.startsWith("walk");
  const isFall = action.action.startsWith("fall");
  
  // Use the planner's stored lateral value exactly - don't override based on action name!
  // The planner may use fractional lateral values (e.g., 0.25) for precise air control
  const lateral = action.lateral;
  
  const input = lateralToInput(lateral, startState.gravity, isJump);
  
  let state = { ...startState };
  let frames = 0;
  let wasGrounded = state.grounded;
  
  // For falls, the planner simulates from the edge cell center with zero velocity
  // We need to match this exactly for consistent results
  if (isFall) {
    // The planner's start position IS the edge cell - teleport there to match
    const edgeX = action.start.x * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2;
    const edgeY = action.start.y * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2;
    state.x = edgeX;
    state.y = edgeY;
    state.vx = 0;
    state.vy = 0;
    state.grounded = false; // We're falling
    wasGrounded = false;    // BUG FIX: Reset wasGrounded so landing detection works!
    
    // Debug: show what we're simulating - focus on cell (8,4-5) RIGHT for debugging
    const startCell = { x: Math.floor((state.x + state.width/2) / TILE), y: Math.floor((state.y + state.height/2) / TILE) };
    const isDebugCase = state.gravity === "RIGHT" && startCell.x === 8 && (startCell.y === 4 || startCell.y === 5);
    if (isDebugCase) {
      console.log(`[TEST-FALL-DEBUG] Starting from (${startCell.x},${startCell.y}) grav=${state.gravity} lateral=${lateral}`);
      console.log(`  State: x=${state.x.toFixed(1)} y=${state.y.toFixed(1)} vx=${state.vx} vy=${state.vy} grounded=${state.grounded} jumpHeld=${state.jumpHeld}`);
      console.log(`  width=${state.width} height=${state.height}`);
    } else {
      console.log(`[TEST-FALL] Starting from (${startCell.x},${startCell.y}) grav=${state.gravity} lateral=${lateral}`);
    }
    
    // Now we're falling - continue with lateral air control until we land
    // Use analog lateral input to match the planner's continuous values
    const airInput: ScreenInput = { up: false, down: false, left: false, right: false, jump: false, lateral };
    while (frames < maxFrames) {
      state = updatePhysics(state, airInput, grid, solidTypes);
      frames++;
      
      // Debug first few frames for specific case
      if (isDebugCase && frames <= 10) {
        const cx = state.x + state.width/2;
        const cy = state.y + state.height/2;
        console.log(`  Frame ${frames}: pos=(${cx.toFixed(1)},${cy.toFixed(1)}) cell=(${Math.floor(cx/TILE)},${Math.floor(cy/TILE)}) vel=(${state.vx.toFixed(2)},${state.vy.toFixed(2)}) grounded=${state.grounded} grav=${state.gravity}`);
      }
      
      // Check if we've landed
      if (!wasGrounded && state.grounded) {
        const centerX = state.x + state.width / 2;
        const centerY = state.y + state.height / 2;
        const landX = Math.floor(centerX / TILE);
        const landY = Math.floor(centerY / TILE);
        console.log(`[TEST-FALL] LANDED at (${landX},${landY}) grav=${state.gravity} after ${frames} frames`);
        return {
          landing: {
            x: landX,
            y: landY,
            gravity: state.gravity
          },
          frames,
          inputUsed: input
        };
      }
      
      wasGrounded = state.grounded;
    }
    
    // Timeout
    const centerX = state.x + state.width / 2;
    const centerY = state.y + state.height / 2;
    console.log(`[TEST-FALL] TIMEOUT at (${Math.floor(centerX/TILE)},${Math.floor(centerY/TILE)}) grav=${state.gravity}`);
    return {
      landing: {
        x: Math.floor(centerX / TILE),
        y: Math.floor(centerY / TILE),
        gravity: state.gravity
      },
      frames,
      inputUsed: input
    };
  }
  
  // For walks, we just need to move one tile
  if (isWalk) {
    const targetX = action.landing?.x ?? action.start.x;
    const targetY = action.landing?.y ?? action.start.y;
    const targetPixelX = targetX * TILE + TILE / 2;
    const targetPixelY = targetY * TILE + TILE / 2;
    
    // Simulate walking until we reach target or timeout
    while (frames < maxFrames) {
      state = updatePhysics(state, input, grid, solidTypes);
      frames++;
      
      const centerX = state.x + state.width / 2;
      const centerY = state.y + state.height / 2;
      const dist = Math.abs(centerX - targetPixelX) + Math.abs(centerY - targetPixelY);
      
      if (dist < TILE * 0.5) {
        return {
          landing: {
            x: Math.floor(centerX / TILE),
            y: Math.floor(centerY / TILE),
            gravity: state.gravity
          },
          frames,
          inputUsed: input
        };
      }
      
      // Check if we got stuck (hit a wall)
      if (frames > 30 && Math.abs(state.vx) < 0.1 && Math.abs(state.vy) < 0.1) {
        const centerX = state.x + state.width / 2;
        const centerY = state.y + state.height / 2;
        return {
          landing: {
            x: Math.floor(centerX / TILE),
            y: Math.floor(centerY / TILE),
            gravity: state.gravity
          },
          frames,
          inputUsed: input
        };
      }
    }
  }
  
  // For jumps, simulate until we land
  if (isJump) {
    // For jumps and falls, simulate until we land
    // First frame: apply input to initiate jump/fall (with analog lateral)
    const jumpInput: ScreenInput = { up: false, down: false, left: false, right: false, jump: true, lateral };
    state = updatePhysics(state, jumpInput, grid, solidTypes);
    frames++;
    wasGrounded = false; // We just jumped
    
    // Continue with LATERAL input (but not jump) until we land
    // Use analog lateral to match the planner's continuous air control
    const airInput: ScreenInput = { up: false, down: false, left: false, right: false, jump: false, lateral };
    
    while (frames < maxFrames) {
      state = updatePhysics(state, airInput, grid, solidTypes);
      frames++;
      
      // Check if we've landed
      if (!wasGrounded && state.grounded) {
        const centerX = state.x + state.width / 2;
        const centerY = state.y + state.height / 2;
        return {
          landing: {
            x: Math.floor(centerX / TILE),
            y: Math.floor(centerY / TILE),
            gravity: state.gravity
          },
          frames,
          inputUsed: input
        };
      }
      
      wasGrounded = state.grounded;
    }
  }
  
  // Timeout - return current position
  const centerX = state.x + state.width / 2;
  const centerY = state.y + state.height / 2;
  return {
    landing: {
      x: Math.floor(centerX / TILE),
      y: Math.floor(centerY / TILE),
      gravity: state.gravity
    },
    frames,
    inputUsed: input
  };
}

/**
 * Run a pathfinding test from start to destination
 */
export function runPathfindingTest(
  testName: string,
  startTile: { x: number; y: number; gravity: PhysGravity },
  destTile: { x: number; y: number },
  grid: string[][],
  solidTypes: string[]
): TestResult {
  
  const result: TestResult = {
    testName,
    startTile,
    destTile,
    pathFound: false,
    plannedActions: [],
    plannedPath: [],
    steps: [],
    totalSteps: 0,
    passedSteps: 0,
    failedSteps: 0,
    success: false,
  };
  
  // Calculate reachable cells from start
  const reachable = calculateReachableCells(
    startTile.x,
    startTile.y,
    startTile.gravity,
    grid,
    solidTypes
  );
  
  // Find path to destination
  let bestCell = null;
  let minDist = Infinity;
  
  for (const cell of reachable) {
    const dist = Math.abs(cell.x - destTile.x) + Math.abs(cell.y - destTile.y);
    if (dist < minDist) {
      minDist = dist;
      bestCell = cell;
    }
  }
  
  if (!bestCell || bestCell.path.length === 0) {
    result.pathFound = false;
    return result;
  }
  
  result.pathFound = true;
  result.plannedPath = bestCell.path;
  result.plannedActions = bestCell.path.map(p => p.action);
  result.totalSteps = bestCell.path.length;
  
  // Now simulate each step and compare
  let currentState: PhysicsState = {
    x: startTile.x * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2,
    y: startTile.y * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2,
    vx: 0,
    vy: 0,
    gravity: startTile.gravity,
    grounded: true,
    width: PLAYER.COLLIDER_SIZE,
    height: PLAYER.COLLIDER_SIZE,
    jumpHeld: false,
  };
  
  for (let i = 0; i < bestCell.path.length; i++) {
    const action = bestCell.path[i];
    const step: TestStep = {
      stepIndex: i,
      action: action.action,
      
      expectedStart: action.start,
      expectedLanding: action.landing,
      expectedLateral: action.lateral,
      
      actualStart: {
        x: Math.floor((currentState.x + currentState.width / 2) / TILE),
        y: Math.floor((currentState.y + currentState.height / 2) / TILE),
        gravity: currentState.gravity
      },
      actualLanding: null,
      actualInput: { up: false, down: false, left: false, right: false, jump: false },
      
      passed: false,
      errorDetails: [],
    };
    
    // Check start position matches expected
    // Note: For falls, planner's "start" is the edge position (one tile over) since falls 
    // include an implicit walk-to-edge step. Skip start check for falls.
    const isFall = action.action.startsWith("fall");
    if (!isFall) {
      if (step.actualStart.x !== action.start.x || step.actualStart.y !== action.start.y) {
        step.errorDetails.push(
          `Start mismatch: expected (${action.start.x},${action.start.y}) got (${step.actualStart.x},${step.actualStart.y})`
        );
      }
      
      if (step.actualStart.gravity !== action.start.gravity) {
        step.errorDetails.push(
          `Gravity mismatch at start: expected ${action.start.gravity} got ${step.actualStart.gravity}`
        );
      }
    }
    
    // Simulate the action
    const simResult = simulateAction(currentState, action, grid, solidTypes);
    step.actualLanding = simResult.landing;
    step.actualInput = simResult.inputUsed;
    
    // Check landing position matches expected
    if (action.landing) {
      if (!simResult.landing) {
        step.errorDetails.push(`Expected landing at (${action.landing.x},${action.landing.y}) but simulation failed`);
      } else {
        if (simResult.landing.x !== action.landing.x || simResult.landing.y !== action.landing.y) {
          step.errorDetails.push(
            `Landing mismatch: expected (${action.landing.x},${action.landing.y}) got (${simResult.landing.x},${simResult.landing.y})`
          );
        }
        if (simResult.landing.gravity !== action.landing.gravity) {
          step.errorDetails.push(
            `Gravity mismatch at landing: expected ${action.landing.gravity} got ${simResult.landing.gravity}`
          );
        }
      }
    }
    
    step.passed = step.errorDetails.length === 0;
    if (step.passed) result.passedSteps++;
    else result.failedSteps++;
    
    result.steps.push(step);
    
    // Update current state for next iteration
    if (simResult.landing) {
      currentState = {
        ...currentState,
        x: simResult.landing.x * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2,
        y: simResult.landing.y * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2,
        vx: 0,
        vy: 0,
        gravity: simResult.landing.gravity,
        grounded: true,
      };
    }
  }
  
  result.success = result.failedSteps === 0;
  return result;
}

/**
 * Format test results for console output
 */
export function formatTestResult(result: TestResult): string {
  const lines: string[] = [];
  
  lines.push(`\n${"=".repeat(60)}`);
  lines.push(`TEST: ${result.testName}`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(`Start: (${result.startTile.x}, ${result.startTile.y}) gravity=${result.startTile.gravity}`);
  lines.push(`Dest:  (${result.destTile.x}, ${result.destTile.y})`);
  lines.push(`Path found: ${result.pathFound ? "YES" : "NO"}`);
  
  if (!result.pathFound) {
    lines.push(`\n❌ NO PATH FOUND`);
    return lines.join("\n");
  }
  
  lines.push(`Planned actions: [${result.plannedActions.join(", ")}]`);
  lines.push(`\n--- Step Results ---`);
  
  for (const step of result.steps) {
    const status = step.passed ? "✅" : "❌";
    lines.push(`\n${status} Step ${step.stepIndex}: ${step.action}`);
    lines.push(`   Expected: (${step.expectedStart.x},${step.expectedStart.y}) → (${step.expectedLanding?.x ?? "?"},${step.expectedLanding?.y ?? "?"}) [lateral=${step.expectedLateral}]`);
    lines.push(`   Actual:   (${step.actualStart.x},${step.actualStart.y}) → (${step.actualLanding?.x ?? "?"},${step.actualLanding?.y ?? "?"}) [input=${JSON.stringify(step.actualInput)}]`);
    
    if (!step.passed) {
      for (const err of step.errorDetails) {
        lines.push(`   ⚠️  ${err}`);
      }
    }
  }
  
  lines.push(`\n--- Summary ---`);
  lines.push(`Total: ${result.totalSteps} | Passed: ${result.passedSteps} | Failed: ${result.failedSteps}`);
  lines.push(result.success ? "✅ TEST PASSED" : "❌ TEST FAILED");
  
  return lines.join("\n");
}

/**
 * Run all standard tests
 */
export function runAllTests(grid: string[][], solidTypes: string[]): TestResult[] {
  const results: TestResult[] = [];
  
  // Test 1: Walk on DOWN gravity floor
  results.push(runPathfindingTest(
    "Walk Right (DOWN gravity)",
    { x: 3, y: 4, gravity: "DOWN" },
    { x: 5, y: 4 },
    grid, solidTypes
  ));
  
  // Test 2: Walk on UP gravity ceiling
  results.push(runPathfindingTest(
    "Walk Right (UP gravity ceiling)",
    { x: 10, y: 2, gravity: "UP" },
    { x: 12, y: 2 },
    grid, solidTypes
  ));
  
  // Test 3: Jump across gap
  results.push(runPathfindingTest(
    "Jump across shaft (DOWN gravity)",
    { x: 6, y: 4, gravity: "DOWN" },
    { x: 9, y: 4 },
    grid, solidTypes
  ));
  
  // Test 4: Multi-step path from Nim's start to destination
  results.push(runPathfindingTest(
    "Nim ceiling to shaft (UP gravity)",
    { x: 12, y: 2, gravity: "UP" },
    { x: 14, y: 6 },
    grid, solidTypes
  ));
  
  return results;
}

/**
 * Detailed step-by-step simulation with frame-by-frame logging.
 * Use this to debug exactly where physics diverges from expectations.
 */
export function runDetailedTest(
  testName: string,
  startTile: { x: number; y: number; gravity: PhysGravity },
  destTile: { x: number; y: number },
  grid: string[][],
  solidTypes: string[],
  logEveryFrame: boolean = false
): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`DETAILED TEST: ${testName}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Start: cell (${startTile.x}, ${startTile.y}) gravity=${startTile.gravity}`);
  console.log(`Dest:  cell (${destTile.x}, ${destTile.y})`);
  
  // Plan the path
  const reachable = calculateReachableCells(startTile.x, startTile.y, startTile.gravity, grid, solidTypes);
  
  // Find the destination cell (any gravity)
  const destCell = reachable.find(cell => cell.x === destTile.x && cell.y === destTile.y);
  
  if (!destCell) {
    console.log(`❌ NO PATH: Destination (${destTile.x},${destTile.y}) not reachable from start`);
    console.log(`   Reachable cells: ${reachable.length}`);
    // Log nearby reachable cells
    const nearby = reachable.filter(c => Math.abs(c.x - destTile.x) <= 2 && Math.abs(c.y - destTile.y) <= 2);
    if (nearby.length > 0) {
      console.log(`   Nearby reachable: ${nearby.map(c => `(${c.x},${c.y})`).join(', ')}`);
    }
    return;
  }
  
  // Path is already stored in the cell
  const path = destCell.path;
  
  console.log(`\nPlanned path (${path.length} steps):`);
  path.forEach((step, i) => {
    console.log(`  ${i}: ${step.action} (${step.start.x},${step.start.y}) → (${step.landing?.x},${step.landing?.y}) lateral=${step.lateral}`);
  });
  
  // Initialize physics state
  let state: PhysicsState = {
    x: startTile.x * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2,
    y: startTile.y * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2,
    vx: 0,
    vy: 0,
    width: PLAYER.COLLIDER_SIZE,
    height: PLAYER.COLLIDER_SIZE,
    gravity: startTile.gravity,
    grounded: true,
    jumpHeld: false,
    coyoteFrames: 0,
    jumpBufferFrames: 0,
  };
  
  console.log(`\nInitial state: pos=(${state.x.toFixed(1)}, ${state.y.toFixed(1)}) cell=(${startTile.x}, ${startTile.y})`);
  
  // Execute each step
  for (let stepIdx = 0; stepIdx < path.length; stepIdx++) {
    const action = path[stepIdx];
    console.log(`\n--- Step ${stepIdx}: ${action.action} ---`);
    console.log(`  Expected: (${action.start.x},${action.start.y}) → (${action.landing?.x},${action.landing?.y})`);
    console.log(`  Lateral: ${action.lateral}`);
    
    const isJump = action.action.startsWith("jump");
    const isWalk = action.action.startsWith("walk");
    const isFall = action.action.startsWith("fall");
    
    // Get current cell
    const curCellX = Math.floor((state.x + state.width/2) / TILE);
    const curCellY = Math.floor((state.y + state.height/2) / TILE);
    console.log(`  Actual start: cell (${curCellX}, ${curCellY}) pos=(${state.x.toFixed(1)}, ${state.y.toFixed(1)})`);
    
    // Check start position matches expected
    if (curCellX !== action.start.x || curCellY !== action.start.y) {
      console.log(`  ⚠️ START MISMATCH: expected (${action.start.x},${action.start.y}) got (${curCellX},${curCellY})`);
    }
    
    let frames = 0;
    const maxFrames = 300;
    let wasGrounded = state.grounded;
    
    // For falls, teleport to edge cell (like test harness does)
    if (isFall) {
      state.x = action.start.x * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2;
      state.y = action.start.y * TILE + TILE / 2 - PLAYER.COLLIDER_SIZE / 2;
      state.vx = 0;
      state.vy = 0;
      state.grounded = false;
      wasGrounded = false;
      console.log(`  [FALL] Teleported to edge cell, starting fall`);
    }
    
    // Build input
    const input: ScreenInput = { up: false, down: false, left: false, right: false, jump: isJump, lateral: action.lateral };
    console.log(`  Input: lateral=${action.lateral}, jump=${isJump}`);
    
    // Simulate
    let landed = false;
    while (frames < maxFrames && !landed) {
      // First frame of jump has jump=true, subsequent frames have jump=false
      const frameInput: ScreenInput = { 
        ...input, 
        jump: isJump && frames === 0,
        lateral: action.lateral 
      };
      
      const prevState = { ...state };
      state = updatePhysics(state, frameInput, grid, solidTypes);
      frames++;
      
      const cx = state.x + state.width/2;
      const cy = state.y + state.height/2;
      const cellX = Math.floor(cx / TILE);
      const cellY = Math.floor(cy / TILE);
      
      // Log frame if requested
      if (logEveryFrame || frames <= 5 || frames % 20 === 0) {
        console.log(`    Frame ${frames}: cell=(${cellX},${cellY}) pos=(${cx.toFixed(1)},${cy.toFixed(1)}) vel=(${state.vx.toFixed(2)},${state.vy.toFixed(2)}) grounded=${state.grounded} grav=${state.gravity}`);
      }
      
      // Check for out-of-bounds (the bug we're hunting!)
      const gridHeight = grid.length;
      const gridWidth = grid[0]?.length ?? 0;
      if (cellX < 0 || cellX >= gridWidth || cellY < 0 || cellY >= gridHeight) {
        console.log(`  🚨 OUT OF BOUNDS at frame ${frames}!`);
        console.log(`     Cell (${cellX}, ${cellY}) outside grid (${gridWidth}x${gridHeight})`);
        console.log(`     Pos: (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
        console.log(`     Vel: (${state.vx.toFixed(2)}, ${state.vy.toFixed(2)})`);
        console.log(`     Prev pos: (${(prevState.x + prevState.width/2).toFixed(1)}, ${(prevState.y + prevState.height/2).toFixed(1)})`);
        console.log(`     Prev vel: (${prevState.vx.toFixed(2)}, ${prevState.vy.toFixed(2)})`);
        return; // Stop test
      }
      
      // Check for landing (walk reaches target, jump/fall lands)
      if (isWalk) {
        const targetX = (action.landing?.x ?? action.start.x) * TILE + TILE / 2;
        const targetY = (action.landing?.y ?? action.start.y) * TILE + TILE / 2;
        const dist = Math.abs(cx - targetX) + Math.abs(cy - targetY);
        if (dist < TILE * 0.4) {
          landed = true;
        }
      } else {
        // Jump/fall: detect landing
        if (!wasGrounded && state.grounded) {
          landed = true;
        }
        wasGrounded = state.grounded;
      }
    }
    
    // Report result
    const finalCX = state.x + state.width/2;
    const finalCY = state.y + state.height/2;
    const finalCellX = Math.floor(finalCX / TILE);
    const finalCellY = Math.floor(finalCY / TILE);
    
    console.log(`  Result: landed at cell (${finalCellX}, ${finalCellY}) after ${frames} frames`);
    
    if (action.landing) {
      if (finalCellX === action.landing.x && finalCellY === action.landing.y) {
        console.log(`  ✅ MATCHES expected landing`);
      } else {
        console.log(`  ❌ MISMATCH: expected (${action.landing.x},${action.landing.y})`);
      }
    }
    
    // Update state for next step
    state.vx = 0;
    state.vy = 0;
  }
  
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST COMPLETE`);
  console.log(`${"=".repeat(70)}`);
}

/**
 * Run the Pink Nim → (9,9) test that JP requested.
 * Pink Nim starts at (12,2) with UP gravity.
 */
export function runPinkNimTest(grid: string[][], solidTypes: string[]): void {
  runDetailedTest(
    "Pink Nim → (9,9)",
    { x: 12, y: 2, gravity: "UP" },
    { x: 9, y: 9 },
    grid,
    solidTypes,
    true  // Log every frame to see exactly what happens
  );
}
