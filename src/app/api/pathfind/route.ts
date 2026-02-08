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
import { generateShipGrid, SOLID_TILES, SHIP_W, SHIP_H } from "@/lib/ship-grid";

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
    
    // Filter by y if specified
    const filterY = searchParams.get("y");
    const filteredStates = filterY 
      ? states.filter(s => s.y === parseInt(filterY))
      : states;
    
    return NextResponse.json({
      count: states.length,
      filtered: filteredStates.length,
      sample: filteredStates.slice(0, 100),  // First 100 of filtered
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
