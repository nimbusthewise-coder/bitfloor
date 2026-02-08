/**
 * Pathfinding API
 * Test endpoint for navigation system
 */

import { NextResponse } from "next/server";
import { 
  findPath, 
  describePath, 
  getNavigationStats,
  getAllValidStates,
  GravityDir 
} from "@/lib/pathfinding";

// Simplified ship grid (matches ship/page.tsx structure)
// In production, this would be shared or fetched
const SHIP_W = 32;
const SHIP_H = 16;
const SOLID_TILES = ["hull", "hullLight", "floor", "console", "desk"];

// Generate a simplified version of the ship grid
function generateShipGrid(): string[][] {
  const grid: string[][] = Array(SHIP_H).fill(null).map(() => 
    Array(SHIP_W).fill("interior")
  );
  
  // Hull outline
  for (let x = 0; x < SHIP_W - 3; x++) {
    grid[0][x] = "hull";
    grid[11][x] = "hull";
    grid[12][x] = "hull";
  }
  
  // Side hull
  for (let y = 0; y < 13; y++) {
    grid[y][0] = "hull";
    if (SHIP_W - 4 >= 0) grid[y][SHIP_W - 4] = "hull";
  }
  
  // Upper deck floors (row 5)
  for (let x = 1; x < SHIP_W - 4; x++) {
    if (x !== 7 && x !== 8 && x !== 17 && x !== 18) { // Skip shafts
      grid[5][x] = "floor";
    }
  }
  
  // Lower deck floors (row 10)  
  for (let x = 1; x < SHIP_W - 4; x++) {
    if (x !== 7 && x !== 8 && x !== 17 && x !== 18) { // Skip shafts
      grid[10][x] = "floor";
    }
  }
  
  // Shafts (vertical passages - interior, not floor)
  for (let y = 1; y < 11; y++) {
    grid[y][7] = "interior";
    grid[y][8] = "interior";
    grid[y][17] = "interior";
    grid[y][18] = "interior";
  }
  
  return grid;
}

const shipGrid = generateShipGrid();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const action = searchParams.get("action") || "stats";
  
  if (action === "stats") {
    // Return navigation graph statistics
    const stats = getNavigationStats(shipGrid, SOLID_TILES);
    return NextResponse.json({
      stats,
      gridSize: { width: SHIP_W, height: SHIP_H }
    });
  }
  
  if (action === "path") {
    // Find a path between two points
    const startX = parseInt(searchParams.get("startX") || "10");
    const startY = parseInt(searchParams.get("startY") || "4");
    const startGravity = (searchParams.get("startGravity") || "DOWN") as GravityDir;
    const goalX = parseInt(searchParams.get("goalX") || "20");
    const goalY = parseInt(searchParams.get("goalY") || "9");
    const goalGravity = searchParams.get("goalGravity") as GravityDir | undefined;
    
    const path = findPath(
      shipGrid,
      SOLID_TILES,
      { x: startX, y: startY, gravity: startGravity },
      { x: goalX, y: goalY, gravity: goalGravity || undefined }
    );
    
    if (path) {
      return NextResponse.json({
        found: true,
        steps: path.length,
        path,
        description: describePath(path)
      });
    } else {
      return NextResponse.json({
        found: false,
        message: "No path found between these positions"
      });
    }
  }
  
  if (action === "states") {
    // Return all valid standing positions (limited for performance)
    const states = getAllValidStates(shipGrid, SOLID_TILES);
    return NextResponse.json({
      count: states.length,
      sample: states.slice(0, 50),  // First 50 only
      byGravity: {
        DOWN: states.filter(s => s.gravity === "DOWN").length,
        UP: states.filter(s => s.gravity === "UP").length,
        LEFT: states.filter(s => s.gravity === "LEFT").length,
        RIGHT: states.filter(s => s.gravity === "RIGHT").length,
      }
    });
  }
  
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
