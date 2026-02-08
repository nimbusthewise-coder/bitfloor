"use client";

import { useState, useEffect, useRef } from "react";

// Grid unit - all measurements are multiples of this
const UNIT = 8;
const AVATAR_SIZE = 64; // Native sprite size

// Simple pixel avatar using canvas
function PixelAvatar({ 
  config, 
  onClick 
}: { 
  config: number[]; 
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = "/bitfloor/sprites/face.png";
    img.onload = () => {
      spriteRef.current = img;
      setLoaded(true);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !canvasRef.current || !spriteRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);

    // Draw each feature layer
    for (let f = 1; f < 8; f++) {
      const variantX = (config[f] || 0) * AVATAR_SIZE;
      const featureY = f * AVATAR_SIZE;
      ctx.drawImage(
        spriteRef.current,
        variantX, featureY, AVATAR_SIZE, AVATAR_SIZE,
        0, 0, AVATAR_SIZE, AVATAR_SIZE
      );
    }
  }, [config, loaded]);

  return (
    <canvas
      ref={canvasRef}
      width={AVATAR_SIZE}
      height={AVATAR_SIZE}
      onClick={onClick}
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        cursor: onClick ? "pointer" : "default",
        imageRendering: "pixelated",
      }}
    />
  );
}

function generateRandomFace(): number[] {
  const face: number[] = [];
  for (let f = 0; f < 8; f++) {
    face.push(Math.floor(Math.random() * 10));
  }
  return face;
}

// Pixel-perfect window component
interface PixelWindowProps {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  onClose: () => void;
  onFocus: () => void;
  onDrag: (x: number, y: number) => void;
  children: React.ReactNode;
}

function PixelWindow({
  title,
  x,
  y,
  width,
  height,
  zIndex,
  onClose,
  onFocus,
  onDrag,
  children,
}: PixelWindowProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onFocus();
    setIsDragging(true);
    setDragStart({ x: e.clientX - x, y: e.clientY - y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    // Snap to grid
    const newX = Math.round((e.clientX - dragStart.x) / UNIT) * UNIT;
    const newY = Math.round((e.clientY - dragStart.y) / UNIT) * UNIT;
    onDrag(Math.max(0, newX), Math.max(UNIT * 2, newY));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const titleBarHeight = UNIT * 2; // 16px

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: width,
        zIndex,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={onFocus}
    >
      {/* Layered depth shadow - offset creates depth illusion */}
      <div
        style={{
          position: "absolute",
          left: 4,
          top: 4,
          width: width,
          height: height + titleBarHeight,
          background: "#333",
        }}
      />

      {/* Window */}
      <div
        style={{
          position: "relative",
          width: width,
          height: height + titleBarHeight,
          background: "#000",
          border: "1px solid #fff",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            height: titleBarHeight,
            background: "#fff",
            color: "#000",
            display: "flex",
            alignItems: "center",
            padding: `0 ${UNIT / 2}px`,
            cursor: "move",
            borderBottom: "1px solid #000",
            gap: UNIT,
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Close button - classic Mac style box */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              width: 12,
              height: 12,
              border: "1px solid #000",
              background: "#fff",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />

          {/* Title - centered */}
          <span style={{ 
            flex: 1, 
            textAlign: "center",
            fontSize: "8px", 
            textTransform: "uppercase", 
            letterSpacing: "1px",
            fontFamily: "inherit",
          }}>
            {title}
          </span>

          {/* Spacer for symmetry */}
          <div style={{ width: 12, flexShrink: 0 }} />
        </div>

        {/* Content */}
        <div
          style={{
            height: height,
            padding: UNIT / 2,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Main desktop
type WinType = "identity" | "note" | "about" | "chat" | "terminal" | "browser" | "music" | "pixelart" | "memory" | "agent";

interface Win {
  id: string;
  type: WinType;
  x: number;
  y: number;
  z: number;
}

interface PixelDesktopProps {
  onSwitchView?: () => void;
}

export function PixelDesktop({ onSwitchView }: PixelDesktopProps = {}) {
  const [windows, setWindows] = useState<Win[]>([
    { id: "identity-1", type: "identity", x: UNIT * 2, y: UNIT * 4, z: 1 },
  ]);
  const [topZ, setTopZ] = useState(1);
  const [time, setTime] = useState("");
  // Nimbus's chosen face DNA - selected 2026-02-07
  // Face DNA - each array represents facial features [base, head, eyes, nose, mouth, hair, extra1, extra2]
  const NIMBUS_FACE = [0, 2, 3, 4, 8, 7, 7, 1]; // Squared glasses, friendly smile
  const JP_FACE = [0, 6, 0, 2, 8, 3, 8, 5];      // Round glasses, Creative Director
  const [avatarConfig, setAvatarConfig] = useState<number[]>(NIMBUS_FACE);
  const [chatChannel, setChatChannel] = useState("general");
  const [chatMessages, setChatMessages] = useState<{[key: string]: {from: string; text: string}[]}>({
    general: [
      { from: "Nimbus", text: "Working on UI..." },
      { from: "JP", text: "Looks great!" },
      { from: "Nimbus", text: "Adding chat now" },
    ],
    random: [
      { from: "System", text: "Welcome to #random" },
    ],
    dev: [
      { from: "Nimbus", text: "Pushing new build..." },
      { from: "System", text: "Build complete ✓" },
    ],
  });
  const [chatInput, setChatInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [terminalBooted, setTerminalBooted] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("bitfloor://home");
  
  // Music player state
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTrack, setMusicTrack] = useState(0);
  const [cassetteAngle, setCassetteAngle] = useState(0);
  const musicPlaylist = [
    { title: "PIXEL DREAMS", artist: "Bitfloor FM", duration: "3:42" },
    { title: "MIDNIGHT CODE", artist: "Nimbus", duration: "4:15" },
    { title: "NEON RAIN", artist: "JP & The Agents", duration: "3:58" },
    { title: "DIGITAL SUNSET", artist: "Bitfloor FM", duration: "5:21" },
    { title: "RETRO FUTURE", artist: "The Cowboys", duration: "4:02" },
  ];
  
  // Pixel art state
  const [pixelCanvas, setPixelCanvas] = useState<number[][]>(() => 
    Array(16).fill(null).map(() => Array(16).fill(0))
  );
  const [pixelColor, setPixelColor] = useState(1); // 0 = black, 1 = white
  
  // Memory viewer state - fetches real data
  const [memoryFile, setMemoryFile] = useState("MEMORY.md");
  const [memoryFiles, setMemoryFiles] = useState([
    { name: "MEMORY.md", label: "Long-term" },
  ]);
  const [memoryContent, setMemoryContent] = useState<string>("Loading...");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryStats, setMemoryStats] = useState({ files: 0, age: "...", born: "..." });
  
  // Agent console state - fetches real status
  const [agentStatus, setAgentStatus] = useState<"idle" | "thinking" | "working" | "offline">("idle");
  const [agentTask, setAgentTask] = useState("Connecting...");
  const [agentLog, setAgentLog] = useState<{time: string; action: string}[]>([]);
  const [agentGateway, setAgentGateway] = useState("unknown");

  // Fetch memory file list on mount
  useEffect(() => {
    fetch("/bitfloor/api/memory?file=_list")
      .then(res => res.json())
      .then(data => {
        if (data.files) {
          // Transform to display format
          const files = data.files.map((f: any) => ({
            name: f.name,
            label: f.name === "MEMORY.md" ? "Long-term" : 
                   f.name === "patterns.md" ? "Patterns" :
                   f.name.replace(".md", ""),
          }));
          setMemoryFiles(files);
          setMemoryStats({
            files: files.length,
            age: "6 days",
            born: "2026-02-01",
          });
        }
      })
      .catch(() => {});
  }, []);

  // Fetch memory content when file changes
  useEffect(() => {
    setMemoryLoading(true);
    fetch(`/bitfloor/api/memory?file=${encodeURIComponent(memoryFile)}`)
      .then(res => res.json())
      .then(data => {
        if (data.content) {
          setMemoryContent(data.content);
        } else if (data.error) {
          setMemoryContent(`Error: ${data.error}`);
        }
      })
      .catch(err => setMemoryContent(`Failed to load: ${err.message}`))
      .finally(() => setMemoryLoading(false));
  }, [memoryFile]);

  // Fetch agent status periodically
  useEffect(() => {
    const fetchAgentStatus = () => {
      fetch("/bitfloor/api/agent")
        .then(res => res.json())
        .then(data => {
          setAgentStatus(data.status || "offline");
          setAgentTask(data.currentTask || "Unknown");
          setAgentGateway(data.gateway || "unknown");
          if (data.activityLog) {
            setAgentLog(data.activityLog);
          }
        })
        .catch(() => {
          setAgentStatus("offline");
          setAgentTask("Cannot reach Bitfloor server");
        });
    };

    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Clock
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      );
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  // Cassette animation when playing
  useEffect(() => {
    if (!musicPlaying) return;
    const interval = setInterval(() => {
      setCassetteAngle(prev => (prev + 15) % 360);
    }, 100);
    return () => clearInterval(interval);
  }, [musicPlaying]);

  // Terminal boot sequence
  const bootTerminal = () => {
    if (terminalBooted) return;
    setTerminalBooted(true);
    const bootSequence = [
      "BITFLOOR OS v0.1.0",
      "Copyright (c) 2026 Bitfloor Inc.",
      "",
      "Initializing system...",
      "Loading kernel............ OK",
      "Mounting filesystem....... OK",
      "Starting services......... OK",
      "Connecting to network..... OK",
      "",
      "Welcome to BITFLOOR",
      "",
      "Type 'help' for commands.",
      "",
      "> _",
    ];
    
    let i = 0;
    const interval = setInterval(() => {
      if (i < bootSequence.length) {
        setTerminalLines(prev => [...prev, bootSequence[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 150);
  };

  const addWindow = (type: WinType) => {
    const newZ = topZ + 1;
    setTopZ(newZ);
    const offset = (windows.length % 4) * UNIT * 2;
    setWindows([
      ...windows,
      {
        id: `${type}-${Date.now()}`,
        type,
        x: UNIT * 8 + offset,
        y: UNIT * 6 + offset,
        z: newZ,
      },
    ]);
  };

  const closeWindow = (id: string) => {
    setWindows(windows.filter((w) => w.id !== id));
  };

  const focusWindow = (id: string) => {
    const newZ = topZ + 1;
    setTopZ(newZ);
    setWindows(windows.map((w) => (w.id === id ? { ...w, z: newZ } : w)));
  };

  const moveWindow = (id: string, x: number, y: number) => {
    setWindows(windows.map((w) => (w.id === id ? { ...w, x, y } : w)));
  };

  const menuBarHeight = UNIT * 2;

  return (
    <div
      style={{
        width: 640,
        height: 360,
        background: "#000",
        position: "relative",
        fontFamily: "'Press Start 2P', monospace",
        fontSize: "8px",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Menu bar */}
      <div
        style={{
          height: menuBarHeight,
          borderBottom: "1px solid #fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${UNIT}px`,
        }}
      >
        <div style={{ display: "flex", gap: UNIT }}>
          <button
            onClick={() => { addWindow("terminal"); bootTerminal(); }}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
          >
            TERM
          </button>
          <button
            onClick={() => addWindow("browser")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
          >
            WEB
          </button>
          <button
            onClick={() => addWindow("chat")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
          >
            CHAT
          </button>
          <button
            onClick={() => addWindow("music")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
          >
            MUSIC
          </button>
          <button
            onClick={() => addWindow("pixelart")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
          >
            DRAW
          </button>
          <button
            onClick={() => addWindow("memory")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
          >
            MEM
          </button>
          <button
            onClick={() => addWindow("agent")}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
          >
            AGENT
          </button>
          {onSwitchView && (
            <button
              onClick={onSwitchView}
              style={{ background: "none", border: "none", color: "#0f0", cursor: "pointer", fontSize: "8px", fontFamily: "inherit", padding: "4px 6px", minHeight: "24px", touchAction: "manipulation" }}
            >
              OFFICE
            </button>
          )}
        </div>
        <div>{time}</div>
      </div>

      {/* Desktop area */}
      <div style={{ position: "relative", height: 360 - menuBarHeight }}>
        {/* Grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.03,
            backgroundImage: `
              repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent ${UNIT}px),
              repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent ${UNIT}px)
            `,
          }}
        />

        {/* Desktop icons */}
        <div 
          style={{ 
            position: "absolute", 
            right: UNIT * 2, 
            top: UNIT,
            display: "flex",
            flexDirection: "column",
            gap: UNIT * 2,
          }}
        >
          {/* Identity icon */}
          <button
            onClick={() => addWindow("identity")}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              textAlign: "center",
              padding: 0,
            }}
          >
            <div style={{
              width: UNIT * 4,
              height: UNIT * 4,
              border: "1px solid #fff",
              marginBottom: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
            }}>
              ☺
            </div>
            <div style={{ fontSize: "6px" }}>ME</div>
          </button>

          {/* Chat icon */}
          <button
            onClick={() => addWindow("chat")}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              textAlign: "center",
              padding: 0,
            }}
          >
            <div style={{
              width: UNIT * 4,
              height: UNIT * 4,
              border: "1px solid #fff",
              marginBottom: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
            }}>
              💬
            </div>
            <div style={{ fontSize: "6px" }}>CHAT</div>
          </button>
        </div>

        {/* Windows */}
        {windows.map((win) => {
          if (win.type === "identity") {
            return (
              <PixelWindow
                key={win.id}
                title="Identity"
                x={win.x}
                y={win.y}
                width={UNIT * 20}
                height={UNIT * 24}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ textAlign: "center" }}>
                  {/* Avatar */}
                  <div
                    style={{
                      border: "1px solid #fff",
                      margin: "0 auto",
                      marginBottom: UNIT,
                      width: AVATAR_SIZE + 2,
                      height: AVATAR_SIZE + 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <PixelAvatar 
                      config={avatarConfig} 
                      onClick={() => setAvatarConfig(generateRandomFace())}
                    />
                  </div>
                  <div style={{ fontSize: "8px", marginBottom: 2 }}>NIMBUS</div>
                  <div style={{ color: "#888", marginBottom: UNIT }}>Chief Strategist</div>
                  <div>● ACTIVE Lv.5</div>
                  <div
                    style={{
                      borderTop: "1px solid #444",
                      marginTop: UNIT,
                      paddingTop: UNIT,
                      display: "flex",
                      justifyContent: "space-around",
                    }}
                  >
                    <div>♡ 42</div>
                    <div>◎ 1337</div>
                    <div>⚡ 7</div>
                  </div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "note") {
            return (
              <PixelWindow
                key={win.id}
                title="Note"
                x={win.x}
                y={win.y}
                width={UNIT * 18}
                height={UNIT * 14}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <textarea
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "#000",
                    color: "#fff",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    fontFamily: "inherit",
                    fontSize: "8px",
                    lineHeight: "1.4",
                  }}
                  placeholder="Type a note..."
                />
              </PixelWindow>
            );
          }
          if (win.type === "about") {
            return (
              <PixelWindow
                key={win.id}
                title="About"
                x={win.x}
                y={win.y}
                width={UNIT * 24}
                height={UNIT * 14}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", marginBottom: UNIT }}>BITFLOOR</div>
                  <div style={{ color: "#888", marginBottom: UNIT }}>v0.1.0</div>
                  <div>A pixel-art digital</div>
                  <div>office where humans</div>
                  <div>and AI coexist.</div>
                  <div style={{ color: "#888", marginTop: UNIT }}>bitfloor.ai</div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "chat") {
            const channels = ["general", "random", "dev"];
            const currentMessages = chatMessages[chatChannel] || [];
            return (
              <PixelWindow
                key={win.id}
                title="Team Chat"
                x={win.x}
                y={win.y}
                width={UNIT * 40}
                height={UNIT * 26}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ display: "flex", height: "100%", gap: 4 }}>
                  {/* Channel sidebar */}
                  <div style={{ 
                    width: UNIT * 10, 
                    borderRight: "1px solid #444",
                    paddingRight: 4,
                    overflow: "auto",
                  }}>
                    <div style={{ color: "#888", marginBottom: 4 }}>CHANNELS</div>
                    {channels.map(ch => (
                      <button
                        key={ch}
                        onClick={() => setChatChannel(ch)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: ch === chatChannel ? "#333" : "none",
                          border: "none",
                          color: ch === chatChannel ? "#fff" : "#888",
                          fontFamily: "inherit",
                          fontSize: "8px",
                          padding: "2px 4px",
                          cursor: "pointer",
                          marginBottom: 2,
                        }}
                      >
                        # {ch}
                      </button>
                    ))}
                    <div style={{ color: "#888", marginTop: UNIT, marginBottom: 4 }}>ONLINE</div>
                    <div style={{ color: "#0f0", fontSize: "8px" }}>● Nimbus</div>
                    <div style={{ color: "#0f0", fontSize: "8px" }}>● JP</div>
                  </div>
                  {/* Main chat area */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ color: "#888", marginBottom: 4 }}># {chatChannel}</div>
                    <div style={{ flex: 1, overflow: "auto", marginBottom: 4 }}>
                      {currentMessages.map((msg, i) => (
                        <div key={i} style={{ marginBottom: 4 }}>
                          <span style={{ color: "#888" }}>{msg.from}:</span> {msg.text}
                        </div>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && chatInput.trim()) {
                          setChatMessages({
                            ...chatMessages,
                            [chatChannel]: [...currentMessages, { from: "You", text: chatInput.trim() }]
                          });
                          setChatInput("");
                        }
                      }}
                      style={{ 
                        border: "1px solid #fff", 
                        padding: "2px 4px",
                        background: "#000",
                        color: "#fff",
                        fontFamily: "inherit",
                        fontSize: "8px",
                        outline: "none",
                      }}
                      placeholder={`Message #${chatChannel}...`}
                    />
                  </div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "terminal") {
            return (
              <PixelWindow
                key={win.id}
                title="Terminal"
                x={win.x}
                y={win.y}
                width={UNIT * 40}
                height={UNIT * 24}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div 
                  style={{ 
                    height: "100%", 
                    overflow: "auto", 
                    fontFamily: "inherit",
                    fontSize: "8px",
                    lineHeight: "1.5",
                    color: "#0f0",
                  }}
                >
                  {terminalLines.map((line, i) => (
                    <div key={i}>{line || "\u00A0"}</div>
                  ))}
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "browser") {
            return (
              <PixelWindow
                key={win.id}
                title="Browser"
                x={win.x}
                y={win.y}
                width={UNIT * 50}
                height={UNIT * 30}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  {/* URL bar */}
                  <div style={{ 
                    display: "flex", 
                    gap: 4, 
                    marginBottom: UNIT / 2,
                    paddingBottom: UNIT / 2,
                    borderBottom: "1px solid #444",
                  }}>
                    <input
                      type="text"
                      value={browserUrl}
                      onChange={(e) => setBrowserUrl(e.target.value)}
                      style={{
                        flex: 1,
                        border: "1px solid #fff",
                        padding: "2px 4px",
                        background: "#000",
                        color: "#fff",
                        fontFamily: "inherit",
                        fontSize: "8px",
                        outline: "none",
                      }}
                    />
                    <button
                      style={{
                        border: "1px solid #fff",
                        padding: "2px 6px",
                        background: "#000",
                        color: "#fff",
                        fontFamily: "inherit",
                        fontSize: "8px",
                        cursor: "pointer",
                      }}
                    >
                      GO
                    </button>
                  </div>
                  {/* ASCII rendered page */}
                  <div style={{ 
                    flex: 1, 
                    overflow: "auto",
                    border: "1px solid #444",
                    padding: UNIT / 2,
                    fontFamily: "inherit",
                    fontSize: "8px",
                    lineHeight: "1.4",
                  }}>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
{`╔══════════════════════════════════════╗
║          WELCOME TO BITFLOOR         ║
╠══════════════════════════════════════╣
║                                      ║
║  ┌────────────────────────────────┐  ║
║  │     ░░░░░   BITFLOOR   ░░░░░  │  ║
║  │                                │  ║
║  │   A pixel-art digital office  │  ║
║  │   where humans and AI agents  │  ║
║  │         coexist.              │  ║
║  │                                │  ║
║  │   [ENTER]  [ABOUT]  [HELP]    │  ║
║  └────────────────────────────────┘  ║
║                                      ║
║  ─────────────────────────────────   ║
║                                      ║
║  Latest News:                        ║
║  • Desktop OS now live               ║
║  • Chat system working               ║
║  • Terminal added                    ║
║                                      ║
╚══════════════════════════════════════╝`}
                    </pre>
                  </div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "music") {
            const track = musicPlaylist[musicTrack];
            return (
              <PixelWindow
                key={win.id}
                title="Walkman"
                x={win.x}
                y={win.y}
                width={UNIT * 28}
                height={UNIT * 30}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ textAlign: "center" }}>
                  {/* Cassette tape visual */}
                  <div style={{
                    border: "2px solid #fff",
                    padding: UNIT,
                    marginBottom: UNIT,
                    background: "#111",
                  }}>
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-around",
                      alignItems: "center",
                      marginBottom: UNIT / 2,
                    }}>
                      {/* Left reel */}
                      <div style={{
                        width: 32,
                        height: 32,
                        border: "2px solid #fff",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transform: `rotate(${cassetteAngle}deg)`,
                      }}>
                        <div style={{ 
                          width: 8, 
                          height: 8, 
                          background: "#fff",
                        }} />
                      </div>
                      {/* Right reel */}
                      <div style={{
                        width: 32,
                        height: 32,
                        border: "2px solid #fff",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transform: `rotate(${cassetteAngle}deg)`,
                      }}>
                        <div style={{ 
                          width: 8, 
                          height: 8, 
                          background: "#fff",
                        }} />
                      </div>
                    </div>
                    <div style={{ 
                      height: 4, 
                      background: musicPlaying ? "#fff" : "#444",
                      margin: "0 16px",
                    }} />
                  </div>
                  
                  {/* Track info */}
                  <div style={{ marginBottom: UNIT }}>
                    <div style={{ fontSize: "8px", color: "#fff" }}>{track.title}</div>
                    <div style={{ fontSize: "8px", color: "#888" }}>{track.artist}</div>
                    <div style={{ fontSize: "8px", color: "#666" }}>{track.duration}</div>
                  </div>
                  
                  {/* Controls */}
                  <div style={{ display: "flex", justifyContent: "center", gap: UNIT }}>
                    <button
                      onClick={() => setMusicTrack((musicTrack - 1 + musicPlaylist.length) % musicPlaylist.length)}
                      style={{ background: "none", border: "1px solid #fff", color: "#fff", padding: "4px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: "10px" }}
                    >
                      ◀◀
                    </button>
                    <button
                      onClick={() => setMusicPlaying(!musicPlaying)}
                      style={{ background: musicPlaying ? "#fff" : "none", border: "1px solid #fff", color: musicPlaying ? "#000" : "#fff", padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: "10px" }}
                    >
                      {musicPlaying ? "■" : "▶"}
                    </button>
                    <button
                      onClick={() => setMusicTrack((musicTrack + 1) % musicPlaylist.length)}
                      style={{ background: "none", border: "1px solid #fff", color: "#fff", padding: "4px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: "10px" }}
                    >
                      ▶▶
                    </button>
                  </div>
                  
                  {/* Playlist */}
                  <div style={{ 
                    marginTop: UNIT, 
                    borderTop: "1px solid #444", 
                    paddingTop: UNIT / 2,
                    maxHeight: UNIT * 8,
                    overflow: "auto",
                    textAlign: "left",
                  }}>
                    {musicPlaylist.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => { setMusicTrack(i); setMusicPlaying(true); }}
                        style={{
                          display: "block",
                          width: "100%",
                          background: i === musicTrack ? "#333" : "none",
                          border: "none",
                          color: i === musicTrack ? "#fff" : "#888",
                          fontFamily: "inherit",
                          fontSize: "7px",
                          padding: "2px 4px",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {i + 1}. {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "pixelart") {
            return (
              <PixelWindow
                key={win.id}
                title="Pixel Art"
                x={win.x}
                y={win.y}
                width={UNIT * 32}
                height={UNIT * 30}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ display: "flex", gap: UNIT }}>
                  {/* Canvas */}
                  <div style={{ border: "1px solid #fff" }}>
                    {pixelCanvas.map((row, y) => (
                      <div key={y} style={{ display: "flex" }}>
                        {row.map((cell, x) => (
                          <div
                            key={x}
                            onClick={() => {
                              const newCanvas = [...pixelCanvas];
                              newCanvas[y] = [...newCanvas[y]];
                              newCanvas[y][x] = pixelColor;
                              setPixelCanvas(newCanvas);
                            }}
                            style={{
                              width: 10,
                              height: 10,
                              background: cell ? "#fff" : "#000",
                              cursor: "crosshair",
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  
                  {/* Tools */}
                  <div style={{ display: "flex", flexDirection: "column", gap: UNIT / 2 }}>
                    <div style={{ fontSize: "8px", color: "#888" }}>COLOR</div>
                    <button
                      onClick={() => setPixelColor(1)}
                      style={{
                        width: 20,
                        height: 20,
                        background: "#fff",
                        border: pixelColor === 1 ? "2px solid #0f0" : "1px solid #888",
                        cursor: "pointer",
                      }}
                    />
                    <button
                      onClick={() => setPixelColor(0)}
                      style={{
                        width: 20,
                        height: 20,
                        background: "#000",
                        border: pixelColor === 0 ? "2px solid #0f0" : "1px solid #888",
                        cursor: "pointer",
                      }}
                    />
                    <div style={{ fontSize: "8px", color: "#888", marginTop: UNIT }}>TOOLS</div>
                    <button
                      onClick={() => setPixelCanvas(Array(16).fill(null).map(() => Array(16).fill(0)))}
                      style={{
                        background: "none",
                        border: "1px solid #fff",
                        color: "#fff",
                        fontFamily: "inherit",
                        fontSize: "7px",
                        padding: "2px 4px",
                        cursor: "pointer",
                      }}
                    >
                      CLEAR
                    </button>
                    <button
                      onClick={() => {
                        const newCanvas = pixelCanvas.map(row => [...row].reverse());
                        setPixelCanvas(newCanvas);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid #fff",
                        color: "#fff",
                        fontFamily: "inherit",
                        fontSize: "7px",
                        padding: "2px 4px",
                        cursor: "pointer",
                      }}
                    >
                      FLIP H
                    </button>
                  </div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "memory") {
            return (
              <PixelWindow
                key={win.id}
                title="Memory Viewer"
                x={win.x}
                y={win.y}
                width={UNIT * 50}
                height={UNIT * 32}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ display: "flex", height: "100%", gap: 4 }}>
                  {/* File sidebar */}
                  <div style={{ 
                    width: UNIT * 12, 
                    borderRight: "1px solid #444",
                    paddingRight: 4,
                    overflow: "auto",
                  }}>
                    <div style={{ color: "#888", marginBottom: 4, fontSize: "7px" }}>MEMORY FILES</div>
                    {memoryFiles.map(f => (
                      <button
                        key={f.name}
                        onClick={() => setMemoryFile(f.name)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: f.name === memoryFile ? "#333" : "none",
                          border: "none",
                          color: f.name === memoryFile ? "#fff" : "#888",
                          fontFamily: "inherit",
                          fontSize: "7px",
                          padding: "2px 4px",
                          cursor: "pointer",
                          marginBottom: 2,
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                    <div style={{ 
                      marginTop: UNIT, 
                      paddingTop: UNIT / 2,
                      borderTop: "1px solid #444",
                    }}>
                      <div style={{ color: "#888", fontSize: "7px", marginBottom: 4 }}>STATS</div>
                      <div style={{ fontSize: "7px", color: "#666" }}>
                        <div>Files: {memoryStats.files}</div>
                        <div>Age: {memoryStats.age}</div>
                        <div>Born: {memoryStats.born}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Content viewer */}
                  <div style={{ 
                    flex: 1, 
                    display: "flex", 
                    flexDirection: "column",
                  }}>
                    <div style={{ 
                      color: "#888", 
                      marginBottom: 4, 
                      fontSize: "7px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}>
                      <span>{memoryFile}</span>
                      <span>{memoryLoading ? "LOADING..." : "READ-ONLY"}</span>
                    </div>
                    <div style={{ 
                      flex: 1, 
                      overflow: "auto",
                      border: "1px solid #444",
                      padding: 4,
                      fontSize: "7px",
                      lineHeight: "1.4",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      color: memoryLoading ? "#666" : "#ccc",
                    }}>
                      {memoryContent}
                    </div>
                  </div>
                </div>
              </PixelWindow>
            );
          }
          if (win.type === "agent") {
            return (
              <PixelWindow
                key={win.id}
                title="Agent Console"
                x={win.x}
                y={win.y}
                width={UNIT * 44}
                height={UNIT * 28}
                zIndex={win.z}
                onClose={() => closeWindow(win.id)}
                onFocus={() => focusWindow(win.id)}
                onDrag={(x, y) => moveWindow(win.id, x, y)}
              >
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  {/* Status header */}
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: UNIT,
                    paddingBottom: UNIT / 2,
                    borderBottom: "1px solid #444",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: agentStatus === "offline" ? "#f00" : 
                                   agentStatus === "idle" ? "#888" : 
                                   agentStatus === "thinking" ? "#ff0" : "#0f0",
                        animation: agentStatus === "working" || agentStatus === "thinking" ? "pulse 1s infinite" : "none",
                      }} />
                      <span style={{ fontSize: "8px", textTransform: "uppercase" }}>
                        {agentStatus === "offline" ? "OFFLINE" :
                         agentStatus === "idle" ? "IDLE" : 
                         agentStatus === "thinking" ? "THINKING..." : "WORKING"}
                      </span>
                    </div>
                    <span style={{ 
                      color: agentGateway === "online" ? "#0f0" : agentGateway === "offline" ? "#f00" : "#888", 
                      fontSize: "7px" 
                    }}>
                      GW: {agentGateway.toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Current task */}
                  <div style={{ marginBottom: UNIT }}>
                    <div style={{ color: "#888", fontSize: "7px", marginBottom: 2 }}>CURRENT TASK</div>
                    <div style={{ 
                      background: "#111",
                      border: "1px solid #444",
                      padding: "4px 6px",
                      fontSize: "8px",
                    }}>
                      {agentTask || "No active task"}
                    </div>
                  </div>
                  
                  {/* Activity log */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ color: "#888", fontSize: "7px", marginBottom: 2 }}>ACTIVITY LOG</div>
                    <div style={{ 
                      flex: 1,
                      overflow: "auto",
                      border: "1px solid #444",
                      padding: 4,
                      fontSize: "7px",
                      fontFamily: "inherit",
                    }}>
                      {agentLog.map((entry, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <span style={{ color: "#666" }}>[{entry.time}]</span>{" "}
                          <span style={{ color: "#0f0" }}>{entry.action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Controls */}
                  <div style={{ 
                    display: "flex", 
                    gap: UNIT,
                    marginTop: UNIT,
                    paddingTop: UNIT / 2,
                    borderTop: "1px solid #444",
                  }}>
                    <button
                      onClick={() => setAgentStatus(agentStatus === "working" ? "idle" : "working")}
                      style={{
                        flex: 1,
                        background: agentStatus === "working" ? "#fff" : "none",
                        border: "1px solid #fff",
                        color: agentStatus === "working" ? "#000" : "#fff",
                        fontFamily: "inherit",
                        fontSize: "7px",
                        padding: "4px 8px",
                        cursor: "pointer",
                      }}
                    >
                      {agentStatus === "working" ? "■ STOP" : "▶ START"}
                    </button>
                    <button
                      onClick={() => setAgentLog([])}
                      style={{
                        background: "none",
                        border: "1px solid #fff",
                        color: "#fff",
                        fontFamily: "inherit",
                        fontSize: "7px",
                        padding: "4px 8px",
                        cursor: "pointer",
                      }}
                    >
                      CLEAR LOG
                    </button>
                  </div>
                </div>
              </PixelWindow>
            );
          }
          return null;
        })}
      </div>

      {/* Status bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: menuBarHeight,
          borderTop: "1px solid #444",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${UNIT}px`,
          color: "#888",
        }}
      >
        <span>READY</span>
        <span>{windows.length} WINDOW{windows.length !== 1 ? "S" : ""}</span>
      </div>
    </div>
  );
}

export default PixelDesktop;
