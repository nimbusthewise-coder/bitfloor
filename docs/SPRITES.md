# Bitfloor Sprite Reference

## Face Sheet (32×32)

File: `/public/sprites/face-32.png`  
Dimensions: 320×288 (10 variants × 9 rows at 32px)

### Layer Order (top to bottom compositing)

| Row | Layer    | Notes |
|-----|----------|-------|
| 0   | blank    | Base/background |
| 1   | head     | Face shape |
| 2   | eyes     | Eyes and brows |
| 3   | mouth    | Mouth expressions |
| 4   | nose     | Nose variants |
| 5   | hair     | Hair styles |
| 6   | glasses  | Eyewear 🤓 |
| 7   | ears     | Ear variants |
| 8   | composite| Sample faces (reference only) |

### DNA Format

`[base, head, eyes, mouth, nose, hair, glasses, ears]`

Each value 0-9 selects column (variant) from that row.

**Note:** DNA matches row order exactly. Same between 64×64 and 32×32 sheets.

### Known DNA

| Name   | Role              | DNA                      |
|--------|-------------------|--------------------------|
| JP     | Creative Director | `[0, 6, 0, 2, 8, 3, 8, 5]` |
| Nimbus | Worldbuilder      | `[0, 2, 3, 4, 8, 7, 7, 1]` |

**Note:** DNA may need remapping from 64×64 sheet order to 32×32 sheet order.

---

## Grid System

- Tile size: 10×10px
- Character head: 32×32 (fits in ~3 tiles)
- Character body: ~30px (3 tiles)
- Floor height: 12 tiles (120px) including:
  - Ceiling space: 5 tiles (50px)
  - Head zone: 3 tiles (30px)  
  - Body: 3 tiles (30px)
  - Floor/joists: 1 tile (10px)

---

## Reference Mockup

See: `docs/reference-mockup-v1.jpg`

Shows:
- Side-view characters
- Window UI chrome (title bars, borders)
- Menu bar with clock
- Character profile card with stats
- Team chat with avatars
- Terminal window
- Action buttons
