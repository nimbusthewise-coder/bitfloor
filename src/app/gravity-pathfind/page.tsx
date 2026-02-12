'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CellType } from '@/lib/ship-grid';
import {
  findGravityPathAStar,
  GravityDirection,
  GravityPathSegment,
  GravityState,
  getGravityArrow,
  ShipGrid,
  calculateJumpTrajectories,
  JumpTrajectory,
  findClosestReachablePoint,
  calculateJumpTargets,
} from '@/lib/gravity-pathfinding';

const CELL_SIZE = 24;
const GRID_WIDTH = 30;
const GRID_HEIGHT = 20;

// Generate a test ship layout with multiple gravity opportunities
function generateTestGrid(): ShipGrid {
  const cells: CellType[][] = Array(GRID_HEIGHT)
    .fill(null)
    .map(() => Array(GRID_WIDTH).fill('space'));

  // Floor
  for (let x = 0; x < GRID_WIDTH; x++) {
    cells[GRID_HEIGHT - 1][x] = 'floor';
  }

  // Left wall (hull) with platform
  for (let y = 10; y < GRID_HEIGHT; y++) {
    cells[y][0] = 'hull';
  }
  cells[10][1] = 'floor';
  cells[10][2] = 'floor';

  // Right wall (hull)
  for (let y = 5; y < GRID_HEIGHT; y++) {
    cells[y][GRID_WIDTH - 1] = 'hull';
  }

  // Ceiling platform
  for (let x = 15; x < 25; x++) {
    cells[3][x] = 'floor';
  }

  // Central platform (reachable via wall-jump)
  for (let x = 10; x < 20; x++) {
    cells[12][x] = 'floor';
  }

  // Upper platform (requires gravity flip)
  for (let x = 5; x < 10; x++) {
    cells[6][x] = 'floor';
  }

  // Small floating platforms
  cells[15][8] = 'floor';
  cells[15][9] = 'floor';
  cells[8][20] = 'floor';
  cells[8][21] = 'floor';

  return { width: GRID_WIDTH, height: GRID_HEIGHT, cells };
}

export default function GravityPathfindPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid] = useState<ShipGrid>(generateTestGrid);
  const [start, setStart] = useState<GravityState>({ x: 3, y: 18, gravity: 'down' });
  const [target, setTarget] = useState<{ x: number; y: number }>({ x: 22, y: 2 });
  const [path, setPath] = useState<GravityPathSegment[] | null>(null);
  const [selecting, setSelecting] = useState<'start' | 'target' | null>(null);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [trajectories, setTrajectories] = useState<JumpTrajectory[]>([]);
  const [closestPoint, setClosestPoint] = useState<GravityState | null>(null);
  const [closestPointTrajectories, setClosestPointTrajectories] = useState<JumpTrajectory[]>([]);
  const [noPathMessage, setNoPathMessage] = useState<string>('');
  
  // Playable character mode
  const [playMode, setPlayMode] = useState(false);
  const [playerPos, setPlayerPos] = useState({ x: 3, y: 18 });
  const [playerVel, setPlayerVel] = useState({ x: 0, y: 0 });
  const [playerGravity, setPlayerGravity] = useState<GravityDirection>('down');
  const [playerGrounded, setPlayerGrounded] = useState(true);
  const [moveHistory, setMoveHistory] = useState<Array<{action: string, from: {x: number, y: number}, to: {x: number, y: number}}>>([]);
  const [validMoves, setValidMoves] = useState<Array<{x: number, y: number, action: string}>>([]);
  const keysPressed = useRef<Set<string>>(new Set());

  const findPath = useCallback(() => {
    const result = findGravityPathAStar(start, target, grid);
    setPath(result);
    
    if (!result) {
      // No path found - find closest reachable point
      const closest = findClosestReachablePoint(start, target, grid);
      if (closest) {
        setClosestPoint(closest.state);
        setClosestPointTrajectories(calculateJumpTrajectories(grid, closest.state.x, closest.state.y, closest.state.gravity));
        setNoPathMessage(`Closest reachable point: (${closest.state.x}, ${closest.state.y}) - ${closest.distance} tiles from target`);
      } else {
        setClosestPoint(null);
        setClosestPointTrajectories([]);
        setNoPathMessage('No reachable points found');
      }
    } else {
      setClosestPoint(null);
      setClosestPointTrajectories([]);
      setNoPathMessage('');
    }
  }, [start, target, grid]);

  // Calculate jump trajectories when start position changes
  useEffect(() => {
    const trajs = calculateJumpTrajectories(grid, start.x, start.y, start.gravity);
    setTrajectories(trajs);
  }, [start, grid]);

  useEffect(() => {
    findPath();
  }, [findPath]);

  // Keyboard controls for play mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Calculate valid moves from current player position
  useEffect(() => {
    if (!playMode) return;
    
    const currentState: GravityState = {
      x: Math.round(playerPos.x),
      y: Math.round(playerPos.y),
      gravity: playerGravity
    };
    
    // Get neighbors from pathfinding
    const neighbors = calculateJumpTargets(grid, currentState.x, currentState.y, currentState.gravity);
    const moves = neighbors.map(n => ({ x: n.x, y: n.y, action: 'jump' }));
    
    // Add walk moves
    const surfaceDir = playerGravity === 'down' || playerGravity === 'up' ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
    const walkMoves = [
      { x: currentState.x + surfaceDir.dx, y: currentState.y + surfaceDir.dy },
      { x: currentState.x - surfaceDir.dx, y: currentState.y - surfaceDir.dy }
    ].filter(pos => pos.x >= 0 && pos.x < GRID_WIDTH && pos.y >= 0 && pos.y < GRID_HEIGHT);
    
    walkMoves.forEach(pos => {
      if (!moves.some(m => m.x === pos.x && m.y === pos.y)) {
        moves.push({ ...pos, action: 'walk' });
      }
    });
    
    setValidMoves(moves);
  }, [playMode, playerPos, playerGravity, grid]);

  // Game loop for playable character
  useEffect(() => {
    if (!playMode) return;
    
    const interval = setInterval(() => {
      setPlayerPos(prev => {
        const newPos = { ...prev };
        const gravVec = playerGravity === 'down' ? { dx: 0, dy: 1 } : 
                        playerGravity === 'up' ? { dx: 0, dy: -1 } :
                        playerGravity === 'left' ? { dx: -1, dy: 0 } : { dx: 1, dy: 0 };
        
        // Apply gravity
        if (!playerGrounded) {
          setPlayerVel(v => ({
            x: v.x + gravVec.dx * 0.05,
            y: v.y + gravVec.dy * 0.05
          }));
        }
        
        // Movement input
        const moveSpeed = 0.15;
        if (keysPressed.current.has('arrowleft') || keysPressed.current.has('a')) {
          newPos.x -= moveSpeed;
        }
        if (keysPressed.current.has('arrowright') || keysPressed.current.has('d')) {
          newPos.x += moveSpeed;
        }
        if ((keysPressed.current.has('arrowup') || keysPressed.current.has('w') || keysPressed.current.has(' ')) && playerGrounded) {
          setPlayerVel({ x: -gravVec.dx * 0.4, y: -gravVec.dy * 0.4 });
          setPlayerGrounded(false);
          // Record jump
          setMoveHistory(h => [...h, { 
            action: 'jump', 
            from: { x: Math.round(prev.x), y: Math.round(prev.y) },
            to: { x: Math.round(prev.x), y: Math.round(prev.y) }
          }]);
        }
        
        newPos.x += playerVel.x;
        newPos.y += playerVel.y;
        
        // Simple collision check
        const tileX = Math.round(newPos.x);
        const tileY = Math.round(newPos.y);
        if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
          const cell = grid.cells[tileY]?.[tileX];
          if (cell === 'hull' || cell === 'hullLight' || cell === 'floor') {
            // Hit a wall - snap to tile and record move
            const oldX = Math.round(prev.x);
            const oldY = Math.round(prev.y);
            if (oldX !== tileX || oldY !== tileY) {
              setMoveHistory(h => [...h, { 
                action: playerGrounded ? 'walk' : 'fall', 
                from: { x: oldX, y: oldY },
                to: { x: tileX, y: tileY }
              }]);
            }
            setPlayerVel({ x: 0, y: 0 });
            setPlayerGrounded(true);
            return { x: tileX, y: tileY };
          }
        }
        
        // Check if falling
        const belowX = Math.round(newPos.x + gravVec.dx);
        const belowY = Math.round(newPos.y + gravVec.dy);
        if (belowX >= 0 && belowX < GRID_WIDTH && belowY >= 0 && belowY < GRID_HEIGHT) {
          const belowCell = grid.cells[belowY]?.[belowX];
          setPlayerGrounded(belowCell === 'floor' || belowCell === 'hull');
        }
        
        return newPos;
      });
    }, 16); // ~60fps
    
    return () => clearInterval(interval);
  }, [playMode, playerGravity, playerGrounded, playerVel, grid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid cells
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = grid.cells[y][x];
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        switch (cell) {
          case 'hull':
          case 'hullLight':
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          case 'floor':
            ctx.fillStyle = '#00cccc';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          case 'console':
          case 'desk':
            ctx.fillStyle = '#ff0066';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          case 'interior':
          case 'hallway':
          case 'shaft':
            ctx.fillStyle = '#2a2a4a';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          default:
            ctx.strokeStyle = '#1a1a2e';
            ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    // Draw all 36 jump trajectories with 0.5 opacity
    if (showTrajectories) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      for (const traj of trajectories) {
        if (traj.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(traj.points[0].x * CELL_SIZE + CELL_SIZE / 2, traj.points[0].y * CELL_SIZE + CELL_SIZE / 2);
        for (let i = 1; i < traj.points.length; i++) {
          ctx.lineTo(traj.points[i].x * CELL_SIZE + CELL_SIZE / 2, traj.points[i].y * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();
        // Draw landing spot if valid
        if (traj.landed && traj.landingX !== undefined && traj.landingY !== undefined) {
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.arc(traj.landingX * CELL_SIZE + CELL_SIZE / 2, traj.landingY * CELL_SIZE + CELL_SIZE / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Draw closest point trajectories when no path exists (in orange)
    if (!path && closestPoint && closestPointTrajectories.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1;
      for (const traj of closestPointTrajectories) {
        if (traj.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(traj.points[0].x * CELL_SIZE + CELL_SIZE / 2, traj.points[0].y * CELL_SIZE + CELL_SIZE / 2);
        for (let i = 1; i < traj.points.length; i++) {
          ctx.lineTo(traj.points[i].x * CELL_SIZE + CELL_SIZE / 2, traj.points[i].y * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();
        // Draw landing spot if valid
        if (traj.landed && traj.landingX !== undefined && traj.landingY !== undefined) {
          ctx.fillStyle = '#ff8800';
          ctx.beginPath();
          ctx.arc(traj.landingX * CELL_SIZE + CELL_SIZE / 2, traj.landingY * CELL_SIZE + CELL_SIZE / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Draw path
    if (path) {
      for (const segment of path) {
        const fromX = segment.from.x * CELL_SIZE + CELL_SIZE / 2;
        const fromY = segment.from.y * CELL_SIZE + CELL_SIZE / 2;
        const toX = segment.to.x * CELL_SIZE + CELL_SIZE / 2;
        const toY = segment.to.y * CELL_SIZE + CELL_SIZE / 2;

        switch (segment.action) {
          case 'walk':
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 3;
            ctx.stroke();
            break;
          case 'jump': {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            // Draw curved arc for jumps to show trajectory
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2;
            // Curve upward (against gravity)
            const curveOffset = -Math.abs(toX - fromX) * 0.3 - 20;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.quadraticCurveTo(midX, midY + curveOffset, toX, toY);
            ctx.stroke();
            break;
          }
          case 'wall-jump':
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.strokeStyle = '#ff00aa';
            ctx.lineWidth = 4;
            ctx.stroke();
            break;
          case 'fall':
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]); // Reset line dash
            break;
        }

        // Draw gravity arrow at segment end
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText(getGravityArrow(segment.to.gravity), toX - 6, toY + 4);
      }
    }

    // Draw start
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(
      start.x * CELL_SIZE + CELL_SIZE / 2,
      start.y * CELL_SIZE + CELL_SIZE / 2,
      8,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.fillText(
      getGravityArrow(start.gravity),
      start.x * CELL_SIZE + CELL_SIZE / 2 - 6,
      start.y * CELL_SIZE + CELL_SIZE / 2 + 5
    );

    // Draw target (hidden in play mode)
    if (!playMode) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(
        target.x * CELL_SIZE + CELL_SIZE / 2,
        target.y * CELL_SIZE + CELL_SIZE / 2,
        8,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Draw valid moves from player position (play mode)
    if (playMode) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      for (const move of validMoves) {
        ctx.fillStyle = move.action === 'jump' ? '#00ff00' : '#00f0ff';
        ctx.fillRect(move.x * CELL_SIZE + 4, move.y * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
      }
      ctx.restore();
    }

    // Draw player (pink dot in play mode)
    if (playMode) {
      ctx.fillStyle = '#ff00aa';
      ctx.beginPath();
      ctx.arc(
        playerPos.x * CELL_SIZE + CELL_SIZE / 2,
        playerPos.y * CELL_SIZE + CELL_SIZE / 2,
        10,
        0,
        Math.PI * 2
      );
      ctx.fill();
      // Draw gravity arrow
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.fillText(
        getGravityArrow(playerGravity),
        playerPos.x * CELL_SIZE + CELL_SIZE / 2 - 6,
        playerPos.y * CELL_SIZE + CELL_SIZE / 2 + 5
      );
      // Draw grounded indicator
      if (playerGrounded) {
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(playerPos.x * CELL_SIZE + CELL_SIZE / 2 - 4, playerPos.y * CELL_SIZE + CELL_SIZE - 3, 8, 3);
      }
    }

    // Draw closest reachable point (when no path exists)
    if (!path && closestPoint) {
      // Draw orange circle for closest point
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.arc(
        closestPoint.x * CELL_SIZE + CELL_SIZE / 2,
        closestPoint.y * CELL_SIZE + CELL_SIZE / 2,
        8,
        0,
        Math.PI * 2
      );
      ctx.fill();
      // Draw gravity arrow
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.fillText(
        getGravityArrow(closestPoint.gravity),
        closestPoint.x * CELL_SIZE + CELL_SIZE / 2 - 6,
        closestPoint.y * CELL_SIZE + CELL_SIZE / 2 + 5
      );
      // Draw dashed line from closest point to target
      ctx.beginPath();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 2;
      ctx.moveTo(closestPoint.x * CELL_SIZE + CELL_SIZE / 2, closestPoint.y * CELL_SIZE + CELL_SIZE / 2);
      ctx.lineTo(target.x * CELL_SIZE + CELL_SIZE / 2, target.y * CELL_SIZE + CELL_SIZE / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [grid, path, start, target, trajectories, showTrajectories, closestPoint, closestPointTrajectories, playMode, playerPos, playerGravity, playerGrounded, validMoves]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return;

    if (selecting === 'start') {
      setStart({ x, y, gravity: 'down' });
      setSelecting(null);
    } else if (selecting === 'target') {
      setTarget({ x, y });
      setSelecting(null);
    }
  };

  const totalCost = path?.reduce((sum, s) => {
    return sum + (s.action === 'walk' ? 1 : s.action === 'jump' ? 2 : s.action === 'fall' ? 1 : 3);
  }, 0) ?? 0;

  const gravityChanges = path?.filter((s) => s.action === 'wall-jump').length ?? 0;

  return (
    <div className="p-6 font-mono bg-[#0a0a0f] min-h-screen text-[#00f0ff]">
      <h1 className="text-2xl font-bold mb-4">🪐 Gravity-Aware Pathfinding</h1>

      <div className="flex gap-8 mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setSelecting('start')}
            className={`px-4 py-2 border ${
              selecting === 'start'
                ? 'bg-[#00f0ff] text-[#0a0a0f] border-[#00f0ff]'
                : 'border-[#00f0ff] hover:bg-[#00f0ff]/20'
            }`}
          >
            Set Start
          </button>
          <button
            onClick={() => setSelecting('target')}
            className={`px-4 py-2 border ${
              selecting === 'target'
                ? 'bg-[#ff00aa] text-[#0a0a0f] border-[#ff00aa]'
                : 'border-[#ff00aa] text-[#ff00aa] hover:bg-[#ff00aa]/20'
            }`}
          >
            Set Target
          </button>
          <button
            onClick={() => setShowTrajectories(!showTrajectories)}
            className={`px-4 py-2 border ${
              showTrajectories
                ? 'bg-[#00ff00] text-[#0a0a0f] border-[#00ff00]'
                : 'border-[#00ff00] text-[#00ff00] hover:bg-[#00ff00]/20'
            }`}
          >
            {showTrajectories ? 'Hide 36 Jumps' : 'Show 36 Jumps'}
          </button>
          <button
            onClick={() => setPlayMode(!playMode)}
            className={`px-4 py-2 border ${
              playMode
                ? 'bg-[#ff00aa] text-[#0a0a0f] border-[#ff00aa]'
                : 'border-[#ff00aa] text-[#ff00aa] hover:bg-[#ff00aa]/20'
            }`}
          >
            {playMode ? 'Exit Play Mode' : '🎮 Play Mode'}
          </button>
        </div>

        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-[#00f0ff]">●</span> Walk{' '}
            <span className="text-[#00ff00]">●</span> Jump{' '}
            <span className="text-[#ff00aa]">●</span> Wall-jump{' '}
            <span className="text-[#ffff00]">●</span> Fall
          </div>
          {path ? (
            <div className="flex gap-4">
              <span>Cost: {totalCost}</span>
              <span>Steps: {path.length}</span>
              <span>Gravity flips: {gravityChanges}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-[#ff00aa]">{noPathMessage || 'No path found'}</span>
              {closestPoint && (
                <span className="text-[#ff8800] text-xs">
                  🟠 Orange = closest reachable point | Orange lines = 36 jumps from there
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border border-[#00f0ff]/30 p-1 inline-block">
        <canvas
          ref={canvasRef}
          width={GRID_WIDTH * CELL_SIZE}
          height={GRID_HEIGHT * CELL_SIZE}
          onClick={handleCanvasClick}
          className="cursor-crosshair"
        />
      </div>

      {playMode && (
        <div className="mt-4 p-4 border border-[#ff00aa] bg-[#ff00aa]/10">
          <h3 className="text-[#ff00aa] font-bold mb-2">🎮 Play Mode Active</h3>
          <p className="text-sm mb-2">
            You are the <span className="text-[#ff00aa]">pink dot</span>. Use WASD or Arrow Keys to move, SPACE to jump.
          </p>
          <p className="text-xs text-gray-400 mb-2">
            🟢 Highlighted cells = valid moves from your position | Green bar below you = grounded (can jump)
          </p>
          {moveHistory.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-bold text-[#00f0ff]">Move History (last 10):</p>
              <div className="text-xs text-gray-400 max-h-24 overflow-y-auto">
                {moveHistory.slice(-10).map((move, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[#ff00aa]">{move.action}</span>
                    <span>({move.from.x},{move.from.y}) → ({move.to.x},{move.to.y})</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setMoveHistory([])}
                className="mt-2 px-2 py-1 text-xs border border-[#ff00aa] text-[#ff00aa] hover:bg-[#ff00aa]/20"
              >
                Clear History
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-sm text-gray-400">
        <p>
          🟢 Green = Start (arrow shows gravity) | 🔴 Red = Target | Arrow on path =
          current gravity direction
        </p>
        <p>Light green lines = all 36 possible jump trajectories | Green dots = valid landing spots</p>
        <p>🟠 Orange = closest reachable point when target is unreachable | Orange dashed = gap to target</p>
        <p>Blue walls = jump on them to flip gravity. Explore how wall-jumps open new paths!</p>
      </div>
    </div>
  );
}
