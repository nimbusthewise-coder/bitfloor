"use client";

import { useState } from "react";
import Window from "./Window";

interface StickyNoteProps {
  defaultContent?: string;
  defaultPosition?: { x: number; y: number };
  zIndex?: number;
  onClose?: () => void;
  onFocus?: () => void;
}

export function StickyNote({
  defaultContent = "",
  defaultPosition = { x: 150, y: 150 },
  zIndex = 1,
  onClose,
  onFocus,
}: StickyNoteProps) {
  const [content, setContent] = useState(defaultContent);

  return (
    <Window
      title="Note"
      defaultPosition={defaultPosition}
      defaultSize={{ width: 200, height: 150 }}
      zIndex={zIndex}
      onClose={onClose}
      onFocus={onFocus}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full h-full bg-black text-white text-sm resize-none outline-none border-none"
        placeholder="Type a note..."
      />
    </Window>
  );
}

export default StickyNote;
