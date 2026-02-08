/**
 * Ship Grid Definition
 * Shared between ship view and pathfinding
 */

export type CellType = 
  | "space" | "hull" | "hullLight" | "interior" | "window" 
  | "floor" | "console" | "desk" | "shaft" | "hallway";

export const COLORS: Record<CellType, string> = {
  space: "#000000",
  hull: "#00ffff",
  hullLight: "#ffffff",
  interior: "#3333aa",
  window: "#66ffff",
  floor: "#00cccc",
  console: "#ff0066",
  desk: "#4444cc",
  shaft: "#1a1a4a",
  hallway: "#2a2a6a",
};

export const TILE = 32;
export const SHIP_W = 32;
export const SHIP_H = 16;
export const VIEW_W = 20;
export const VIEW_H = 12;
export const ROOM_H = 5;

export const SOLID_TILES: CellType[] = ["hull", "hullLight", "floor", "console", "desk"];

interface Room {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "room" | "hallway" | "shaft" | "hull";
}

export const rooms: Room[] = [
  // Upper deck
  { name: "Engine", x: 1, y: 1, w: 4, h: ROOM_H, type: "room" },
  { name: "Hall-U1", x: 5, y: 1, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Shaft-1", x: 7, y: 1, w: 2, h: ROOM_H * 2, type: "shaft" },
  { name: "Bridge", x: 9, y: 1, w: 6, h: ROOM_H, type: "room" },
  { name: "Hall-U2", x: 15, y: 1, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Shaft-2", x: 17, y: 1, w: 2, h: ROOM_H * 2, type: "shaft" },
  { name: "Quarters", x: 19, y: 1, w: 5, h: ROOM_H, type: "room" },
  { name: "Medical", x: 24, y: 1, w: 5, h: ROOM_H, type: "room" },
  
  // Lower deck
  { name: "Cargo", x: 1, y: 1 + ROOM_H, w: 4, h: ROOM_H, type: "room" },
  { name: "Hall-L1", x: 5, y: 1 + ROOM_H, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Mess Hall", x: 9, y: 1 + ROOM_H, w: 6, h: ROOM_H, type: "room" },
  { name: "Hall-L2", x: 15, y: 1 + ROOM_H, w: 2, h: ROOM_H, type: "hallway" },
  { name: "Rec Room", x: 19, y: 1 + ROOM_H, w: 5, h: ROOM_H, type: "room" },
  { name: "Storage", x: 24, y: 1 + ROOM_H, w: 5, h: ROOM_H, type: "room" },
];

export function generateShipGrid(): CellType[][] {
  const grid: CellType[][] = Array(SHIP_H).fill(null).map(() => 
    Array(SHIP_W).fill("space" as CellType)
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
  
  // Draw rooms
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h && y < SHIP_H; y++) {
      for (let x = room.x; x < room.x + room.w && x < SHIP_W; x++) {
        if (room.type === "shaft") {
          grid[y][x] = "shaft";
        } else if (room.type === "hallway") {
          grid[y][x] = "hallway";
        } else {
          grid[y][x] = "interior";
        }
        
        // Floor on bottom row (not for shafts)
        if (y === room.y + room.h - 1 && room.type !== "shaft") {
          grid[y][x] = "floor";
        }
      }
    }
  }
  
  // Windows in Bridge
  for (let x = 10; x < 14; x++) {
    if (grid[2][x] === "interior") grid[2][x] = "window";
  }
  
  // Windows in Quarters
  for (let x = 20; x < 23; x++) {
    if (grid[2][x] === "interior") grid[2][x] = "window";
  }
  
  // Consoles
  if (grid[4][2]) grid[4][2] = "console";
  if (grid[4][3]) grid[4][3] = "console";
  if (grid[4][10]) grid[4][10] = "console";
  if (grid[4][13]) grid[4][13] = "console";
  
  // Desks
  if (grid[4][21]) grid[4][21] = "desk";
  if (grid[4][22]) grid[4][22] = "desk";
  if (grid[9][11]) grid[9][11] = "desk";
  if (grid[9][12]) grid[9][12] = "desk";
  if (grid[9][13]) grid[9][13] = "desk";
  
  return grid;
}

// Get room by position
export function getRoomAt(x: number, y: number): Room | null {
  for (const room of rooms) {
    if (x >= room.x && x < room.x + room.w &&
        y >= room.y && y < room.y + room.h) {
      return room;
    }
  }
  return null;
}

// Get room by name
export function getRoomByName(name: string): Room | null {
  return rooms.find(r => r.name.toLowerCase() === name.toLowerCase()) || null;
}
