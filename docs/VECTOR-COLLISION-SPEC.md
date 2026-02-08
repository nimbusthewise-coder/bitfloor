# Vector-Based Collision System Spec

## Goal
Replace tile-based slope collision with proper vector/line-segment collision that works in all gravity directions (4 cardinal, eventually 8 with diagonals).

## Current Problems
- Slopes treated as special-case tiles with hacky post-processing
- X-collision interferes with slope traversal
- Corner landing causes character to get embedded
- Code is DOWN-gravity specific, won't work when rotated

## Design

### 1. Collision Geometry
Each tile can have collision defined as **line segments** rather than just solid/empty:

```typescript
interface CollisionSegment {
  x1: number;  // Start point (relative to tile, 0-1 normalized)
  y1: number;
  x2: number;  // End point
  y2: number;
  normal: { x: number; y: number };  // Surface normal (points away from solid)
  oneWay?: boolean;  // Only collide from normal direction (platforms)
}

// Tile collision definitions
const TILE_COLLISION: Record<string, CollisionSegment[]> = {
  // Solid tile = 4 edges
  "floor": [
    { x1: 0, y1: 0, x2: 1, y2: 0, normal: { x: 0, y: -1 } },  // Top
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },   // Right
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },   // Bottom
    { x1: 0, y1: 1, x2: 0, y2: 0, normal: { x: -1, y: 0 } },  // Left
  ],
  
  // slopeBR (◢) = diagonal + two edges
  "slopeBR": [
    { x1: 0, y1: 1, x2: 1, y2: 0, normal: { x: 0.707, y: -0.707 } },  // Diagonal surface
    { x1: 1, y1: 0, x2: 1, y2: 1, normal: { x: 1, y: 0 } },           // Right edge
    { x1: 1, y1: 1, x2: 0, y2: 1, normal: { x: 0, y: 1 } },           // Bottom edge
  ],
  
  // slopeBL (◣) = diagonal + two edges
  "slopeBL": [
    { x1: 0, y1: 0, x2: 1, y2: 1, normal: { x: -0.707, y: -0.707 } }, // Diagonal surface
    { x1: 0, y1: 0, x2: 0, y2: 1, normal: { x: -1, y: 0 } },          // Left edge
    { x1: 0, y1: 1, x2: 1, y2: 1, normal: { x: 0, y: 1 } },           // Bottom edge
  ],
  
  // ... slopeUL, slopeUR for ceiling slopes
};
```

### 2. Character Sensors
Instead of AABB collision, use sensor points that cast rays in the gravity direction:

```typescript
interface CharacterSensors {
  // Floor sensors (cast in gravity direction)
  floorLeft: { x: number; y: number };   // Left foot
  floorRight: { x: number; y: number };  // Right foot
  floorCenter: { x: number; y: number }; // Center (for slopes)
  
  // Wall sensors (cast perpendicular to gravity)
  wallLeft: { x: number; y: number };
  wallRight: { x: number; y: number };
  
  // Ceiling sensors (cast opposite to gravity)
  ceilLeft: { x: number; y: number };
  ceilRight: { x: number; y: number };
}
```

### 3. Collision Algorithm

```
For each frame:
1. Apply velocity to get new position
2. For each sensor:
   a. Cast ray from sensor in appropriate direction
   b. Find all line segments that intersect the ray
   c. Find closest intersection point
   d. If intersection is within sensor range, we have a collision
3. Resolve collisions:
   a. Push character out along surface normal
   b. Project velocity onto surface (slide along it)
4. Determine grounded state based on floor sensor hits
```

### 4. Gravity-Relative
All sensor directions rotate with gravity:
- DOWN gravity: floor sensors point down, wall sensors point left/right
- LEFT gravity: floor sensors point left, wall sensors point up/down
- etc.

### 5. Slope Surface Detection
For smooth slope traversal:
- Use center floor sensor to detect slope surface
- Snap Y (relative to gravity) to slope surface when grounded
- Track slope angle for physics (running downhill = faster, uphill = slower)

## Implementation Steps

1. Create `src/lib/vector-collision.ts` with:
   - `CollisionSegment` interface
   - `TILE_COLLISION` definitions
   - `lineIntersection()` helper
   - `castSensor()` function
   - `resolveCollisions()` function

2. Update `physics.ts`:
   - Replace `checkAndResolveCollision()` with vector-based system
   - Update sensor positions based on gravity
   - Remove slope-specific hacks

3. Test with:
   - Walking up/down slopes in all 4 gravity directions
   - Jumping onto slope corners
   - Transitioning between slopes and flat ground

## Files to Modify
- `src/lib/physics.ts` - Replace collision system
- `src/lib/vector-collision.ts` - New file with vector collision logic
- `src/app/ship/page.tsx` - May need to update tile definitions

## References
- Sonic Physics Guide (height-map approach)
- https://danjb.com/game_dev/tilebased_platformer_slopes_2 (post-processing approach)
- SAT (Separating Axis Theorem) for polygon collision
