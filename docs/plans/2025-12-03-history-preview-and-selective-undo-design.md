# History Preview & Selective Undo

## Overview

Enhance the undo history panel to let users preview what each command changed and selectively undo specific actions without affecting subsequent work.

## Goals

- **See what changed**: Understand what pixels were added/modified/removed for any history item
- **Selective undo**: Remove a specific action's changes while preserving later work ("patch out")
- **Top-notch UX**: Interactions should feel easy and logical

## Hover Interaction

When user hovers a history item:

### Canvas Feedback
- Marching ants outline appears around the affected bounds region
- Animated dashed border (classic selection pattern)
- Rendered on a transparent overlay canvas, not the main drawing canvas
- Animation uses `requestAnimationFrame`, pauses when not hovering

### Tooltip
- Popover anchored to the left of the history item
- Uses HTML Popover API + CSS anchor positioning
- **Drawing commands**: Shows two small canvases side-by-side labeled "Before" and "After", cropped to affected bounds with padding
- **Non-drawing commands**: Shows descriptive text only (e.g., "Added Layer 2", "Flipped Layer 1 horizontally")
- 100ms debounce delay to avoid flickering on rapid mouse movement

## Click Interaction

When user clicks a history item:

### Expanded State
- Item expands in-place within the history panel
- Shows larger before/after diff (same content as hover, bigger for clarity)
- Two action buttons below the diff:
  - `[Revert to here]` - Traditional linear undo
  - `[Patch this out]` - Selective smart patch

### Behavior
- **Exclusive expansion**: Only one item expanded at a time. Clicking another collapses the first.
- **Marching ants persist**: Canvas highlight stays visible during expansion
- **Collapse triggers**: Re-click same item, click different item, press Escape, or click an action button

### Button Actions

**"Revert to here"**
- Traditional undo behavior
- Undoes all commands after this one
- Moves undone commands to redo stack

**"Patch this out"**
- Selective undo using smart patch algorithm
- Removes only this command's pixel changes
- Preserves subsequent work where possible
- Creates a new `PatchCommand` in history (so the patch itself can be undone)

### After Action
- Item collapses
- History list updates to reflect new state
- Marching ants fade out
- Clean reset

### Non-Drawing Commands
- Expand shows text description only
- "Patch this out" button is disabled (can't selectively patch layer operations)
- Only "Revert to here" is available

## Smart Patch Algorithm

### Goal
Remove a specific command's changes without affecting subsequent work.

### Steps

1. **Identify target command** - Get the command to patch at index `N`. Extract its `bounds`, `previousData`, and `newData`.

2. **Compute changed pixels** - Compare `previousData` vs `newData` pixel-by-pixel within bounds. Build a set of coordinates that actually changed.

3. **Build protection mask** - For each subsequent command (index `N+1` to end):
   - Check if its bounds overlap with target bounds (fast rejection)
   - If overlap exists, compare its `previousData` vs `newData` to find changed pixels
   - Mark overlapping changed pixels as "protected"

4. **Apply selective restore** - For each changed pixel in target command:
   - If pixel is protected → skip (preserve subsequent work)
   - If pixel is safe → restore from `previousData`

5. **Create patch command** - Wrap the operation in a new `PatchCommand` that stores:
   - Which pixels were actually restored
   - Their before/after values
   - Enables undoing the patch itself

### Performance Optimizations
- Bounds overlap check first (O(1)) before pixel comparison
- Skip commands with non-overlapping bounds entirely
- For small canvases (64x64), pixel iteration is negligible

## Edge Cases

### Empty Diff
If smart patch finds all pixels are protected (subsequent commands overwrote everything):
- Show message: "Changes were overwritten"
- Disable "Patch this out" button

### Command References Deleted Layer
If the layer no longer exists:
- Show text "Layer deleted" in tooltip
- Disable both action buttons

### Large Bounds, Tiny Change
- Tooltip crops to actual changed pixels, not full bounds
- Avoids showing mostly-empty before/after previews

### Rapid Hover
- 100ms debounce on tooltip appearance
- Prevents flickering when moving mouse through list

## Architecture

### Modified Files

**`src/components/ui/pf-undo-history.ts`**
- Add hover/click state management
- Render expanded state with diff + buttons
- Emit events for canvas overlay communication

### New Files

**`src/components/ui/pf-history-diff-tooltip.ts`**
- Popover component for hover tooltip
- Renders before/after canvas crops
- Uses CSS anchor positioning to attach to history items

**`src/components/canvas/pf-marching-ants-overlay.ts`**
- Transparent overlay canvas positioned over main canvas
- Draws animated marching ants for given bounds
- Subscribes to signal for current highlight region

**`src/stores/history-highlight.ts`**
- `highlightedCommand` signal - which command is hovered/expanded
- `highlightBounds` signal - bounds to show marching ants for
- Decouples history panel from canvas overlay

**`src/services/patch-service.ts`**
- `computeSafePixels(targetCommand, subsequentCommands)` - returns safe mask
- `applyPatch(targetCommand, safeMask)` - performs selective restore
- Pure functions, testable in isolation

**`src/commands/patch-command.ts`**
- Wraps a patch operation as undoable command
- Stores restored pixels for undo capability

## Data Flow

```
History Panel                    Canvas
     │                              │
     │ hover item                   │
     ├──────────────────────────────┤
     │                              │
     ▼                              │
history-highlight store             │
     │                              │
     │ highlightBounds signal       │
     ├──────────────────────────────►
     │                              │
     │                    marching-ants-overlay
     │                    renders outline
     │                              │
     ▼                              │
pf-history-diff-tooltip             │
renders before/after                │
```

## Future Considerations (Not in Scope)

- Accessibility (keyboard navigation, screen reader support, reduced motion)
- Batch patching (selecting multiple items to patch at once)
- Visual diff highlighting (showing exactly which pixels differ, not just the region)
