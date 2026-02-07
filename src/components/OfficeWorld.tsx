"use client";

import { useState, useEffect, useRef } from "react";

const UNIT = 8;
const TILE_SIZE = 8; // Each tile is 8x8 pixels
const WORLD_WIDTH = 80; // 80 tiles = 640px
const WORLD_HEIGHT = 40; // 40 tiles = 320px (leaving room for UI)

// Character sprite - 8x12 pixels (tiny but readable)
const CHARACTER_WIDTH = 8;
const CHARACTER_HEIGHT = 12;

interface Character {
  id: string;
  name: string;
  x: number; // tile position
  y: number;
  type: "human" | "agent";
  state: "idle" | "walking" | "working" | "chatting";
  direction: "left" | "right";
  targetX?: number;
  targetY?: number;
  workstation?: string;
  color: string; // character accent color
  thought?: string; // current thought/task
}

interface Furniture {
  id: string;
  type: "desk" | "chair" | "plant" | "coffee" | "server" | "whiteboard" | "couch" | "computer";
  x: number;
  y: number;
  width: number;
  height: number;
}

// Simple 1-bit character renderer
function PixelCharacter({ 
  char, 
  onClick 
}: { 
  char: Character; 
  onClick?: () => void;
}) {
  // 8x12 character sprite pattern (1 = filled, 0 = empty)
  // This creates a tiny but recognizable humanoid
  const sprite = [
    [0,0,1,1,1,1,0,0], // head top
    [0,1,1,1,1,1,1,0], // head
    [0,1,0,1,1,0,1,0], // eyes
    [0,1,1,1,1,1,1,0], // face
    [0,0,1,1,1,1,0,0], // chin
    [0,0,0,1,1,0,0,0], // neck
    [0,1,1,1,1,1,1,0], // shoulders
    [1,1,0,1,1,0,1,1], // arms/body
    [0,1,0,1,1,0,1,0], // arms/body
    [0,0,0,1,1,0,0,0], // waist
    [0,0,1,1,1,1,0,0], // legs
    [0,0,1,0,0,1,0,0], // feet
  ];

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        left: char.x * TILE_SIZE,
        top: char.y * TILE_SIZE - 4, // offset so feet align with tile
        cursor: onClick ? "pointer" : "default",
        transform: char.direction === "left" ? "scaleX(-1)" : "none",
        zIndex: char.y + 10, // depth sorting
      }}
      title={`${char.name} (${char.type})`}
    >
      {/* Render sprite pixel by pixel */}
      {sprite.map((row, y) => (
        <div key={y} style={{ display: "flex", height: 1 }}>
          {row.map((pixel, x) => (
            <div
              key={x}
              style={{
                width: 1,
                height: 1,
                background: pixel ? (char.type === "agent" ? "#0f0" : "#fff") : "transparent",
              }}
            />
          ))}
        </div>
      ))}
      
      {/* Thought bubble when working */}
      {char.state === "working" && char.thought && (
        <div style={{
          position: "absolute",
          top: -14,
          left: 0,
          fontSize: "5px",
          color: "#000",
          background: "#fff",
          padding: "1px 3px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          maxWidth: 50,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {char.thought}
          {/* Thought bubble tail */}
          <div style={{
            position: "absolute",
            bottom: -3,
            left: 4,
            width: 0,
            height: 0,
            borderLeft: "3px solid transparent",
            borderRight: "3px solid transparent",
            borderTop: "3px solid #fff",
          }} />
        </div>
      )}
      
      {/* Status indicator dot for agents */}
      {char.type === "agent" && (
        <div style={{
          position: "absolute",
          top: -4,
          left: "50%",
          transform: "translateX(-50%)",
          width: 3,
          height: 3,
          background: char.state === "working" ? "#0f0" : char.state === "walking" ? "#ff0" : "#888",
          borderRadius: "50%",
        }} />
      )}
      
      {/* Chat bubble when chatting */}
      {char.state === "chatting" && (
        <div style={{
          position: "absolute",
          top: -8,
          left: 4,
          fontSize: "4px",
          color: "#fff",
          background: "#333",
          padding: "1px 2px",
          border: "1px solid #fff",
        }}>
          💬
        </div>
      )}
    </div>
  );
}

// Furniture renderer
function FurnitureItem({ item }: { item: Furniture }) {
  const renderFurniture = () => {
    switch (item.type) {
      case "desk":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            border: "1px solid #444",
            background: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{ width: "60%", height: 2, background: "#444" }} />
          </div>
        );
      case "chair":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            border: "1px solid #333",
            background: "#222",
          }} />
        );
      case "plant":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
          }}>
            <div style={{ width: 4, height: 6, background: "#0a0" }} />
            <div style={{ width: 6, height: 3, background: "#333" }} />
          </div>
        );
      case "coffee":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            border: "1px solid #444",
            background: "#222",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "6px",
          }}>
            ☕
          </div>
        );
      case "server":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            border: "1px solid #0f0",
            background: "#111",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            padding: 1,
          }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ 
                width: "100%", 
                height: 2, 
                background: "#0f0",
                animation: `blink ${0.5 + i * 0.3}s infinite alternate`,
              }} />
            ))}
            <style>{`
              @keyframes blink {
                0% { opacity: 0.3; }
                100% { opacity: 1; }
              }
            `}</style>
          </div>
        );
      case "whiteboard":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            border: "1px solid #fff",
            background: "#eee",
          }} />
        );
      case "couch":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            border: "1px solid #444",
            background: "#333",
            borderRadius: 2,
          }} />
        );
      case "computer":
        return (
          <div style={{
            width: item.width * TILE_SIZE,
            height: item.height * TILE_SIZE,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            {/* Monitor */}
            <div style={{
              width: 6,
              height: 5,
              border: "1px solid #666",
              background: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <div style={{ width: 2, height: 1, background: "#0f0" }} />
            </div>
            {/* Stand */}
            <div style={{ width: 2, height: 2, background: "#444" }} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: item.x * TILE_SIZE,
        top: item.y * TILE_SIZE,
        zIndex: item.y,
      }}
    >
      {renderFurniture()}
    </div>
  );
}

export function OfficeWorld() {
  // Characters in the office
  const [characters, setCharacters] = useState<Character[]>([
    { id: "nimbus", name: "Nimbus", x: 20, y: 15, type: "agent", state: "working", direction: "right", color: "#0f0", thought: "Building UI..." },
    { id: "jp", name: "JP", x: 35, y: 20, type: "human", state: "idle", direction: "left", color: "#fff", thought: "Reviewing code" },
    { id: "codex", name: "Codex", x: 50, y: 18, type: "agent", state: "idle", direction: "right", color: "#0f0", thought: "Standing by" },
  ]);

  // Office furniture layout
  const [furniture] = useState<Furniture[]>([
    // Nimbus's desk area
    { id: "desk1", type: "desk", x: 18, y: 16, width: 6, height: 2 },
    { id: "chair1", type: "chair", x: 20, y: 18, width: 2, height: 2 },
    { id: "pc1", type: "computer", x: 19, y: 15, width: 2, height: 2 },
    
    // JP's desk area
    { id: "desk2", type: "desk", x: 33, y: 21, width: 6, height: 2 },
    { id: "chair2", type: "chair", x: 35, y: 23, width: 2, height: 2 },
    { id: "pc2", type: "computer", x: 34, y: 20, width: 2, height: 2 },
    
    // Codex's desk area
    { id: "desk3", type: "desk", x: 48, y: 19, width: 6, height: 2 },
    { id: "chair3", type: "chair", x: 50, y: 21, width: 2, height: 2 },
    { id: "pc3", type: "computer", x: 49, y: 18, width: 2, height: 2 },
    
    // Server room
    { id: "server1", type: "server", x: 70, y: 10, width: 3, height: 6 },
    { id: "server2", type: "server", x: 74, y: 10, width: 3, height: 6 },
    
    // Lounge area
    { id: "couch1", type: "couch", x: 10, y: 30, width: 8, height: 3 },
    { id: "coffee1", type: "coffee", x: 20, y: 32, width: 3, height: 2 },
    
    // Plants
    { id: "plant1", type: "plant", x: 5, y: 5, width: 2, height: 3 },
    { id: "plant2", type: "plant", x: 75, y: 5, width: 2, height: 3 },
    { id: "plant3", type: "plant", x: 5, y: 35, width: 2, height: 3 },
    
    // Whiteboard
    { id: "wb1", type: "whiteboard", x: 40, y: 5, width: 10, height: 4 },
  ]);

  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [serverBlink, setServerBlink] = useState(0);

  // Clock
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }));
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  // Server blink animation
  useEffect(() => {
    const interval = setInterval(() => {
      setServerBlink(prev => (prev + 1) % 4);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Thought pools for different character types
  const agentThoughts = [
    "Building UI...",
    "Writing code...",
    "Reviewing PR...",
    "Debugging...",
    "Refactoring...",
    "Planning...",
    "Testing...",
    "Deploying...",
    "Reading docs...",
    "Thinking...",
  ];
  
  const humanThoughts = [
    "Reviewing code",
    "In meeting",
    "Coffee break",
    "Planning sprint",
    "Checking Slack",
    "Writing spec",
    "Reading email",
  ];

  // Simple AI movement - characters occasionally move around
  useEffect(() => {
    const interval = setInterval(() => {
      setCharacters(chars => chars.map(char => {
        // 20% chance to change state or move
        if (Math.random() > 0.8) {
          const states: Character["state"][] = ["idle", "walking", "working"];
          const newState = states[Math.floor(Math.random() * states.length)];
          
          // Pick a new thought when entering working state
          let newThought = char.thought;
          if (newState === "working") {
            const thoughts = char.type === "agent" ? agentThoughts : humanThoughts;
            newThought = thoughts[Math.floor(Math.random() * thoughts.length)];
          }
          
          if (newState === "walking") {
            // Pick a random nearby destination
            const newX = Math.max(5, Math.min(75, char.x + (Math.random() - 0.5) * 10));
            const newY = Math.max(5, Math.min(35, char.y + (Math.random() - 0.5) * 6));
            return {
              ...char,
              state: newState,
              thought: newThought,
              direction: newX > char.x ? "right" : "left",
              targetX: Math.round(newX),
              targetY: Math.round(newY),
            };
          }
          return { ...char, state: newState, thought: newThought };
        }
        
        // Move towards target if walking
        if (char.state === "walking" && char.targetX !== undefined && char.targetY !== undefined) {
          const dx = char.targetX - char.x;
          const dy = char.targetY - char.y;
          
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
            return { ...char, state: "idle", targetX: undefined, targetY: undefined };
          }
          
          return {
            ...char,
            x: char.x + Math.sign(dx) * 0.5,
            y: char.y + Math.sign(dy) * 0.3,
            direction: dx > 0 ? "right" : "left",
          };
        }
        
        return char;
      }));
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      width: 640,
      height: 360,
      background: "#000",
      position: "relative",
      fontFamily: "'Press Start 2P', monospace",
      fontSize: "8px",
      color: "#fff",
      overflow: "hidden",
    }}>
      {/* Header bar */}
      <div style={{
        height: UNIT * 2,
        borderBottom: "1px solid #333",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${UNIT}px`,
        background: "#111",
      }}>
        <span>BITFLOOR OFFICE</span>
        <span style={{ color: "#888" }}>{time}</span>
      </div>

      {/* World view */}
      <div style={{
        position: "relative",
        width: 640,
        height: 320,
        background: "#0a0a0a",
        overflow: "hidden",
      }}>
        {/* Floor grid (subtle) */}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          backgroundImage: `
            repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent ${TILE_SIZE}px),
            repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent ${TILE_SIZE}px)
          `,
        }} />

        {/* Room boundaries */}
        <div style={{
          position: "absolute",
          left: TILE_SIZE * 2,
          top: TILE_SIZE * 2,
          width: TILE_SIZE * 76,
          height: TILE_SIZE * 36,
          border: "1px solid #333",
        }} />

        {/* Furniture */}
        {furniture.map(item => (
          <FurnitureItem key={item.id} item={item} />
        ))}

        {/* Characters */}
        {characters.map(char => (
          <PixelCharacter
            key={char.id}
            char={char}
            onClick={() => setSelectedChar(char.id === selectedChar ? null : char.id)}
          />
        ))}

        {/* Room labels */}
        <div style={{
          position: "absolute",
          left: TILE_SIZE * 68,
          top: TILE_SIZE * 8,
          fontSize: "6px",
          color: "#0f0",
          opacity: 0.7,
        }}>
          SERVER
        </div>
        <div style={{
          position: "absolute",
          left: TILE_SIZE * 10,
          top: TILE_SIZE * 28,
          fontSize: "6px",
          color: "#666",
        }}>
          LOUNGE
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: UNIT * 2,
        borderTop: "1px solid #333",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${UNIT}px`,
        background: "#111",
        color: "#888",
      }}>
        <span>
          {selectedChar ? 
            `Selected: ${characters.find(c => c.id === selectedChar)?.name}` : 
            "Click a character to select"}
        </span>
        <span>{characters.length} ACTIVE</span>
      </div>

      {/* Character info panel (when selected) */}
      {selectedChar && (
        <div style={{
          position: "absolute",
          right: UNIT,
          top: UNIT * 4,
          width: UNIT * 16,
          background: "#000",
          border: "1px solid #fff",
          padding: UNIT,
          zIndex: 100,
        }}>
          {(() => {
            const char = characters.find(c => c.id === selectedChar);
            if (!char) return null;
            return (
              <>
                <div style={{ marginBottom: 4 }}>{char.name}</div>
                <div style={{ color: "#888", fontSize: "6px" }}>
                  Type: {char.type}
                </div>
                <div style={{ 
                  color: char.state === "working" ? "#0f0" : "#888", 
                  fontSize: "6px" 
                }}>
                  Status: {char.state}
                </div>
                <button
                  onClick={() => setSelectedChar(null)}
                  style={{
                    marginTop: UNIT,
                    background: "none",
                    border: "1px solid #fff",
                    color: "#fff",
                    fontSize: "6px",
                    padding: "2px 4px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  CLOSE
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default OfficeWorld;
