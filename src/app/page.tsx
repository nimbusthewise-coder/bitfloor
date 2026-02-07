"use client";

import { useState } from "react";
import PixelScreen from "@/components/PixelScreen";
import PixelDesktop from "@/components/PixelDesktop";
import OfficeWorld from "@/components/OfficeWorld";

export default function Home() {
  const [view, setView] = useState<"desktop" | "office">("desktop");

  return (
    <PixelScreen>
      {view === "desktop" ? (
        <PixelDesktop onSwitchView={() => setView("office")} />
      ) : (
        <div style={{ position: "relative" }}>
          <OfficeWorld />
          {/* Back button */}
          <button
            onClick={() => setView("desktop")}
            style={{
              position: "absolute",
              top: 4,
              right: 8,
              background: "none",
              border: "1px solid #fff",
              color: "#fff",
              fontSize: "8px",
              padding: "2px 6px",
              cursor: "pointer",
              fontFamily: "'Press Start 2P', monospace",
              zIndex: 100,
            }}
          >
            DESKTOP
          </button>
        </div>
      )}
    </PixelScreen>
  );
}
