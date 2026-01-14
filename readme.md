# PixelForge

A professional pixel art editor that runs entirely in your browser. No installation, no signup — just open and create.

![PixelForge Editor](docs/images/hero-screenshot.png)

Whether you're a seasoned pixel artist or just getting started, PixelForge gives you the tools you need: a powerful palette system, smooth animation workflow, full Aseprite compatibility, and custom brushes — all with buttery-smooth performance.

**[Try PixelForge Now →](https://pixel-forge.app)**

---

## Why PixelForge?

- **Works Anywhere** — Runs in your browser on any desktop or laptop. No installation needed.
- **Feels Familiar** — If you've used Aseprite, you'll feel right at home. Same shortcuts, same workflow.
- **Actually Fast** — Optimized rendering keeps everything smooth, even on complex animations.
- **Free & Open Source** — No subscription, no watermarks, no limits.

---

## The Vision

PixelForge is growing into an all-in-one pixel art studio — perfect for game jams where jumping between apps kills your flow.

**Coming soon:**
- 📱 **Mobile support** — Create on the go with touch-friendly controls
- 🗺️ **Tilemaps & Tilesets** — Design levels and worlds, not just sprites
- 👥 **Real-time collaboration** — Work together with your team, live

---

## 🎨 Color & Palette System

![Palette System](docs/images/palette-system.gif)

PixelForge's color system is designed to keep you in your creative flow.

### Smart Shade Generation
Select any color and instantly get 7 lightness variations — with intelligent hue shifting that makes shadows cooler and highlights warmer, just like traditional art.

![Lightness Variations](docs/images/lightness-bar.png)

### Palettes That Work With You
- **Tracked & Untracked Colors** — Your main palette stays clean while auto-generated shades live separately until you decide to keep them
- **Built-in Presets** — Start with classic palettes like DB32, or create your own
- **Smart Organization** — Colors with similar hues automatically group together
- **Usage Indicators** — See at a glance which colors are actually used in your artwork

### Never Lose a Color
Switch palettes freely — any colors used in your drawing are automatically preserved, so you never accidentally destroy your work.

---

## 🎬 Animation Workflow

![Animation Timeline](docs/images/animation-timeline.gif)

Creating animations should feel playful, not tedious. PixelForge's timeline is built for speed.

### Frame Tags
Organize your animations into named sections — idle, walk, attack — each with its own color. Collapse tags you're not working on to stay focused, and hover over collapsed tags to preview their animation instantly.

![Frame Tags](docs/images/frame-tags.png)

### Linked Cels
Duplicate a frame and the cels stay linked — edit one, and they all update. Perfect for reusing backgrounds or base poses. Need to break free? Just draw, and the link breaks automatically.

### Onion Skinning
See ghost frames before and after your current position. Adjust how many frames to show and their opacity to get the perfect reference while you animate.

![Onion Skinning](docs/images/onion-skinning.gif)

### Preview Window
A floating preview shows your animation playing in real-time while you work. Drag it anywhere, resize it, swap backgrounds — always know exactly how your animation looks.

---

## 🔄 Aseprite Compatibility

![Aseprite Import/Export](docs/images/aseprite-compat.png)

Already have an Aseprite workflow? Keep it.

### Import & Export .ase Files
Open your existing Aseprite projects directly in PixelForge. Layers, frames, tags, palettes — it all comes through. When you're done, export back to .ase and continue in Aseprite if you want.

### Familiar Shortcuts
`B` for brush, `E` for eraser, `G` for fill, `I` for eyedropper — your muscle memory works here. Most Aseprite shortcuts are already mapped, so you can jump in without relearning anything.

### Multiple Export Formats
- **Aseprite (.ase)** — Full project exchange with Aseprite
- **PNG** — Single frames or full sequences
- **WebP** — Static or animated
- **Spritesheet** — Grid-packed with metadata for your game engine
- **PixelForge (.pf)** — Native format with full project data

---

## 🖌️ Custom Brushes

![Brush System](docs/images/brush-system.gif)

Go beyond the single pixel. Create brushes that match your style.

### Create From Your Art
Draw something on the canvas, select it, and turn it into a brush. Your brush keeps the original colors, or use it as a stamp with your current color — your choice.

### Full Control
- **Size & Opacity** — Adjust on the fly
- **Spacing** — Control the gap between stamps for dotted lines or seamless strokes
- **Pixel-Perfect Mode** — Eliminates the ugly L-shaped corners when drawing diagonal lines

### Save & Reuse
Your custom brushes are saved automatically and ready whenever you come back.

---

## ✨ More Features

### Drawing Tools
| Tool | Shortcut | |
|------|----------|---|
| Pencil | `B` | Draw with pixel-perfect precision |
| Eraser | `E` | Erase to transparency or background |
| Fill | `G` | Flood fill with contiguous or global mode |
| Line | `L` | Straight lines, hold Shift for angle snapping |
| Rectangle | `U` | Rectangles and squares |
| Ellipse | `Shift+U` | Ellipses and circles |
| Gradient | `Shift+G` | Smooth gradients between colors |

### Selection Tools
| Tool | Shortcut | |
|------|----------|---|
| Marquee | `M` | Rectangular selection |
| Lasso | `Q` | Freehand selection |
| Polygonal Lasso | `Shift+Q` | Point-to-point selection |
| Magic Wand | `W` | Select by color |

Hold `Shift` to add, `Alt` to subtract, or both to intersect.

### Layers
- Visibility, opacity, and lock controls
- Blend modes: Normal, Multiply, Screen, Overlay, and more
- Layer groups for organization
- Continuous layers that auto-link across frames

### Transform
- Move, rotate, and scale selections
- **CleanEdge rotation** — A custom algorithm that keeps your pixel art crisp when rotating, no muddy edges

### Canvas
- Zoom up to 3200% with pixel grid overlay
- Tile grid for spritesheet alignment
- Hand tool and Space+drag for panning

---

## 🚀 Getting Started

1. **Open the app** — Head to [pixel-forge.app](https://pixel-forge.app)
2. **Create or import** — Start fresh or drop in an existing `.ase` or `.png` file
3. **Start drawing** — Press `B` for the brush and go

That's it. No account needed, no setup required.

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo / Redo | `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` |
| Swap colors | `X` |
| Zoom to fit | `Cmd/Ctrl+0` |
| Previous / Next frame | `[` / `]` |
| Play / Pause | `Space` (timeline focused) |

---

## For Developers

PixelForge is open source and contributions are welcome!

Built with [Lit](https://lit.dev/), TypeScript, and Vite. Check out the [Contributing Guide](CONTRIBUTING.md) to get started with the codebase.

---

<p align="center">
  Made with ♥ for pixel artists everywhere
</p>
