# Bitfloor Aesthetic Guide

## Core Principles

**1-bit, but alive.**

Everything is black and white, but depth, warmth, and personality come through in the details.

---

## The Palette

```
Background:  #000000 (pure black)
Foreground:  #FFFFFF (pure white)
```

That's it. No grays, no colors. Depth comes from technique, not palette.

---

## Depth Technique: Layered Offset

Create the illusion of 3D without leaving 1-bit:

- **Base layer** = darkest (appears as shadow)
- **Stack layers** offset 2px up, 2px right
- **Each layer lighter** (more white pixels)

Result: Material depth, light appears to come from top-left.

```
Example (window):
┌─────────┐  ← top layer (white border)
│ content │
└─────────┘
 ↖ base layer offset 2px down/left creates shadow
```

Use for: windows, buttons, panels, furniture, any UI element that needs to "lift" off the background.

---

## Typography

**Primary:** Pixel/bitmap font (Chicago-style or similar)
- Sharp edges, no anti-aliasing
- Readable at small sizes
- Monospace for data/code, proportional for UI text

**Inspiration:** Susan Kare's work for original Macintosh

---

## The World Layer (Office/Town View)

**Style:** Detailed 1-bit pixel art with dithering

**Character proportions:**
- Tiny and chunky (~8-12px tall)
- Big heads relative to bodies
- Simple faces (dot eyes, expressive)
- Personality despite small scale

**Environment:**
- Dense with detail (desks, monitors, plants, papers, coffee cups)
- Dithering for texture (brick, carpet, shadows)
- Same layered depth technique
- Scale contrast: tiny characters in detailed world = feels BIG and alive

**Reference:** Game Dev Story meets classic Mac

---

## The Desktop Layer (OS/Mini-Apps)

**Style:** Classic Macintosh OS (1984)

**Window chrome:**
- 1px white border
- Title bar with close box (left)
- Draggable
- Content area with padding

**Elements:**
- Buttons with layered depth effect
- Checkboxes, radio buttons (classic Mac style)
- Scrollbars (if needed)
- Icons: 16×16 or 32×32, pure 1-bit

**Inspiration:** Susan Kare icons, original Mac dialogs

---

## The Form Layer (Data Entry/Terminals)

**Style:** Minitel/Teletext grid ASCII

**Characteristics:**
- Grid-aligned everything
- Dotted lines for form fields: `...............`
- Block graphics for decorative elements
- Monospace font throughout
- Function key bar at bottom

```
NOM: ............................
ROLE: ...........................
STATUS: [ ] Active  [ ] Away

[Suite]  [Retour]  [Envoi]
```

**Use for:** Identity creation, settings, message composition

---

## The Data Layer (HUD/Analytics)

**Style:** Vector minimalism, naval radar aesthetic

**Characteristics:**
- Clean vector lines (not pixel art)
- Information-dense but readable
- Contemporary monospace type
- Functional, professional, "tools" energy

**Use for:** System status, analytics dashboards, monitoring, terminal output

---

## Mixing Modes

The power is in the contrast:

| Context | Style | Feeling |
|---------|-------|---------|
| Walking the office | Pixel world | Warm, playful |
| Chatting with colleague | Mac windows | Friendly, personal |
| Editing your profile | Minitel forms | Focused, intentional |
| Checking system status | Vector HUD | Cool, professional |

Transitions between modes should feel natural — clicking deeper into the world changes the visual register.

---

## Sound (Future)

When we add audio:
- Chunky, 1-bit aesthetic implies lo-fi sound
- Chiptune influences (8-bit)
- Subtle UI sounds (clicks, beeps)
- Could use ElevenLabs for voice, but process to sound "transmitted" or "through a speaker"

---

## Key References

1. **Original Macintosh OS** — Susan Kare's icons and fonts
2. **Game Dev Story** — Tiny characters, detailed management sim
3. **Minitel** — French teletext terminals, grid ASCII forms
4. **Naval radar displays** — Vector HUD, information density
5. **1-bit pixel art with layered depth** — The offset shadow technique

---

## The Vibe in One Sentence

**"A living 1-bit world where tiny characters work in a detailed office, accessed through a warm retro OS, with the depth of a professional tool underneath."**

---

*This document is a living guide. Update as the aesthetic evolves.*
