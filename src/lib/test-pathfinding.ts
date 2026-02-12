// Test script for physics pathfinding
// Run with: npx tsx src/lib/test-pathfinding.ts

import { calculateReachableCells, findJumpPath, getJumpTrajectories } from "./physics-pathfinding";

// Simple test grid matching the ship layout
const testGrid: string[][] = Array(16).fill(null).map(() => Array(32).fill("space"));

// Add floor at y=10 (Cargo deck floor - characters stand at y=9)
for (let x = 0; x < 32; x++) {
  testGrid[10][x] = "floor";
}

// Add ceiling at y=2 (Bridge ceiling where Nim is)
for (let x = 9; x < 15; x++) {
  testGrid[2][x] = "floor";
}

// Add shafts (passable interior, not hull)
for (let y = 3; y < 10; y++) {
  testGrid[y][7] = "interior";  // Left shaft
  testGrid[y][8] = "interior";  // Left shaft
  testGrid[y][17] = "interior"; // Right shaft
  testGrid[y][18] = "interior"; // Right shaft
}

// Add hull outline
for (let x = 0; x < 32; x++) {
  testGrid[0][x] = "hull";
  testGrid[15][x] = "hull";
}
for (let y = 0; y < 16; y++) {
  testGrid[y][0] = "hull";
  testGrid[y][31] = "hull";
}

// Add a vertical wall for wall-jumping (like a shaft wall)
for (let y = 3; y < 10; y++) {
  testGrid[y][4] = "hull"; // Wall to the left of CODEX at x=5
}

const SOLID_TILES = ["hull", "hullLight", "floor", "console", "desk"];

console.log("=== Testing Physics Pathfinding ===\n");

// Test 1: CODEX in Cargo (5, 9), standing on floor at y=10, gravity DOWN
// Target: Nim on Bridge ceiling (12, 2), gravity UP
console.log("Test 1: CODEX in Cargo → Nim on Bridge ceiling");
console.log("Start: (5, 9, DOWN) - standing on floor at y=10");
console.log("Target: (12, 2, UP)\n");

const reachable = calculateReachableCells(5, 9, "DOWN", testGrid, SOLID_TILES);
console.log(`\nFound ${reachable.length} reachable cells:`);
reachable.forEach((cell, i) => {
  const distToNim = Math.abs(cell.x - 12) + Math.abs(cell.y - 2);
  console.log(`  ${i}: (${cell.x}, ${cell.y}, ${cell.gravity}) path=${cell.path.length} jumps, dist to Nim=${distToNim}`);
  if (cell.path.length > 0) {
    cell.path.forEach((jump, j) => {
      console.log(`      Jump ${j}: (${jump.start.x},${jump.start.y})→(${jump.landing?.x},${jump.landing?.y}) ${jump.landing?.gravity}`);
    });
  }
});

// Find best path
const best = reachable.reduce((best, cell) => {
  const dist = Math.abs(cell.x - 12) + Math.abs(cell.y - 2);
  if (dist < best.dist) return { cell, dist };
  return best;
}, { cell: null as any, dist: Infinity });

console.log(`\nBest reachable cell: (${best.cell?.x}, ${best.cell?.y}, ${best.cell?.gravity})`);
console.log(`Distance to Nim: ${best.dist}`);
console.log(`Path length: ${best.cell?.path.length || 0} jumps`);

// Test 2: Get trajectories with debug
console.log("\n=== Test 2: Jump Trajectories from CODEX position ===");

// Test specific jump-left to see if it hits the wall
console.log("\nDebug: Testing jump-left toward wall at x=4:");
console.log("Grid around start position:");
for (let y = 7; y <= 11; y++) {
  let row = "";
  for (let x = 2; x <= 7; x++) {
    const cellType = testGrid[y][x];
    if (x === 5 && y === 9) {
      row += "[C]"; // CODEX position
    } else if (cellType === "hull") {
      row += "[#]";
    } else if (cellType === "floor") {
      row += "[=]";
    } else {
      row += "[ ]";
    }
  }
  console.log(`  y=${y}: ${row}`);
}

const trajectories = getJumpTrajectories(5, 9, "DOWN", testGrid, SOLID_TILES, true);
console.log(`\nFound ${trajectories.length} trajectories:`);
trajectories.forEach((t, i) => {
  if (t.landing) {
    console.log(`  ${i}: ${t.action} → (${t.landing.x}, ${t.landing.y}, ${t.landing.gravity})`);
  } else {
    console.log(`  ${i}: ${t.action} → no landing`);
  }
});

// Debug: Check what cellToPixel returns
import { PHYSICS } from "./physics";
console.log("\n=== Debug: Coordinate System ===");
console.log("TILE = 32");
console.log("Cell (5, 9) with DOWN gravity:");
console.log(`  Expected pixel: (176, 304) - center of tile (5, 9)`);
console.log(`  Floor y: ${10 * 32} to ${11 * 32} (tiles below)`);
console.log(`  Character center at y=304 (standing on floor at 320)`);
console.log("\nJUMP_FORCE =", PHYSICS.JUMP_FORCE);
console.log("GRAVITY =", PHYSICS.GRAVITY);

console.log("\n=== Test 3: Walking paths ===");
const walkPaths = reachable.filter(r => r.path.some(p => p.action.startsWith("walk")));
console.log(`Found ${walkPaths.length} reachable cells using walking:`);
walkPaths.slice(0, 10).forEach((cell, i) => {
  const walkCount = cell.path.filter(p => p.action.startsWith("walk")).length;
  const jumpCount = cell.path.filter(p => p.action.startsWith("jump")).length;
  console.log(`  ${i}: (${cell.x}, ${cell.y}, ${cell.gravity}) - ${walkCount} walks, ${jumpCount} jumps`);
});

console.log("\n=== Test Complete ===");
