# PixelForge Pattern Inventory

## Status

- [x] Documentation complete
- [ ] Pattern 1: Panels - consolidated
- [ ] Pattern 2: Modals/Dialogs - consolidated
- [ ] Pattern 3: Form Inputs - consolidated
- [ ] Pattern 4: Buttons - consolidated
- [ ] Pattern 5: Layout Utilities - consolidated
- [ ] Large file review

---

## Pattern 1: Panels

### Components Using This Pattern

| File | Lines | Notes |
|------|-------|-------|
| `src/components/layers/pf-layers-panel.ts` | 113 | Header + list + controls |
| `src/components/ui/pf-collapsible-panel.ts` | 107 | Generic collapsible wrapper |
| `src/components/brush/pf-brush-panel.ts` | 381 | Header + grid + actions |
| `src/components/color/pf-palette-panel.ts` | 1354 | Complex, needs splitting |
| `src/components/ui/pf-undo-history.ts` | - | Uses .header pattern |

### Shared CSS

```css
/* Header pattern - repeated in 10+ components */
.header {
  padding: 8px;
  border-bottom: 1px solid var(--pf-color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--pf-color-text-muted);
}

/* Content area */
.content, .layer-list, .brush-grid {
  flex: 1;
  overflow-y: auto;
}

/* Controls/actions footer */
.controls, .actions {
  padding: 8px;
  border-top: 1px solid var(--pf-color-border);
  display: flex;
  gap: 4px;
}
```

### Shared Behavior

- Header with title (and optional actions)
- Scrollable content area
- Optional footer with action buttons
- `pf-collapsible-panel` adds: collapse/expand with animation, panel state persistence

### Proposed: `<pf-panel>`

```typescript
@customElement('pf-panel')
export class PFPanel extends BaseComponent {
  @property() header = '';
  @property({ type: Boolean }) collapsible = false;
  @property({ type: Boolean, reflect: true }) collapsed = false;
  @property({ type: Boolean }) showFooter = false;

  // Slots: header-actions, default (content), footer
}
```

```html
<pf-panel header="Layers" collapsible>
  <span slot="header-actions">
    <button>+</button>
  </span>

  <!-- default slot: content -->
  <div class="layer-list">...</div>

  <div slot="footer">
    <button>Add</button>
    <button>Delete</button>
  </div>
</pf-panel>
```

### Migration Status

- [ ] Create `pf-panel` component
- [ ] Migrate `pf-layers-panel`
- [ ] Migrate `pf-brush-panel`
- [ ] Migrate `pf-undo-history`
- [ ] Evaluate: merge `pf-collapsible-panel` into `pf-panel`?

---

## Pattern 2: Modals/Dialogs

### Components Using This Pattern

| File | Lines | Notes |
|------|-------|-------|
| `src/components/dialogs/pf-resize-dialog.ts` | 146 | Basic dialog |
| `src/components/dialogs/pf-new-project-dialog.ts` | 250 | Dialog with presets |
| `src/components/dialogs/pf-export-dialog.ts` | 569 | Complex, many options |
| `src/components/brush/pf-brush-editor-overlay.ts` | - | Overlay pattern |
| `src/components/brush/pf-brush-create-overlay.ts` | - | Overlay pattern |
| `src/components/preview/pf-preview-overlay.ts` | - | Overlay pattern |
| `src/components/ui/pf-shortcuts-overlay.ts` | - | Overlay pattern |

### Shared CSS

```css
/* Host visibility pattern - two variations */

/* Variation A: Conditional render */
:host {
  display: block;
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Variation B: Attribute-based */
:host { display: none; }
:host([open]) {
  display: flex;
  position: fixed;
  /* ... same as above */
}

/* Dialog box */
.dialog {
  background-color: var(--pf-color-bg-panel);
  border: 1px solid var(--pf-color-border);
  border-radius: 4px;
  padding: 16px;
  width: 300px; /* varies */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

/* Header */
.header, h2 {
  font-weight: bold;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Content */
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Actions footer */
.actions, .buttons {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Button styles */
button.primary {
  background-color: var(--pf-color-primary);
  color: white;
  border: none;
}

button.secondary {
  background-color: transparent;
  border: 1px solid var(--pf-color-border);
  color: var(--pf-color-text-main);
}
```

### Shared Behavior

- `open` property (Boolean, reflected)
- `close()` method dispatching 'close' event
- Backdrop click to close (some dialogs)
- Escape key to close (not implemented consistently)
- Focus trap (not implemented)

### Proposed: `<pf-dialog>`

```typescript
@customElement('pf-dialog')
export class PFDialog extends BaseComponent {
  @property({ type: Boolean, reflect: true }) open = false;
  @property() width = '300px';
  @property({ type: Boolean }) closeOnBackdrop = true;
  @property({ type: Boolean }) closeOnEscape = true;

  // Slots: title, default (content), actions
  // Events: pf-close
}
```

```html
<pf-dialog open width="320px" @pf-close=${this.handleClose}>
  <span slot="title">Resize Canvas</span>

  <!-- default slot: content -->
  <div class="input-group">...</div>

  <div slot="actions">
    <button class="secondary" @click=${this.close}>Cancel</button>
    <button class="primary" @click=${this.apply}>Apply</button>
  </div>
</pf-dialog>
```

### Migration Status

- [ ] Create `pf-dialog` component
- [ ] Migrate `pf-resize-dialog`
- [ ] Migrate `pf-new-project-dialog`
- [ ] Migrate `pf-export-dialog`
- [ ] Evaluate overlay components for dialog migration

---

## Pattern 3: Form Inputs

### Components Using This Pattern

| File | Lines | Notes |
|------|-------|-------|
| `src/components/toolbar/options/pf-option-slider.ts` | 106 | Range input with label |
| `src/components/toolbar/options/pf-option-checkbox.ts` | 62 | Checkbox with label |
| `src/components/toolbar/options/pf-option-select.ts` | 80 | Select with label |

### Shared CSS

```css
:host {
  display: flex;
  align-items: center;
  gap: 4px;
}

label {
  color: var(--pf-color-text-muted);
  font-size: 12px;
  white-space: nowrap;
}
```

### Shared Behavior

- `label` property
- `store` and `storeKey` properties for state binding
- Uses `getOptionValue()` / `setOptionValue()` from store-accessor
- All extend `SignalWatcher(LitElement)` directly (not BaseComponent)

### Observations

These components are already well-factored. The main duplication is:
1. The `:host` flex layout CSS
2. The label styling
3. The store binding pattern

### Proposed: `<pf-form-field>` Wrapper (Optional)

Rather than extracting a base class, a wrapper component could handle layout:

```html
<pf-form-field label="Opacity">
  <input type="range" ... />
</pf-form-field>
```

**Alternative:** Keep as-is since duplication is minimal and components are already small.

### Migration Status

- [ ] Decide: extract `pf-form-field` or keep current structure
- [ ] If extracting: create wrapper component
- [ ] Migrate option components if wrapper is created

---

## Pattern 4: Buttons

### Components Using This Pattern

Button patterns appear in 15+ components:
- `src/components/toolbar/pf-tool-button.ts`
- `src/components/layers/pf-layers-panel.ts` (inline buttons)
- `src/components/brush/pf-brush-panel.ts` (.action-btn)
- All dialog components (.primary, .secondary buttons)
- Menu items, layer actions, etc.

### Shared CSS Patterns

```css
/* Icon button (toolbar) */
button {
  width: 32px; height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--pf-color-text-muted);
  cursor: pointer;
  transition: all 0.1s;
}

button:hover {
  background-color: var(--pf-color-bg-surface);
  color: var(--pf-color-text-main);
}

/* Active state */
:host([active]) button {
  border-color: var(--pf-color-accent);
  color: var(--pf-color-accent);
}

/* Action button (panels) */
.action-btn {
  flex: 1;
  padding: 4px 8px;
  font-size: 11px;
  background: var(--pf-color-bg-tertiary);
  border: 1px solid var(--pf-color-border);
  border-radius: 4px;
  color: var(--pf-color-text-primary);
  cursor: pointer;
}

.action-btn:hover:not(:disabled) {
  background: var(--pf-color-bg-hover);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Proposed: `<pf-icon-button>`

```typescript
@customElement('pf-icon-button')
export class PFIconButton extends BaseComponent {
  @property() icon = '';
  @property() label = '';
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property() size: 'sm' | 'md' = 'md';
}
```

```html
<pf-icon-button icon="plus" label="Add Layer" @click=${this.addLayer}></pf-icon-button>
```

### Migration Status

- [ ] Create `pf-icon-button` component
- [ ] Create shared button CSS utilities for text buttons
- [ ] Migrate toolbar buttons
- [ ] Migrate panel action buttons

---

## Pattern 5: Layout Utilities

### Common Patterns

These CSS patterns appear scattered across many components:

```css
/* Flex row with gap */
display: flex;
align-items: center;
gap: 4px; /* or 8px, 12px */

/* Flex column */
display: flex;
flex-direction: column;
gap: 12px;

/* Centered content */
display: flex;
align-items: center;
justify-content: center;

/* Border patterns */
border: 1px solid var(--pf-color-border);
border-bottom: 1px solid var(--pf-color-border);
border-top: 1px solid var(--pf-color-border);

/* Padding patterns */
padding: 8px;
padding: 8px 12px;
padding: 16px;
```

### Proposed: Shared CSS Utilities

Create an adoptable stylesheet with utility classes:

```css
/* src/styles/utilities.css */

/* Flex utilities */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }

/* Gap utilities */
.gap-1 { gap: var(--pf-spacing-1, 4px); }
.gap-2 { gap: var(--pf-spacing-2, 8px); }
.gap-3 { gap: var(--pf-spacing-3, 12px); }

/* Border utilities */
.border { border: 1px solid var(--pf-color-border); }
.border-b { border-bottom: 1px solid var(--pf-color-border); }
.border-t { border-top: 1px solid var(--pf-color-border); }
```

### Adoption Strategy

Since components use Shadow DOM, utilities must be imported as adoptable stylesheets:

```typescript
import { utilities } from '../styles/utilities.css';

static styles = [utilities, css`/* component-specific */`];
```

### Migration Status

- [ ] Create `src/styles/utilities.css` as adoptable stylesheet
- [ ] Document usage pattern for components
- [ ] Evaluate which components benefit most from utilities
- [ ] Gradual adoption (not blocking)

---

## Large File Review

### Files Requiring Attention

| File | Lines | Recommendation |
|------|-------|----------------|
| `src/components/color/pf-palette-panel.ts` | 1354 | Split: palette grid, palette actions, color editing |
| `src/components/timeline/pf-timeline-header.ts` | 1296 | Investigate composition |
| `src/components/dialogs/pf-export-dialog.ts` | 569 | Acceptable after dialog extraction |
| `src/components/brush/pf-brush-panel.ts` | 381 | Acceptable after panel extraction |

### Splitting Strategy

For `pf-palette-panel`:
- Extract palette grid as separate component
- Extract palette actions/toolbar
- Keep color editing in parent or extract to overlay

For `pf-timeline-header`:
- Analyze to identify logical sub-components
- May involve playback controls, frame navigation, etc.

---

## Out of Scope

These items are noted for future refactoring:

- **Utility/logic consolidation** - Math utils, canvas helpers, color conversion
- **Test suite creation** - Unit tests for stores, integration tests for tools
- **Store pattern improvements** - Possible consolidation of similar store patterns
