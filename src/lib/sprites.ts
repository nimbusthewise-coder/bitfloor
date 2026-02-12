/**
 * Bitship Sprite System
 * Handles loading, parsing, tinting, and baking character sprites
 */

// Types
export interface FrameData {
  x: number;
  y: number;
  w: number;
  h: number;
  duration: number;
}

export interface SpriteFrame {
  tag: string;      // Run, Idle, Jump, etc.
  frame: number;    // 0-29
  layer: string;    // Suit, Gloves, Boots, Gun, Head, Helmet
  data: FrameData;
}

export interface AnimationTag {
  name: string;
  from: number;
  to: number;
  direction: string;
}

export interface SpriteSheet {
  image: HTMLImageElement;
  frames: Map<string, SpriteFrame>;  // keyed by "Tag_Frame_Layer"
  tags: AnimationTag[];
  layers: string[];
  size: { w: number; h: number };
}

export interface Identity {
  id: string;
  name: string;
  faceDNA: number[];
  tints: {
    Suit?: string;
    Gloves?: string;
    Boots?: string;
    Gun?: string;
    Helmet?: string;
  };
  faceTints?: {
    skin?: string;       // Head, nose, ears
    hair?: string;       // Hair color
    background?: string; // Visor/background circle
  };
  speed: number;  // animation speed multiplier
}

export interface BakedSprite {
  identity: Identity;
  canvas: HTMLCanvasElement;  // pre-baked sprite sheet for this identity
  width: number;
  height: number;
}

// Face sheet for DNA compositing
export interface FaceSheet {
  image: HTMLImageElement;
  tileSize: number;      // 32 for face-32.png
  columns: number;       // 10 variants per layer
  // Layer order (rows): 0=blank, 1=head, 2=eyes, 3=mouth, 4=nose, 5=hair, 6=glasses, 7=ears
}

// Load face sprite sheet
export async function loadFaceSheet(imagePath: string): Promise<FaceSheet> {
  const image = new Image();
  image.src = imagePath;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
  
  return {
    image,
    tileSize: 32,
    columns: 10,
  };
}

// Composite face from DNA array
// DNA format: [blank, head, eyes, mouth, nose, hair, glasses, ears]
// Layer indices: 0=background, 1=head, 2=eyes, 3=mouth, 4=nose, 5=hair, 6=glasses, 7=ears
export function compositeFace(
  faceSheet: FaceSheet,
  faceDNA: number[],
  outputSize: number = 32,
  faceTints?: { skin?: string; hair?: string; background?: string }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  
  // Temp canvas for tinting individual layers
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = outputSize;
  tempCanvas.height = outputSize;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
  tempCtx.imageSmoothingEnabled = false;
  
  const { image, tileSize, columns } = faceSheet;
  
  // Determine which layers get which tint
  // 0=background, 1=head, 4=nose, 7=ears → skin
  // 5=hair → hair
  const getTint = (layerIndex: number): string | undefined => {
    if (!faceTints) return undefined;
    if (layerIndex === 0) return faceTints.background;
    if (layerIndex === 1 || layerIndex === 4 || layerIndex === 7) return faceTints.skin;
    if (layerIndex === 5) return faceTints.hair;
    return undefined; // eyes, mouth, glasses - no tint
  };
  
  // Layer order matches DNA array indices
  for (let layerIndex = 0; layerIndex < faceDNA.length; layerIndex++) {
    const variant = faceDNA[layerIndex];
    if (variant < 0 || variant >= columns) continue; // Skip invalid
    
    // Source position in face sheet
    const srcX = variant * tileSize;
    const srcY = layerIndex * tileSize;
    
    const tint = getTint(layerIndex);
    
    if (tint) {
      // Draw to temp, tint, then composite
      tempCtx.clearRect(0, 0, outputSize, outputSize);
      tempCtx.drawImage(
        image,
        srcX, srcY, tileSize, tileSize,
        0, 0, outputSize, outputSize
      );
      applyTint(tempCtx, tint, 0, 0, outputSize, outputSize);
      ctx.drawImage(tempCanvas, 0, 0);
    } else {
      // Draw directly without tint
      ctx.drawImage(
        image,
        srcX, srcY, tileSize, tileSize,
        0, 0, outputSize, outputSize
      );
    }
  }
  
  return canvas;
}

// Find bounding box of non-transparent pixels in a region
export function findContentBounds(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number; cx: number; cy: number } | null {
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  
  let minX = w, minY = h, maxX = 0, maxY = 0;
  let found = false;
  
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const alpha = data[(py * w + px) * 4 + 3];
      if (alpha > 0) {
        found = true;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  
  if (!found) return null;
  
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  return {
    x: minX,
    y: minY,
    w: bw,
    h: bh,
    cx: minX + bw / 2,  // center x
    cy: minY + bh / 2,  // center y
  };
}

// Parse Aseprite JSON format
export function parseSpriteJSON(json: any): { 
  frames: Map<string, SpriteFrame>; 
  tags: AnimationTag[]; 
  layers: string[];
  size: { w: number; h: number };
} {
  const frames = new Map<string, SpriteFrame>();
  const framesData = json.frames;
  
  // Handle both object and array formats
  const frameEntries = Array.isArray(framesData) 
    ? framesData.map((f: any) => [f.filename, f])
    : Object.entries(framesData);
  
  for (const [filename, frameInfo] of frameEntries) {
    // Parse "Tag_Frame_Layer" format
    const parts = (filename as string).split('_');
    if (parts.length >= 3) {
      const tag = parts[0];
      const frameNum = parseInt(parts[1], 10);
      const layer = parts.slice(2).join('_'); // Handle layer names with underscores
      
      const frame = (frameInfo as any).frame;
      frames.set(filename as string, {
        tag,
        frame: frameNum,
        layer,
        data: {
          x: frame.x,
          y: frame.y,
          w: frame.w,
          h: frame.h,
          duration: (frameInfo as any).duration || 100,
        },
      });
    }
  }
  
  const tags: AnimationTag[] = json.meta?.frameTags || [];
  const layers: string[] = (json.meta?.layers || []).map((l: any) => l.name);
  const size = json.meta?.size || { w: 0, h: 0 };
  
  return { frames, tags, layers, size };
}

// Load sprite sheet image and JSON
export async function loadSpriteSheet(
  imagePath: string,
  jsonPath: string
): Promise<SpriteSheet> {
  // Load JSON
  const jsonResponse = await fetch(jsonPath);
  const json = await jsonResponse.json();
  
  // Parse JSON
  const { frames, tags, layers, size } = parseSpriteJSON(json);
  
  // Load image
  const image = new Image();
  image.src = imagePath;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
  
  // console.log('[loadSpriteSheet] Loaded tags:', tags.map(t => `${t.name}(${t.from}-${t.to})`));
  
  return { image, frames, tags, layers, size };
}

// Apply tint to a canvas region using multiply blend
// Preserves original alpha channel
export function applyTint(
  ctx: CanvasRenderingContext2D,
  tintColor: string,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (!tintColor || tintColor === 'none') return;
  
  // Get original image data to preserve alpha
  const imageData = ctx.getImageData(x, y, w, h);
  const originalAlpha = new Uint8ClampedArray(imageData.data.length / 4);
  for (let i = 0; i < originalAlpha.length; i++) {
    originalAlpha[i] = imageData.data[i * 4 + 3]; // Save alpha channel
  }
  
  // Apply multiply blend
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tintColor;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  
  // Restore original alpha
  const tintedData = ctx.getImageData(x, y, w, h);
  for (let i = 0; i < originalAlpha.length; i++) {
    tintedData.data[i * 4 + 3] = originalAlpha[i];
  }
  ctx.putImageData(tintedData, x, y);
}

// Bake a complete sprite sheet for an identity with all tints applied
export function bakeIdentitySprites(
  sheet: SpriteSheet,
  identity: Identity,
  faceSheet?: FaceSheet // Optional face DNA sheet for head compositing
): BakedSprite {
  const { image, frames, layers, size } = sheet;
  
  // Create output canvas same size as source
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  
  // Get unique frame positions (for compositing layers)
  const framePositions = new Map<string, { x: number; y: number; w: number; h: number }>();
  
  // Process each frame
  for (const [key, frame] of frames) {
    const { tag, frame: frameNum, layer, data } = frame;
    const posKey = `${tag}_${frameNum}`;
    
    // Calculate output position (all layers composite to same position)
    if (!framePositions.has(posKey)) {
      framePositions.set(posKey, { x: data.x, y: 0, w: data.w, h: data.h });
    }
  }
  
  // Layer order for compositing (bottom to top)
  const layerOrder = ['Suit', 'Gloves', 'Boots', 'Gun', 'Head', 'Helmet'];
  
  // For each frame position, composite all layers
  const offscreen = document.createElement('canvas');
  offscreen.width = 48;
  offscreen.height = 48;
  const offCtx = offscreen.getContext('2d', { willReadFrequently: true })!;
  offCtx.imageSmoothingEnabled = false;
  
  // Temp canvas for tinting individual layers
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 48;
  tempCanvas.height = 48;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
  tempCtx.imageSmoothingEnabled = false;
  
  // We need to draw each complete frame
  // Frames are arranged in rows by layer in the source
  // Output should be a single row with all layers composited
  
  const numFrames = 30; // Total frames
  const frameSize = 48;
  
  // Output: single row of composited frames
  canvas.width = numFrames * frameSize;
  canvas.height = frameSize;
  
  for (let frameNum = 0; frameNum < numFrames; frameNum++) {
    // Clear offscreen
    offCtx.clearRect(0, 0, frameSize, frameSize);
    
    // Find the tag for this frame number and calculate tag-relative index
    let currentTag = 'Run';
    let tagFrameIndex = frameNum;
    for (const tag of sheet.tags) {
      if (frameNum >= tag.from && frameNum <= tag.to) {
        currentTag = tag.name;
        tagFrameIndex = frameNum - tag.from;  // Convert to tag-relative index
        break;
      }
    }
    
    // Composite each layer
    for (const layerName of layerOrder) {
      // Use absolute frame number - JSON keys are like "Idle_8_Suit" not "Idle_0_Suit"
      const frameKey = `${currentTag}_${frameNum}_${layerName}`;
      const frame = frames.get(frameKey);
      
      if (!frame) continue;
      
      // Replace Head layer with face DNA composite (positioned by Helmet bounds)
      if (layerName === 'Head') {
        if (faceSheet && identity.faceDNA && identity.faceDNA.length > 0) {
          // Look up Helmet layer to find where to position face
          const helmetKey = `${currentTag}_${frameNum}_Helmet`;
          const helmetFrame = frames.get(helmetKey);
          
          let faceX = (frameSize - 32) / 2;
          let faceY = 2;
          
          if (helmetFrame) {
            // Draw Helmet layer to temp canvas to find its bounds
            tempCtx.clearRect(0, 0, frameSize, frameSize);
            tempCtx.drawImage(
              image,
              helmetFrame.data.x, helmetFrame.data.y, helmetFrame.data.w, helmetFrame.data.h,
              0, 0, frameSize, frameSize
            );
            
            // Find where the helmet content is
            const bounds = findContentBounds(tempCtx, 0, 0, frameSize, frameSize);
            
            if (bounds) {
              // Center face inside helmet bounds (with -1px Y adjustment)
              faceX = Math.round(bounds.cx - 16); // 16 = half of 32
              faceY = Math.round(bounds.cy - 16) - 1;
            }
          }
          
          // Composite face from DNA with tints and draw at calculated position
          const faceCanvas = compositeFace(faceSheet, identity.faceDNA, 32, identity.faceTints);
          offCtx.drawImage(faceCanvas, faceX, faceY);
        }
        // Skip the original Head layer either way
        continue;
      }
      
      // Get tint for this layer
      const tint = identity.tints[layerName as keyof typeof identity.tints];
      
      if (tint) {
        // Draw layer to temp canvas, tint it, then composite to offscreen
        tempCtx.clearRect(0, 0, frameSize, frameSize);
        tempCtx.drawImage(
          image,
          frame.data.x, frame.data.y, frame.data.w, frame.data.h,
          0, 0, frameSize, frameSize
        );
        applyTint(tempCtx, tint, 0, 0, frameSize, frameSize);
        offCtx.drawImage(tempCanvas, 0, 0);
      } else {
        // No tint - draw directly to offscreen
        offCtx.drawImage(
          image,
          frame.data.x, frame.data.y, frame.data.w, frame.data.h,
          0, 0, frameSize, frameSize
        );
      }
    }
    
    // Copy composited frame to output
    ctx.drawImage(offscreen, frameNum * frameSize, 0);
  }
  
  return {
    identity,
    canvas,
    width: canvas.width,
    height: canvas.height,
  };
}

// Animation state manager
export class SpriteAnimator {
  private sheet: SpriteSheet;
  private bakedSprite: BakedSprite | null = null;
  private currentTag: string = 'Idle';
  private currentFrame: number = 0;
  private frameTime: number = 0;
  private frameIndex: number = 0; // Index within current animation
  
  constructor(sheet: SpriteSheet) {
    this.sheet = sheet;
  }
  
  setBakedSprite(baked: BakedSprite): void {
    this.bakedSprite = baked;
  }
  
  setAnimation(tag: string): void {
    if (tag !== this.currentTag) {
      this.currentTag = tag;
      this.frameIndex = 0;
      this.frameTime = 0;

      // Find the tag info
      const tagInfo = this.sheet.tags.find(t => t.name === tag);
      console.log(`[SpriteAnimator] setAnimation("${tag}") - tagInfo:`, tagInfo, 'available tags:', this.sheet.tags.map(t => t.name));
      if (tagInfo) {
        this.currentFrame = tagInfo.from;
      }
    }
  }
  
  update(deltaMs: number, speed: number = 1): void {
    this.frameTime += deltaMs * speed;
    
    const tagInfo = this.sheet.tags.find(t => t.name === this.currentTag);
    if (!tagInfo) return;
    
    // Get frame duration (default 100ms)
    const frameDuration = 100;
    
    if (this.frameTime >= frameDuration) {
      this.frameTime -= frameDuration;
      this.frameIndex++;
      
      const numFrames = tagInfo.to - tagInfo.from + 1;
      if (this.frameIndex >= numFrames) {
        this.frameIndex = 0;
      }
      
      this.currentFrame = tagInfo.from + this.frameIndex;
    }
  }
  
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    flipX: boolean = false,
    scale: number = 1
  ): void {
    if (!this.bakedSprite) return;
    
    const frameSize = 48;
    const srcX = this.currentFrame * frameSize;
    
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    
    if (flipX) {
      ctx.translate(x + frameSize * scale, y);
      ctx.scale(-1, 1);
      x = 0;
      y = 0;
    }
    
    ctx.drawImage(
      this.bakedSprite.canvas,
      srcX, 0, frameSize, frameSize,
      x, y, frameSize * scale, frameSize * scale
    );
    
    ctx.restore();
  }
  
  getCurrentFrame(): number {
    return this.currentFrame;
  }
  
  getCurrentTag(): string {
    return this.currentTag;
  }
}

// Helper to get frame for jump animation based on velocity
export function getJumpFrame(
  verticalVelocity: number,
  threshold: number = 0.5
): 0 | 1 | 2 {
  if (verticalVelocity > threshold) return 0;  // ascending
  if (verticalVelocity < -threshold) return 2; // descending
  return 1; // peak/floating
}

// Gravity directions
export type Gravity = 'DOWN' | 'UP' | 'LEFT' | 'RIGHT';

export function getGravityAngle(gravity: Gravity): number {
  switch (gravity) {
    case 'DOWN': return 0;
    case 'LEFT': return 90;
    case 'UP': return 180;
    case 'RIGHT': return 270;
  }
}

export function getRelativeUp(gravity: Gravity): { x: number; y: number } {
  switch (gravity) {
    case 'DOWN': return { x: 0, y: -1 };
    case 'UP': return { x: 0, y: 1 };
    case 'LEFT': return { x: 1, y: 0 };
    case 'RIGHT': return { x: -1, y: 0 };
  }
}
