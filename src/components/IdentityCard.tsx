"use client";

import Window from "./Window";
import AvatarGenerator, { AvatarConfig } from "./AvatarGenerator";
import { useState } from "react";

interface Identity {
  name: string;
  role: string;
  status: "active" | "away" | "offline";
  level?: number;
}

interface IdentityCardProps {
  identity: Identity;
  avatarConfig?: AvatarConfig;
  defaultPosition?: { x: number; y: number };
  onClose?: () => void;
  onAvatarChange?: (config: AvatarConfig) => void;
}

export function IdentityCard({
  identity,
  avatarConfig,
  defaultPosition = { x: 50, y: 80 },
  onClose,
  onAvatarChange,
}: IdentityCardProps) {
  const [config, setConfig] = useState<AvatarConfig | undefined>(avatarConfig);

  const statusIndicator = {
    active: "●",
    away: "○",
    offline: "×",
  };

  return (
    <Window
      title="Identity"
      defaultPosition={defaultPosition}
      defaultSize={{ width: 220, height: 280 }}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-3">
        {/* Avatar */}
        <div className="border border-white p-1">
          <AvatarGenerator
            size={80}
            initialConfig={config}
            onGenerate={(newConfig) => {
              setConfig(newConfig);
              onAvatarChange?.(newConfig);
            }}
          />
        </div>

        {/* Info */}
        <div className="text-center">
          <div className="text-sm font-bold">{identity.name}</div>
          <div className="text-xs text-white/70">{identity.role}</div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs">
          <span>{statusIndicator[identity.status]}</span>
          <span className="uppercase">{identity.status}</span>
          {identity.level && (
            <span className="text-white/70">Lv.{identity.level}</span>
          )}
        </div>

        {/* Stats (placeholder) */}
        <div className="w-full border-t border-white/30 pt-2 mt-1">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-white/70">♡</div>
              <div>42</div>
            </div>
            <div>
              <div className="text-white/70">◎</div>
              <div>1,337</div>
            </div>
            <div>
              <div className="text-white/70">⚡</div>
              <div>7</div>
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

export default IdentityCard;
