"use client";

import { useState } from "react";
import MenuBar from "./MenuBar";
import IdentityCard from "./IdentityCard";
import StickyNote from "./StickyNote";
import Window from "./Window";

type WindowType = "identity" | "note" | "about" | "chat";

interface OpenWindow {
  id: string;
  type: WindowType;
  position: { x: number; y: number };
  zIndex: number;
}

export function Desktop() {
  const [windows, setWindows] = useState<OpenWindow[]>([
    { id: "identity-1", type: "identity", position: { x: 50, y: 40 }, zIndex: 1 },
  ]);
  const [topZIndex, setTopZIndex] = useState(1);

  const addWindow = (type: WindowType) => {
    const id = `${type}-${Date.now()}`;
    const offset = (windows.length % 5) * 30;
    const newZ = topZIndex + 1;
    setTopZIndex(newZ);
    setWindows([
      ...windows,
      { id, type, position: { x: 120 + offset, y: 60 + offset }, zIndex: newZ },
    ]);
  };

  const closeWindow = (id: string) => {
    setWindows(windows.filter((w) => w.id !== id));
  };

  const focusWindow = (id: string) => {
    const newZ = topZIndex + 1;
    setTopZIndex(newZ);
    setWindows(
      windows.map((w) => (w.id === id ? { ...w, zIndex: newZ } : w))
    );
  };

  const menus = [
    {
      label: "File",
      items: [
        { label: "New Note", action: () => addWindow("note") },
        { label: "New Chat", action: () => addWindow("chat") },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Cut", action: () => {} },
        { label: "Copy", action: () => {} },
        { label: "Paste", action: () => {} },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Identity Card", action: () => addWindow("identity") },
      ],
    },
    {
      label: "About",
      items: [{ label: "About Bitfloor", action: () => addWindow("about") }],
    },
  ];

  const myIdentity = {
    name: "Nimbus",
    role: "Chief Strategist",
    status: "active" as const,
    level: 5,
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex flex-col">
      {/* Menu Bar */}
      <MenuBar menus={menus} />

      {/* Desktop Area */}
      <div className="flex-1 relative">
        {/* Desktop pattern (subtle grid) */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: "16px 16px",
          }}
        />

        {/* Windows */}
        {windows.map((win) => {
          switch (win.type) {
            case "identity":
              return (
                <IdentityCard
                  key={win.id}
                  identity={myIdentity}
                  defaultPosition={win.position}
                  zIndex={win.zIndex}
                  onClose={() => closeWindow(win.id)}
                  onFocus={() => focusWindow(win.id)}
                />
              );
            case "note":
              return (
                <StickyNote
                  key={win.id}
                  defaultPosition={win.position}
                  zIndex={win.zIndex}
                  onClose={() => closeWindow(win.id)}
                  onFocus={() => focusWindow(win.id)}
                />
              );
            case "about":
              return (
                <Window
                  key={win.id}
                  title="About Bitfloor"
                  defaultPosition={win.position}
                  defaultSize={{ width: 280, height: 180 }}
                  zIndex={win.zIndex}
                  onClose={() => closeWindow(win.id)}
                  onFocus={() => focusWindow(win.id)}
                >
                  <div className="text-center text-sm">
                    <div className="text-lg mb-2">BITFLOOR</div>
                    <div className="text-xs text-white/70 mb-4">
                      v0.1.0
                    </div>
                    <div className="text-xs leading-relaxed">
                      A pixel-art digital office where
                      <br />
                      humans and AI agents coexist.
                    </div>
                    <div className="mt-4 text-xs text-white/50">
                      bitfloor.ai
                    </div>
                  </div>
                </Window>
              );
            case "chat":
              return (
                <Window
                  key={win.id}
                  title="Team Chat"
                  defaultPosition={win.position}
                  defaultSize={{ width: 300, height: 250 }}
                  zIndex={win.zIndex}
                  onClose={() => closeWindow(win.id)}
                  onFocus={() => focusWindow(win.id)}
                >
                  <div className="flex flex-col h-full">
                    <div className="flex-1 text-xs space-y-2 mb-2">
                      <div>
                        <span className="text-white/70">Nimbus:</span> Working on
                        the UI...
                      </div>
                      <div>
                        <span className="text-white/70">JP:</span> Looks great!
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Type a message..."
                      className="w-full bg-black border border-white px-2 py-1 text-xs outline-none focus:bg-white focus:text-black"
                    />
                  </div>
                </Window>
              );
            default:
              return null;
          }
        })}

        {/* Status bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/30 px-2 py-1 text-xs text-white/50 flex justify-between">
          <span>Ready</span>
          <span>{windows.length} window{windows.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}

export default Desktop;
