# Bitship Pathfinding System

## Overview

BFS-based pathfinding that handles omnidirectional gravity. Characters can walk on floors, ceilings, and walls depending on their current gravity.

## State Space

Traditional 2D pathfinding uses `(x, y)` nodes.
Bitship uses `(x, y, gravity)` nodes because the same cell can be traversed differently depending on gravity orientation.

### Valid Standing Positions

A state `(x, y, gravity)` is valid when:
1. Cell `(x, y)` is **empty** (not solid)
2. Cell in the **gravity direction** is **solid** (that's the "floor")

```
Gravity DOWN:  floor at (x, y+1) - walking on bottom of cell
Gravity UP:    floor at (x, y-1) - walking on ceiling
Gravity LEFT:  floor at (x-1, y) - walking on left wall
Gravity RIGHT: floor at (x+1, y) - walking on right wall
```

## Edge Types (Movement Actions)

### Walk
- Move laterally along current floor (perpendicular to gravity)
- Gravity stays the same
- Must have valid floor at destination

### Jump  
- Leave current surface, travel through air
- May land on a different surface type
- **Gravity changes** to match the surface landed on

### Fall
- Walk off an edge with no floor
- Fall in gravity direction until hitting a surface
- Gravity may change if you grab a wall mid-fall

## BFS Algorithm

```typescript
findPath(grid, solidTypes, start: PathNode, goal: {x, y, gravity?})
```

1. Start with `(startX, startY, startGravity)` in queue
2. For each node, explore all neighbors (walk + jump + fall)
3. Mark visited nodes by their `(x, y, gravity)` key
4. First path to reach goal is shortest (BFS property)
5. Reconstruct path by following parent pointers

## Path Output

```typescript
interface PathStep {
  node: { x, y, gravity };
  action: "start" | "walk" | "jump" | "fall";
}
```

Example path:
```
Start at (10, 4) with gravity DOWN
Walk right to (11, 4)
Walk right to (12, 4)
Jump to (12, 2), gravity → UP
Walk left to (11, 2)
Walk left to (10, 2)
```

## Puzzle Navigation

Sometimes the shortest Euclidean distance isn't walkable. The path may require:

1. Walking to a shaft/vertical passage
2. Jumping to reach the ceiling
3. Walking along the ceiling
4. Dropping down or jumping to a wall
5. Finally reaching the destination

BFS naturally finds the shortest **sequence of state transitions**, even if it's not the shortest straight-line distance.

## Usage

```typescript
import { findPath, describePath } from "@/lib/pathfinding";

const path = findPath(
  grid,
  SOLID_TILES,
  { x: 10, y: 5, gravity: "DOWN" },
  { x: 20, y: 3 }  // gravity optional - any gravity accepted
);

if (path) {
  console.log(describePath(path));
  // Use path for AI navigation or visual overlay
}
```

## Future Enhancements

- [ ] Weighted edges (prefer walking over jumping)
- [ ] Diagonal gravity (8 directions)
- [ ] Jump trajectory simulation (not just vertical)
- [ ] Dynamic obstacles
- [ ] Path caching for common routes
- [ ] Waypoint system for named locations ("Bridge", "Engine Room")
