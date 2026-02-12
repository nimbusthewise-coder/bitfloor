# Physics-Faithful Pathfinding in Multi-Gravity Environments
## The Pink Nim Journey: From Input Translation Hell to Frame Replay Elegance

**Authors:** JP McMullan & Nimbus  
**Date:** February 12, 2026  
**Project:** Bitfloor - A multi-gravity 2D platformer

---

## Abstract

We present a novel approach to AI pathfinding in physics-based platformers with multiple gravity orientations. After struggling with traditional input-based execution methods, we discovered that **recording and replaying the physics simulation frames directly** produces pixel-perfect, deterministic navigation. This paper documents our journey through failed approaches, key insights, and the elegant solution that emerged.

---

## 1. The Problem Space

### 1.1 Multi-Gravity Platformer Physics

Bitfloor features a spaceship environment where characters can walk on floors, ceilings, and walls. Gravity can be:
- **DOWN** (normal) - walking on floors
- **UP** (inverted) - walking on ceilings  
- **LEFT/RIGHT** - walking on vertical walls

Characters transition between gravity orientations by jumping and landing on surfaces with different normals.

### 1.2 The AI Challenge

We needed Pink Nim (an AI character) to pathfind to any clicked tile, navigating:
- Multiple gravity zones
- Jump arcs with air control
- Falls from ledges
- Tight corridors and platforms

---

## 2. Failed Approaches

### 2.1 Approach 1: Tile-Based A*

**Implementation:** Standard A* pathfinding on a tile grid.

**Problem:** Too coarse. Couldn't represent:
- Continuous jump arcs
- Partial tile movements
- Gravity transition points within tiles

**Lesson:** Tile-based pathfinding works for grid-based games, but physics-based platformers need continuous space representation.

### 2.2 Approach 2: Physics Simulation + Input Translation

**Implementation:**
1. Simulate jumps/walks using the actual physics engine
2. Record the trajectory as a path
3. During execution, translate path steps into controller inputs
4. Let physics recreate the trajectory

**The Input Translation Nightmare:**

```
Path says: "walk-left" (gravity-relative)
AI translates to: nimInput.left = true (screen input)
Physics converts: screen-left → gravity-relative-right (for UP gravity)
Character moves: WRONG DIRECTION
```

We discovered a **double-inversion bug**:
- The AI code inverted inputs for UP gravity
- The physics engine ALSO inverted inputs internally
- Two negatives = positive = wrong direction

**Hours spent debugging:** ~6 hours across multiple sessions

**The Oscillation Problem:**

Even after fixing direction bugs, timing mismatches caused:
- Character overshooting targets
- Oscillating back and forth near destinations
- Jump arcs not matching simulation (different starting positions)

---

## 3. The Breakthrough Insight

### 3.1 JP's Question

> "Why can't we just have the simulation provide a path and the game loop progress the character along that path? The simulation already validated it works - why recreate it?"

This simple question changed everything.

### 3.2 The Realization

The pathfinding simulation already:
- Uses the ACTUAL physics engine
- Produces frame-by-frame positions
- Validates collision and landing
- Stores the trajectory

**Why translate to inputs and hope physics matches when we already HAVE the answer?**

---

## 4. The Solution: Frame-Based Execution

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PATHFINDER                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  For each possible action (jump, walk, fall):       │    │
│  │    1. Create physics state at start position        │    │
│  │    2. Apply input to physics engine                 │    │
│  │    3. Record EVERY frame: {x, y, vx, vy, gravity}  │    │
│  │    4. Continue until landing or timeout             │    │
│  │    5. Store trajectory in JumpResult                │    │
│  └─────────────────────────────────────────────────────┘    │
│                           ↓                                  │
│              Path: JumpResult[] with trajectories            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     PATH EXECUTOR                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  pathToFrames(path):                                │    │
│  │    - Flatten all trajectories into ExecutorFrame[]  │    │
│  │    - For walks: interpolate 15 frames per tile      │    │
│  │    - For jumps/falls: use recorded physics frames   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      GAME LOOP                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Each frame:                                        │    │
│  │    frame = stepExecutor(executorState)              │    │
│  │    character.x = frame.x                            │    │
│  │    character.y = frame.y                            │    │
│  │    character.vx = frame.vx                          │    │
│  │    character.vy = frame.vy                          │    │
│  │    // That's it. No input translation. No physics.  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Key Implementation Details

**JumpResult structure:**
```typescript
interface JumpResult {
  start: { x: number; y: number; gravity: string };
  trajectory: Array<{ x: number; y: number; frame: number }>;
  landing: { x: number; y: number; gravity: string } | null;
  lateral: number;  // -1 to 1, air control input
  action: string;   // "jump-left", "walk-right", "fall-down", etc.
  cost: number;
}
```

**ExecutorFrame structure:**
```typescript
interface ExecutorFrame {
  x: number;      // top-left position
  y: number;
  centerX: number;
  centerY: number;
  vx: number;     // velocity (for animation)
  vy: number;
  gravity: GravityDirection;
  grounded: boolean;
  action: string;
}
```

**Walk frame generation:**
```typescript
// Walks have empty trajectory[], so we interpolate
const WALK_FRAMES_PER_TILE = 15;  // ~0.25s at 60fps

if (isWalk && trajectory.length === 0 && action.landing) {
  const numFrames = Math.round(distance / TILE * WALK_FRAMES_PER_TILE);
  for (let i = 0; i <= numFrames; i++) {
    const t = i / numFrames;
    frames.push({
      x: lerp(startX, endX, t),
      y: lerp(startY, endY, t),
      vx: i === numFrames ? 0 : dx / numFrames,  // Zero on last frame
      // ...
    });
  }
}
```

---

## 5. Additional Bugs Discovered

### 5.1 Gravity-Relative vs World Coordinate Confusion

**The bug:** `cellToPixel()` returned tile center for ALL gravities.

**The reality:** Characters stand at different positions based on gravity:
- DOWN: feet on floor (bottom of cell)
- UP: feet on ceiling (top of cell)
- LEFT: pushed against right wall
- RIGHT: pushed against left wall

**Impact:** Jump trajectories started from wrong positions, causing misses.

### 5.2 Cost Function Imbalance

**The bug:** Walks and jumps had similar costs per cell.

**The problem:** AI would jump to adjacent cells instead of walking.

**The fix:**
```typescript
const JUMP_PENALTY = 20;  // Extra cost for jumping
const MIN_JUMP_CELLS = 3;  // Minimum cells for jump cost

// Result: walking 1 cell = 4, jumping anywhere = 32+
```

### 5.3 Arrival Detection

**The bug:** Using Manhattan distance for "close enough" check.

**The problem:** Diagonal destinations never triggered arrival.

**The fix:** Euclidean distance + snap to destination on arrival + zero velocity.

---

## 6. Results

### 6.1 Before (Input-Based)
- ❌ Wrong direction movement
- ❌ Oscillation near targets
- ❌ Missed landings
- ❌ 6+ hours debugging gravity inversions
- ❌ Complex input translation code

### 6.2 After (Frame-Based)
- ✅ Pixel-perfect trajectory following
- ✅ Deterministic behavior
- ✅ ~50 lines of executor code
- ✅ Works for all gravity orientations
- ✅ What you simulate is what you get

---

## 7. Lessons Learned

### 7.1 "Don't Fight Physics Twice"

If your planner uses physics simulation, your executor shouldn't re-simulate. Record the movie, play it back.

### 7.2 "Coordinate System Confusion is Real"

When mixing:
- Screen coordinates (what players see)
- World coordinates (absolute positions)
- Gravity-relative coordinates (what characters perceive)

...bugs will hide in the translations. Document your coordinate systems explicitly.

### 7.3 "Simplicity Beats Cleverness"

Our input translation approach was "clever" - trying to recreate physics from high-level commands. The frame replay approach is "simple" - just play back what worked. Simple won.

### 7.4 "Cost Functions Shape Behavior"

AI will do whatever's cheapest. If jumping and walking cost the same, expect bouncy AI. Match costs to player intuition.

---

## 8. Future Work

- **Dynamic obstacle avoidance:** Detect collisions during execution, replan
- **Smooth path blending:** Interpolate between paths when destination changes
- **Predictive replanning:** Start computing new path before current one completes
- **Multi-agent coordination:** Prevent Nim and Codex from colliding

---

## 9. Conclusion

Physics-based pathfinding doesn't have to be hard. The key insight is recognizing that **simulation IS execution** - you just need to record it. By treating the pathfinder's physics simulation as the authoritative trajectory and simply replaying it, we achieved deterministic, pixel-perfect AI navigation in a complex multi-gravity environment.

The journey from input translation hell to frame replay elegance took several sessions and many debugging hours, but the final solution is remarkably simple. Sometimes the best architecture is the one that does less.

---

## Appendix: Code References

- **Pathfinder:** `/src/lib/physics-pathfinding.ts`
- **Frame Executor:** `/src/lib/path-executor.ts`
- **Game Loop Integration:** `/src/app/ship/page.tsx` (lines ~700-730)
- **AI Tick:** `/src/app/ship/page.tsx` (lines ~1260-1450)

---

*"Why recreate when you can replay?" - JP McMullan, 2026*
