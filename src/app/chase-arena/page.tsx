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
  calculateJumpTargets,
} from '@/lib/gravity-pathfinding';

const CELL_SIZE = 32;
const GRID_WIDTH = 24;
const GRID_HEIGHT = 16;

// Test arena layout
function generateArenaGrid(): ShipGrid {
  const cells: CellType[][] = Array(GRID_HEIGHT)
    .fill(null)
    .map(() => Array(GRID_WIDTH).fill('space'));

  // Floor
  for (let x = 0; x < GRID_WIDTH; x++) {
    cells[GRID_HEIGHT - 1][x] = 'floor';
    cells[GRID_HEIGHT - 2][x] = 'floor';
  }

  // Left wall with platforms
  for (let y = 6; y < GRID_HEIGHT; y++) {
    cells[y][0] = 'hull';
    cells[y][1] = 'hull';
  }
  // Platforms on left wall
  cells[10][2] = 'floor';
  cells[10][3] = 'floor';
  cells[6][2] = 'floor';
  cells[6][3] = 'floor';

  // Right wall with platforms
  for (let y = 4; y < GRID_HEIGHT; y++) {
    cells[y][GRID_WIDTH - 1] = 'hull';
    cells[y][GRID_WIDTH - 2] = 'hull';
  }
  // Platforms on right wall
  cells[8][GRID_WIDTH - 3] = 'floor';
  cells[8][GRID_WIDTH - 4] = 'floor';
  cells[12][GRID_WIDTH - 3] = 'floor';

  // Central obstacle platform
  for (let x = 8; x < 16; x++) {
    cells[10][x] = 'floor';
  }

  // Upper platform
  for (let x = 4; x < 10; x++) {
    cells[4][x] = 'floor';
  }
  for (let x = 14; x < 20; x++) {
    cells[4][x] = 'floor';
  }

  // Floating platforms
  cells[7][6] = 'floor';
  cells[7][7] = 'floor';
  cells[7][17] = 'floor';
  cells[7][18] = 'floor';

  return { width: GRID_WIDTH, height: GRID_HEIGHT, cells };
}

interface Character {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  gravity: GravityDirection;
  isAI?: boolean;
  path?: GravityPathSegment[] | null;
}

export default function ChaseArenaPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid] = useState<ShipGrid>(generateArenaGrid);
  const [characters, setCharacters] = useState<Character[]>([
    { id: 'jp', name: 'JP', color: '#00f0ff', x: 3, y: 13, gravity: 'down' },
    { id: 'nim', name: 'Nim', color: '#ff00aa', x: 20, y: 13, gravity: 'down' },
    { id: 'codex', name: 'CODEX', color: '#ffff00', x: 12, y: 13, gravity: 'down', isAI: true },
  ]);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [moveHistory, setMoveHistory] = useState<Array<{char: string, from: {x: number, y: number}, to: {x: number, y: number}, action: string}>>([]);
  const [gameMessage, setGameMessage] = useState('Click characters to move them. Press RECORD to start!');
  const [codexTarget, setCodexTarget] = useState<string>('nim'); // CODEX follows Nim by default
  const [showPaths, setShowPaths] = useState(true);

  // Calculate paths for AI characters
  useEffect(() => {
    if (!showPaths) return;
    
    setCharacters(prev => prev.map(char => {
      if (!char.isAI) return char;
      
      const target = prev.find(c => c.id === codexTarget);
      if (!target) return char;
      
      const path = findGravityPathAStar(
        { x: Math.round(char.x), y: Math.round(char.y), gravity: char.gravity },
        { x: Math.round(target.x), y: Math.round(target.y) },
        grid
      );
      
      return { ...char, path: path || undefined };
    }));
  }, [characters.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), g: c.gravity })), codexTarget, grid, showPaths]);

  // Recording game loop
  useEffect(() => {
    if (!recording) return;
    
    const interval = setInterval(() => {
      setCharacters(prev => {
        const newChars = [...prev];
        const jp = newChars.find(c => c.id === 'jp')!;
        const nim = newChars.find(c => c.id === 'nim')!;
        const codex = newChars.find(c => c.id === 'codex')!;
        
        // Move CODEX along its path
        if (codex.path && codex.path.length > 0) {
          const nextStep = codex.path[0];
          const oldX = Math.round(codex.x);
          const oldY = Math.round(codex.y);
          codex.x = nextStep.to.x;
          codex.y = nextStep.to.y;
          codex.gravity = nextStep.to.gravity;
          
          setMoveHistory(h => [...h, {
            char: 'CODEX',
            from: { x: oldX, y: oldY },
            to: { x: codex.x, y: codex.y },
            action: nextStep.action
          }]);
          
          codex.path = codex.path.slice(1);
        }
        
        // Check win condition (JP reaches Nim)
        const dist = Math.abs(jp.x - nim.x) + Math.abs(jp.y - nim.y);
        if (dist <= 1) {
          setRecording(false);
          setGameMessage('🎉 JP caught Nim! Recording saved.');
        }
        
        return newChars;
      });
    }, 500); // Move every 500ms
    
    return () => clearInterval(interval);
  }, [recording, grid]);

  // Canvas drawing
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
            ctx.fillStyle = '#5d4037';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          case 'floor':
            ctx.fillStyle = '#1565c0';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            break;
          default:
            ctx.strokeStyle = '#1a1a2e';
            ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    // Draw paths
    if (showPaths) {
      characters.forEach(char => {
        if (char.path) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = char.color;
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          
          let currX = char.x * CELL_SIZE + CELL_SIZE / 2;
          let currY = char.y * CELL_SIZE + CELL_SIZE / 2;
          
          ctx.beginPath();
          ctx.moveTo(currX, currY);
          
          for (const segment of char.path) {
            const toX = segment.to.x * CELL_SIZE + CELL_SIZE / 2;
            const toY = segment.to.y * CELL_SIZE + CELL_SIZE / 2;
            ctx.lineTo(toX, toY);
          }
          
          ctx.stroke();
          ctx.restore();
        }
      });
    }

    // Draw characters
    characters.forEach(char => {
      const px = char.x * CELL_SIZE + CELL_SIZE / 2;
      const py = char.y * CELL_SIZE + CELL_SIZE / 2;
      
      // Selection ring
      if (selectedChar === char.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Character body
      ctx.fillStyle = char.color;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();
      
      // Gravity arrow
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(getGravityArrow(char.gravity), px - 6, py + 4);
      
      // Name label
      ctx.fillStyle = char.color;
      ctx.font = '10px monospace';
      ctx.fillText(char.name, px - 15, py - 20);
    });
  }, [grid, characters, selectedChar, showPaths]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return;

    // Check if clicked on a character
    const clickedChar = characters.find(c => Math.round(c.x) === x && Math.round(c.y) === y);
    if (clickedChar) {
      setSelectedChar(clickedChar.id);
      return;
    }

    // Move selected character
    if (selectedChar) {
      setCharacters(prev => prev.map(c => {
        if (c.id !== selectedChar) return c;
        
        const oldX = Math.round(c.x);
        const oldY = Math.round(c.y);
        const action = c.x === x ? 'walk' : 'jump';
        
        if (recording) {
          setMoveHistory(h => [...h, {
            char: c.name,
            from: { x: oldX, y: oldY },
            to: { x, y },
            action
          }]);
        }
        
        return { ...c, x, y };
      }));
    }
  };

  const startRecording = () => {
    setRecording(true);
    setMoveHistory([]);
    setGameMessage('🔴 RECORDING! Move JP to catch Nim. CODEX is following...');
  };

  const stopRecording = () => {
    setRecording(false);
    setGameMessage('⏹️ Recording stopped. Check if CODEX followed correctly!');
  };

  return (
    <div className="p-6 font-mono bg-[#0a0a0f] min-h-screen text-[#00f0ff]">
      <h1 className="text-2xl font-bold mb-4">🏃 Chase Arena</h1>
      
      <div className="flex gap-4 mb-4 flex-wrap">
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`px-4 py-2 border ${
            recording
              ? 'bg-red-500 text-white border-red-500'
              : 'border-red-500 text-red-500 hover:bg-red-500/20'
          }`}
        >
          {recording ? '⏹️ STOP' : '🔴 RECORD'}
        </button>
        
        <button
          onClick={() => setShowPaths(!showPaths)}
          className={`px-4 py-2 border ${
            showPaths
              ? 'bg-[#00f0ff] text-[#0a0a0f] border-[#00f0ff]'
              : 'border-[#00f0ff] hover:bg-[#00f0ff]/20'
          }`}
        >
          {showPaths ? 'Hide Paths' : 'Show Paths'}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm">CODEX follows:</span>
          <select 
            value={codexTarget}
            onChange={(e) => setCodexTarget(e.target.value)}
            className="bg-[#0a0a0f] border border-[#ffff00] text-[#ffff00] px-2 py-1"
          >
            <option value="nim">Nim</option>
            <option value="jp">JP</option>
          </select>
        </div>
      </div>

      <div className="flex gap-6 text-sm mb-4">
        <span className="text-[#00f0ff]">● JP (You - Cyan)</span>
        <span className="text-[#ff00aa]">● Nim (Target - Pink)</span>
        <span className="text-[#ffff00]">● CODEX (AI - Yellow)</span>
      </div>

      <p className="text-sm text-gray-400 mb-2">{gameMessage}</p>

      <div className="border border-[#00f0ff]/30 p-1 inline-block">
        <canvas
          ref={canvasRef}
          width={GRID_WIDTH * CELL_SIZE}
          height={GRID_HEIGHT * CELL_SIZE}
          onClick={handleCanvasClick}
          className="cursor-crosshair"
        />
      </div>

      {moveHistory.length > 0 && (
        <div className="mt-4 p-4 border border-[#00f0ff]/30 bg-[#00f0ff]/5 max-w-2xl">
          <h3 className="text-[#00f0ff] font-bold mb-2">📜 Move History</h3>
          <div className="text-xs text-gray-400 max-h-32 overflow-y-auto">
            {moveHistory.map((move, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-[#00f0ff] w-16">{move.char}</span>
                <span className="text-gray-500">({move.from.x},{move.from.y})</span>
                <span>→</span>
                <span className="text-gray-500">({move.to.x},{move.to.y})</span>
                <span className="text-[#ff00aa]">{move.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-400">
        <p>Click a character to select, then click empty space to move them</p>
        <p>Dashed lines show predicted paths. White ring = selected character.</p>
      </div>
    </div>
  );
}
