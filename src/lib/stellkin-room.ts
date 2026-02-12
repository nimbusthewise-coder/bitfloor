export type RoomTokens = {
  colors: {
    bgDeep: string;
    bgSurface: string;
    primary: string;
    primaryDim: string;
    primaryGlow: string;
    cyanAccent: string;
    textPrimary: string;
    border: string;
  };
  borders: {
    weight: number;
    radius: number;
  };
  glows: {
    ambient: string;
    screen: string;
  };
};

type GlowConfig = { blur: number; color: string };

export type RoomElement = {
  type: "panel" | "bunk" | "terminal" | "storage" | "glow" | "text" | "decor";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  label?: string;
  glow?: GlowConfig;
};

export type RoomSpec = {
  name: string;
  width: number;
  height: number;
  elements: RoomElement[];
  tokens: RoomTokens;
};

export const LUMA_TOKENS: RoomTokens = {
  colors: {
    bgDeep: "#0a0a0f",
    bgSurface: "#1a1a2e",
    primary: "#ff00aa",
    primaryDim: "#cc0088",
    primaryGlow: "#ff00aa80",
    cyanAccent: "#00f0ff",
    textPrimary: "#ffffff",
    border: "#444455",
  },
  borders: { weight: 1, radius: 2 },
  glows: {
    ambient: "rgba(255, 0, 170, 0.3)",
    screen: "rgba(0, 240, 255, 0.4)",
  },
};

export const LUMA_QUARTER: RoomSpec = {
  name: "LUMA'S QUARTERS",
  width: 14,
  height: 12,
  tokens: LUMA_TOKENS,
  elements: [
    // Header panel
    { type: "panel", x: 1, y: 1, w: 12, h: 2, label: "LUMA" },
    // Terminal
    { type: "terminal", x: 1, y: 4, w: 4, h: 3, label: "TERM" },
    // Bunk
    { type: "bunk", x: 8, y: 4, w: 5, h: 4, label: "BUNK" },
    // Glow under bunk
    { type: "glow", x: 9, y: 8, w: 3, h: 1 },
    // Storage
    { type: "storage", x: 1, y: 9, w: 4, h: 2, label: "STOR" },
    // Personal touches
    { type: "decor", x: 7, y: 9, w: 1, h: 1 },
    { type: "decor", x: 8, y: 9, w: 1, h: 1 },
  ],
};

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: RoomElement,
  tokens: RoomTokens,
  tile: number
) {
  const x = el.x * tile;
  const y = el.y * tile;
  const w = el.w * tile;
  const h = el.h * tile;

  ctx.save();

  const fill = el.fill ?? tokens.colors.bgSurface;
  const stroke = el.stroke ?? tokens.colors.border;

  if (el.glow) {
    ctx.shadowBlur = el.glow.blur;
    ctx.shadowColor = el.glow.color;
  }

  if (el.type === "glow") {
    ctx.fillStyle = tokens.colors.primaryGlow;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  if (el.type === "panel") {
    ctx.fillStyle = fill;
    roundedRectPath(ctx, x, y, w, h, tokens.borders.radius * tile * 0.15);
    ctx.fill();
    ctx.strokeStyle = tokens.colors.primary;
    ctx.lineWidth = tokens.borders.weight;
    ctx.stroke();
  } else {
    ctx.fillStyle = fill;
    roundedRectPath(ctx, x, y, w, h, tokens.borders.radius);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = tokens.borders.weight;
    ctx.stroke();
  }

  if (el.label) {
    ctx.fillStyle = tokens.colors.textPrimary;
    ctx.font = `${Math.max(6, Math.floor(tile * 0.35))}px 'Press Start 2P', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.label, x + w / 2, y + h / 2);
  }

  if (el.type === "terminal") {
    ctx.shadowBlur = 12;
    ctx.shadowColor = tokens.glows.screen;
    ctx.fillStyle = tokens.colors.cyanAccent;
    ctx.fillRect(x + tile * 0.2, y + tile * 0.2, w - tile * 0.4, h - tile * 0.4);
  }

  if (el.type === "bunk") {
    ctx.fillStyle = tokens.colors.primaryDim;
    ctx.fillRect(x + tile * 0.2, y + tile * 0.6, w - tile * 0.4, tile * 0.4);
  }

  if (el.type === "decor") {
    ctx.fillStyle = tokens.colors.primary;
    ctx.fillRect(x, y, w, h);
  }

  ctx.restore();
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  room: RoomSpec,
  options?: { tile?: number; padding?: number }
) {
  const tile = options?.tile ?? 16;
  const padding = options?.padding ?? 8;
  const width = room.width * tile + padding * 2;
  const height = room.height * tile + padding * 2;

  ctx.canvas.width = width;
  ctx.canvas.height = height;

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = room.tokens.colors.bgDeep;
  ctx.fillRect(0, 0, width, height);

  // Room shell
  ctx.save();
  ctx.translate(padding, padding);
  ctx.fillStyle = room.tokens.colors.bgSurface;
  ctx.strokeStyle = room.tokens.colors.border;
  ctx.lineWidth = room.tokens.borders.weight;
  roundedRectPath(ctx, 0, 0, room.width * tile, room.height * tile, room.tokens.borders.radius);
  ctx.fill();
  ctx.stroke();

  // Ambient glow strip (top)
  ctx.shadowBlur = 18;
  ctx.shadowColor = room.tokens.glows.ambient;
  ctx.fillStyle = room.tokens.colors.primary;
  ctx.fillRect(tile * 0.5, tile * 0.2, room.width * tile - tile, tile * 0.15);
  ctx.shadowBlur = 0;

  for (const el of room.elements) {
    drawElement(ctx, el, room.tokens, tile);
  }

  ctx.restore();
}

export function renderRoomCanvas(
  room: RoomSpec,
  options?: { tile?: number; padding?: number }
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  drawRoom(ctx, room, options);
  return canvas;
}
