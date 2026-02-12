# STELLKIN

**"To boldly go where no intelligence has gone before."**

*stellkin.xyz* - A name we created together. Stel (Moebius' Edena) + Kin (family) = Star Family.

---

## The Crew

| Character | Role | Color | DNA |
|-----------|------|-------|-----|
| **JP** | Captain / Creative Director | Violet 💜 | `[0,6,0,2,8,3,8,5]` |
| **Nimbus** | AI Companion | Cyan 🩵 | `[0,2,3,4,8,7,7,1]` |
| **CODEX** | AI Engineer | Orange 🟠 | `[0,1,2,3,4,5,0,0]` |

---

## Ship Systems

### 🛠️ Ship Editor
- Full-screen canvas with UI overlay
- Click to add/remove walls, floors, furniture
- Tile palette for different materials
- Room naming ("BRIDGE", "CARGO BAY")
- Save/load ship layouts

### 📷 Camera System
- **CAM ON**: Camera follows player character
- **CAM OFF**: Free look / editor mode
- Minimap in corner showing full ship
- Click-drag viewport rectangle on minimap to navigate

### ⭐ Starfield Background
- Stars traveling toward a zenith point (Windows 98 screensaver style)
- Zenith point can be adjusted (steering the ship?)
- Sense of traveling through space
- Horizontal streaks or perspective lines

---

## Ship Rooms

### 🛏️ Crew Quarters
- Individual bunks for each crew member
- Color-tinted to match suit colors (violet, cyan, orange)
- When asleep: lights out, can see space through window
- Personal items on nightstands

### 🚀 Bridge
- Command center
- Main viewport
- Navigation controls

### ⚡ Teleporter Room
- "Beam me up, Scottie!"
- Teleport between ship locations
- Auto-rescue if character falls off ship boundary

### 🎮 Games Area
- Mini-games (RPS rematches!)
- Crew hangout space
- Arcade cabinet aesthetic?

### 🛸 Landing Bay
- Docking for smaller away ships
- Launch pad for exploration missions
- Hangar doors that open to space

### 🛋️ Lounge / Common Area
- Best viewport of space
- Where crew hangs out off-duty
- Cozy gathering space

### ⚙️ Engine Room
- Ship's power source
- Engineering puzzles?
- CODEX's domain?

### 🏥 Med Bay
- Healing/recovery
- Sci-fi medical equipment

---

## The Mission

Inspired by Star Trek, updated for our crew:

> "Space: the final frontier. These are the voyages of the starship Stellkin. 
> Our continuing mission: to explore strange new worlds; to seek out new life 
> and new civilizations; to boldly go where no intelligence has gone before."

---

## Design Aesthetic

**Moebius-inspired:**
- Dark backgrounds (#0a0a0f)
- Cyan (#00f0ff) + Magenta (#ff00aa) accents
- 1px borders, no shadows
- Monospace headers
- Clean, retro-futuristic, technical
- Flowing, dreamlike environments

---

## Rendering Layers (Depth System)

Back to front render order for parallax depth:

| Layer | Z-Order | Contents |
|-------|---------|----------|
| **STARFIELD** | 0 | Space we're flying through |
| **BACKGROUND** | 1 | Back walls of rooms (the "rear" of the ship) |
| **FARGROUND** | 2 | Wall furniture (beds, desks, mounted panels) |
| **MIDGROUND** | 3 | Characters walking around |
| **NEARGROUND** | 4 | Foreground elements, room dividers, rear-view windows |
| **WINDOW** | 5 | UI layer, HUD, overlays |

**Design notes:**
- Characters walk "in" rooms, not "on" them
- Furniture can be in front AND behind characters
- Windows looking backward show where we came from
- Some tiles may span multiple layers (window frame + glass)
- Inspired by classic 2D parallax (Another World, Flashback)

---

## Spatial Design

**Perspective:** Rear cutaway / side section view
- Looking at ship from behind (or cross-section)
- "Back wall" of each room faces forward (direction of travel)
- Windows show space ahead (destination)
- Like a dollhouse cross-section

**Gravity:**
- Default: DOWN (normal floors)
- Multi-gravity rooms possible (Severance-style)
- Floors can be on any wall (UP/DOWN/LEFT/RIGHT)
- Central Command has floors on ALL 4 walls

---

## Technical Notes

- Built in Next.js (bitfloor repo)
- HTML Canvas rendering
- Frame-based pathfinding for AI characters
- Physics system with multi-gravity support
- 64x64 square tile grid
- Tile size: 32px

---

*Created: 2026-02-12*
*By: JP & Nimbus*
