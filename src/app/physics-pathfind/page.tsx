"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calculateReachableCells, findClosestReachable, getJumpTrajectories, JumpResult, ReachableCell } from "@/lib/physics-pathfinding";

const CELL_SIZE = 24;
const GRID_WIDTH = 30;
const GRID_HEIGHT = 20;

export default function PhysicsPathfindingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid] = useState(() => generateTestGrid());
  const [startPos, setStartPos] = useState({ x: 5, y: 17, gravity: "DOWN" as const });
  const [targetPos, setTargetPos] = useState({ x: 12, y: 2, gravity: "UP" as const });
  const [selecting, setSelecting] = useState<"start" | "target" | null>(null);
  const [reachable, setReachable] = useState<ReachableCell[]>([]);
  const [trajectories, setTrajectories] = useState<JumpResult[]>([]);
  const [selectedCell, setSelectedCell] = useState<ReachableCell | null>(null);
  const [pathToTarget, setPathToTarget] = useState<ReachableCell | null>(null);

  // Calculate all reachable cells
  useEffect(() => {
    const cells = calculateReachableCells(
      startPos.x, startPos.y, startPos.gravity,
      grid, ["hull", "hullLight", "floor", "console", "desk"]
    );
    setReachable(cells);

    // Calculate trajectories for visualization
    const trajs = getJumpTrajectories(
      startPos.x, startPos.y, startPos.gravity,
      grid, ["hull", "hullLight", "floor", "console", "desk"]
    );
    setTrajectories(trajs);

    // Check if target is reachable
    const path = findClosestReachable(
      startPos.x, startPos.y, startPos.gravity,
      targetPos.x, targetPos.y,
      grid, ["hull", "hullLight", "floor", "console", "desk"]
    );
    setPathToTarget(path.cell);
  }, [startPos, targetPos, grid]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = grid[y][x];
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        switch (cell) {
          case "hull":
          case "hullLight":
            ctx.fillStyle = "#00ffff";
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          case "floor":
            ctx.fillStyle = "#00cccc";
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          case "console":
          case "desk":
            ctx.fillStyle = "#ff0066";
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          case "interior":
          case "hallway":
          case "shaft":
            ctx.fillStyle = "#2a2a4a";
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          default:
            ctx.strokeStyle = "#1a1a2e";
            ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    // Draw all reachable cells (green dots)
    ctx.fillStyle = "#00ff00";
    for (const cell of reachable) {
      if (cell.x === startPos.x && cell.y === startPos.y) continue;
      ctx.beginPath();
      ctx.arc(
        cell.x * CELL_SIZE + CELL_SIZE / 2,
        cell.y * CELL_SIZE + CELL_SIZE / 2,
        4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Draw selected cell path
    if (selectedCell) {
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      for (const jump of selectedCell.path) {
        if (jump.trajectory.length > 1) {
          ctx.beginPath();
          const first = jump.trajectory[0];
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < jump.trajectory.length; i++) {
            const point = jump.trajectory[i];
            ctx.lineTo(point.x, point.y);
          }
          ctx.stroke();
        }
      }
    }

    // Draw start position
    ctx.fillStyle = "#00ff00";
    ctx.beginPath();
    ctx.arc(
      startPos.x * CELL_SIZE + CELL_SIZE / 2,
      startPos.y * CELL_SIZE + CELL_SIZE / 2,
      8,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px monospace";
    ctx.fillText("S", startPos.x * CELL_SIZE + CELL_SIZE / 2 - 4, startPos.y * CELL_SIZE + CELL_SIZE / 2 + 3);

    // Draw target position
    ctx.fillStyle = "#ff00aa";
    ctx.beginPath();
    ctx.arc(
      targetPos.x * CELL_SIZE + CELL_SIZE / 2,
      targetPos.y * CELL_SIZE + CELL_SIZE / 2,
      8,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px monospace";
    ctx.fillText("T", targetPos.x * CELL_SIZE + CELL_SIZE / 2 - 4, targetPos.y * CELL_SIZE + CELL_SIZE / 2 + 3);

    // Draw dashed line from start to target
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startPos.x * CELL_SIZE + CELL_SIZE / 2, startPos.y * CELL_SIZE + CELL_SIZE / 2);
    ctx.lineTo(targetPos.x * CELL_SIZE + CELL_SIZE / 2, targetPos.y * CELL_SIZE + CELL_SIZE / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw path to target if exists
    if (pathToTarget) {
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 3;
      for (const jump of pathToTarget.path) {
        if (jump.trajectory.length > 1) {
          ctx.beginPath();
          const first = jump.trajectory[0];
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < jump.trajectory.length; i++) {
            const point = jump.trajectory[i];
            ctx.lineTo(point.x, point.y);
          }
          ctx.stroke();
        }
      }
    }
  }, [grid, reachable, selectedCell, startPos, targetPos, pathToTarget]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return;

    // Check if clicked on a reachable cell
    const clicked = reachable.find(c => c.x === x && c.y === y);
    if (clicked) {
      setSelectedCell(clicked);
      return;
    }

    // Place start or target
    if (selecting === "start") {
      setStartPos({ x, y, gravity: "DOWN" });
      setSelecting(null);
    } else if (selecting === "target") {
      setTargetPos({ x, y, gravity: "UP" });
      setSelecting(null);
    }
  };

  return (
    <div className="p-6 font-mono bg-[#0a0a0f] min-h-screen text-[#00f0ff]">
      <h1 className="text-2xl font-bold mb-4">🪐 Physics-Based Jump Pathfinding</h1>

      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setSelecting("start")}
          className={`px-4 py-2 border ${
            selecting === "start"
              ? "bg-[#00ff00] text-[#0a0a0f] border-[#00ff00]"
              : "border-[#00ff00] text-[#00ff00] hover:bg-[#00ff00]/20"
          }`}
        >
          Set Start
        </button>
        <button
          onClick={() => setSelecting("target")}
          className={`px-4 py-2 border ${
            selecting === "target"
              ? "bg-[#ff00aa] text-[#0a0a0f] border-[#ff00aa]"
              : "border-[#ff00aa] text-[#ff00aa] hover:bg-[#ff00aa]/20"
          }`}
        >
          Set Target
        </button>
        <button
          onClick={() => setSelectedCell(null)}
          className="px-4 py-2 border border-[#ffff00] text-[#ffff00] hover:bg-[#ffff00]/20"
        >
          Clear Path
        </button>
      </div>

      <div className="flex gap-6 text-sm mb-4">
        <span className="text-[#00ff00]">● Start ({startPos.x},{startPos.y})</span>
        <span className="text-[#ff00aa]">● Target ({targetPos.x},{targetPos.y})</span>
        <span className="text-[#00ff00]">● Reachable: {reachable.length - 1} cells</span>
        {pathToTarget ? (
          <span className="text-[#ffff00]">✓ Reachable!</span>
        ) : (
          <span className="text-[#ff0000]">✗ Not reachable</span>
        )}
      </div>

      {selectedCell && (
        <div className="mb-4 p-3 border border-[#ffff00] bg-[#ffff00]/10">
          <p className="text-[#ffff00] font-bold">Selected Cell</p>
          <p>Position: ({selectedCell.x}, {selectedCell.y})</p>
          <p>Cost: {selectedCell.cost} frames</p>
          <p>Path: {selectedCell.path.length} jumps</p>
        </div>
      )}

      <div className="border border-[#00f0ff]/30 p-1 inline-block">
        <canvas
          ref={canvasRef}
          width={GRID_WIDTH * CELL_SIZE}
          height={GRID_HEIGHT * CELL_SIZE}
          onClick={handleCanvasClick}
          className="cursor-crosshair"
        />
      </div>

      <div className="mt-4 text-sm text-gray-400">
        <p>🟢 Green dots = reachable cells from start</p>
        <p>🔴 Click a green cell to see the path</p>
        <p>🟡 Yellow line = path to target (if reachable)</p>
        <p>--- Dashed = direct line to target</p>
      </div>
    </div>
  );
}

// Grid generation
function generateTestGrid(): string[][] {
  const cells: string[][] = Array(GRID_HEIGHT)
    .fill(null)
    .map(() => Array(GRID_WIDTH).fill("space"));

  // Floor
  for (let x = 0; x < GRID_WIDTH; x++) {
    cells[GRID_HEIGHT - 1][x] = "floor";
  }

  // Walls
  for (let y = 10; y < GRID_HEIGHT; y++) {
    cells[y][0] = "hull";
  }
  for (let y = 5; y < GRID_HEIGHT; y++) {
    cells[y][GRID_WIDTH - 1] = "hull";
  }

  // Platforms
  for (let x = 10; x < 20; x++) {
    cells[12][x] = "floor";
  }
  for (let x = 15; x < 25; x++) {
    cells[3][x] = "floor";
  }
  for (let x = 5; x < 10; x++) {
    cells[6][x] = "floor";
  }

  // Floating platforms
  cells[15][8] = "floor";
  cells[15][9] = "floor";
  cells[8][20] = "floor";
  cells[8][21] = "floor";

  return cells;
}
