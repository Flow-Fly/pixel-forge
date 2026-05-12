# Finished Tasks

This document archives completed work so `tasks.md` can stay focused on what is still planned.

---

## Pre-Launch Completed

### Must-Have

- [x] `[palette]` Palette management, create new palette from scratch, add popular palettes. They should be accessible via a searchable select / datalist / wharever has the best UX.
- [x] `[brush-preview]` Brush cursor preview should show custom brush shape (visible pixels)
- [x] `[ui-polish]` Warn user when no layer is selected (instead of silently blocking drawing)
- [x] `[ui-polish]` Accent color picker - Let users change UI accent color (View > Accent Color...)
- [x] `[ui-polish]` Unsaved changes warning - beforeunload prompt
- [x] `[auto-save]` Auto-select a layer when loading (currently no layer selected = confusing)
- [x] `[auto-save]` Auto-fit canvas to viewport when loading

### Menu Bar Polish

- [x] `[file-menu]` Unified Open - Single "Open" handles .pf, .json, .ase, .aseprite files
- [x] `[file-menu]` Remove redundant menu items - Consolidate "Save" with auto-save, remove "Import Aseprite" (merged into Open)
- [x] `[file-menu]` Group Export options - Combine "Export..." and "Export Aseprite..." into single export workflow
- [x] `[view-menu]` Fix Zoom menu items - Add click handlers for Zoom In/Out/100%
- [x] `[view-menu]` Add "Fit to Viewport" menu item - Shows "0" shortcut, calls `viewportStore.resetView()`
- [x] `[view-menu]` Create Grid Settings dialog - Pixel grid (color, opacity, auto-show), Tile grid (size, color, opacity)

### Bug Fixes

- [x] Shortcut preview window show wrong shortcuts / is unclear (multiple fixes):
  - [x] "Pencil": Shift + click: draw a line from previous point to clicked point
  - [x] "Pencil": Click then shift then drag: draw a line from initial click point to drag point
  - [x] "Pencil": Ctrl + Lclick: decrease color lightness
  - [x] "Pencil": Ctrl + Rclick: increase color lightness
  - [x] "Pencil": Alt + wheel: change brush size (changed from Ctrl+wheel to match industry standard)
  - [x] "Eraser": Work the same way as pencil overall except for lightness changes.
  - [x] "Eyedropper": Click: color to foreground, Rclick: color to background
  - [x] "Selection": Ctrl + drag: shrink selection to content
  - [x] "Selection": Add/subtract from selection (Shift+drag / Alt+drag) - implemented for marquee, lasso, polygonal-lasso, magic wand
  - [x] "Selection": Intersect selection mode (Shift+Alt+drag) - implemented for all selection tools
  - [x] "Polygonal Lasso": not Enter to close but dbl click / click on starting point to close (fixed in docs)
  - [x] "Magic Wand": Add/subtract from selection working
  - [x] Rectangle/ellipse tool: Shift + drag: constrain to square/circle, Ctrl + drag: draw from center (fixed shortcut display)
- [x] Hand does not pan when clicking on empty space (outside canvas) - FIXED
- [x] When selecting a Cel in the timeline, it get a border-color. If then select a Frame, the Cel of the same layer will get the border-color too, without removing the one from the previous cell. - FIXED (clear cel selection on frame click)
- [x] Palette selection window is overflowing on the right side of the screen. - FIXED (improved popover positioning)
- [x] Toggling filled state does not reflect in the context-bar (And it does not fill the shape anyway) - FIXED (unified shape stores)
- [x] Untracked colors should be collapsible in the palette panel. - FIXED (added collapse toggle)
- [x] Layers in the layer panel should use the same component as the one in the timeline (for consistency) - FIXED (unified pf-timeline-layers with inline opacity scrubbing, text layer badge, and all timeline features: rename on dblclick, visibility/lock toggles, drag to reorder, hover preview, duplicate/delete via context menu)
- [x] Warning toast notification affected by canvas zoom level - FIXED (moved toast to app level, outside viewport transform context)

### Keyboard Shortcuts

- [x] "H": Hand tool pans on canvas AND empty space (like spacebar)
- [x] "Z": Zoom tool works (click = zoom in, Alt+click or right-click = zoom out)
- [x] "[/]": Decrease/Increase brush size / thickness
- [x] "0-6": Zoom levels (0 = fit to window, 1-6 = 100%-3200%)
- [x] "Mod + 0-9": Brush opacity (Mod+1 = 10%, Mod+0 = 100%)
- [x] "F": Toggle shape fill mode (when shape tool active) OR fill selection with foreground color
- [x] Tab: Toggle timeline visibility
- [x] "Mod + A": Select all
- [x] "Delete/Backspace": Delete selection
- [x] "Mod + Z": Undo
- [x] "Mod + Shift + Z": Redo
- [x] "Mod + D": Deselect
- [x] SHIFT + drag: Add to selection (works - marching ants now show previous selection during drag)
- [x] Alt + drag: Remove from selection (quick eyedropper disabled for selection tools)
- [x] Tab: When timeline hidden, show layers in right panel
- [x] "Mod + C/V/X": Clipboard operations (copy, cut, paste)
- [x] "Ctrl + Shift + I": Invert selection (uses Ctrl instead of Mod to avoid Mac system shortcut conflict)
- [x] "V": Transform tool - works on selections (hidden from toolbar, shortcut works)
- [x] "C": Canvas Resize - opens resize dialog
- [x] "Mod + Shift + D": Reselect (restore last cleared selection)
- [x] "Ctrl + Shift + T": Select Cel bounds (non-transparent content) - uses Ctrl to avoid browser conflicts
- [x] "Shift + Alt + drag": Intersect selection (all selection tools)
- [x] "Mod + G": Group layers - creates a group from active layer
- [x] "Mod + Shift + G": Ungroup layers - ungroups active group or parent group
- [x] "Alt + N": New Frame (Mod+N conflicts with browser)
- [x] "Mod + O": Open file (unified - handles .pf, .json, .ase, .aseprite)
- [x] "Mod + E": Export dialog
- [x] Continuous layer setting

---

## Post-Launch Completed

- [x] Keyboard shortcuts modal - Show all shortcuts with `?` key

---

## Medium Priority Completed

### High Demand

- [x] `[reference]` Reference image overlay system (separate from layers)
  - Can extend beyond canvas bounds for positioning
  - Semi-transparent (never 100% opacity)
  - Movable, resizable, rotatable overlay
  - Opens when importing png/gif/jpg via Open dialog
  - Independent panel/controls for reference management

### Selection & Transform

- [x] `[transform]` Auto-select layer content on tool switch - When activating transform tool, automatically select all non-transparent pixels on active layer
- [x] `[selection-ux]` Add Flip H/V buttons to selection context bar - Show flip horizontal/vertical buttons alongside "Shrink to Content" and "Deselect"
- [x] Selection size info - Show dimensions near cursor

### Drawing Tools

- [x] Shape fill color option - FG/BG toggle for filled shapes (rectangle, ellipse)
- [x] Center-draw mode - Ctrl modifier for rect/ellipse
- [x] `[` / `]` shortcuts - Decrease/Increase brush size

---

## Known Issues Resolved

- [x] Cel linking needs refinement - Basic linking implemented but needs testing

---

## Recently Completed

### Selection & Rotation

- [x] CleanEdge rotation performance optimization (30-100x faster)
  - Uint32 packed pixels (eliminates 18.8M allocations)
  - Draft quality (2x) during drag, final (4x) on commit
  - rAF throttling for smooth live preview
  - Smart edge priority: darker colors win (outlines preserved)
- [x] Resize/rotate selection with CleanEdge algorithm
- [x] Selection shrink to content (Ctrl+drag or context bar button)
- [x] Rotation and moving of selection (arrow keys)
- [x] Complete Selection System - Marquee, Lasso, Magic Wand
- [x] Selection UX improvements - Path preview, commit-then-select

### Timeline & Animation

- [x] Timeline scroll sync & previews
- [x] Tag system redesign - Collapsible, column tinting, range editing
- [x] Cel selection - Shift+click multi-select
- [x] Tags for grouping frames
- [x] Frame speed display in FPS
- [x] Better layer reordering (drag)
- [x] Scrollbars for long animations

### Color & Palette

- [x] Indexed color mode - Full implementation
- [x] Palette panel improvements - Simplified UI, "+" popover, Extract from Drawing
- [x] Smart shade generation with hue shifting
- [x] Color selector compact - Click FG/BG to change

### Tools & UI

- [x] Opacity selector for layers and cels
- [x] Ruler with guide lines for mirror drawing
- [x] Text tool - Bitmap/pixel font rendering
- [x] Auto-save to IndexedDB
- [x] New Project dialog
- [x] Brush cursor preview
- [x] Brush Spacing & Big Pixel Mode
- [x] Aseprite-compatible shortcuts
- [x] Quick eyedropper (Alt/Cmd+Click)
- [x] Trackpad gesture improvements

### Custom Brush System (Dec 2024)

- [x] Custom brush capture from selection (Ctrl+B)
- [x] Brush panel redesign - Grid view with Add/Edit/Delete
- [x] Brush editor popover - Zoomed canvas with draw/erase
- [x] Global brush storage - IndexedDB persistence across projects
- [x] Spacing option moved to pencil context bar
- [x] Custom brush stamping - Uses foreground color with brush alpha as mask
- [x] Max brush size: 64x64 default, up to 256x256
- [x] Brush cursor preview shows custom brush shape (visible pixels)

### Additional Bug Fixes

- [x] All context bar slider issues
- [x] All tool settings bugs (line, rect, ellipse thickness/fill)
- [x] Pencil shift-drag/shift-click issues
- [x] Line tool angle snapping
- [x] Cursor leaving canvas commits changes
- [x] Large brush delayed draw
- [x] Import Aseprite bug
- [x] Animated WebP export
- [x] Trackpad zoom easing

### Keyboard Shortcuts (Dec 2024)

- [x] Hand tool (H) - pans on canvas AND outside canvas
- [x] Zoom tool (Z) - click to zoom in, Alt+click or right-click to zoom out
- [x] Tab - toggle timeline, show layers panel in sidebar when hidden
- [x] 0-6 keys - zoom levels (fit to window, 100%-3200%)
- [x] Mod+0-9 - brush opacity (10%-100%)
- [x] [/] keys - decrease/increase brush size
- [x] F key - fill selection with foreground color
- [x] Alt+drag - subtract from selection (quick eyedropper disabled for selection tools)
- [x] Shift+drag - add to selection with visual feedback (previous selection marching ants shown)
- [x] Mod+C/V/X - clipboard operations (copy, cut, paste)
- [x] Ctrl+Shift+I - invert selection (uses Ctrl to avoid Mac system shortcut conflict)
- [x] V - transform tool (works on selections)
- [x] C - canvas resize dialog
- [x] Mod+Shift+D - reselect (restore last cleared selection)
- [x] Ctrl+Shift+T - select cel bounds (non-transparent content)
- [x] Shift+Alt+drag - intersect selection mode
- [x] Mod+G - group layers
- [x] Mod+Shift+G - ungroup layers
- [x] Alt+N - new frame
