import { css } from "lit";

/**
 * Shared layout utility classes for PixelForge components.
 *
 * Usage:
 * ```typescript
 * import { layoutUtilities } from '../styles/utilities';
 *
 * static styles = [layoutUtilities, css`
 *   // component-specific styles
 * `];
 * ```
 *
 * Then in templates:
 * ```html
 * <div class="flex items-center gap-2">...</div>
 * ```
 */
export const layoutUtilities = css`
  /* Flex utilities */
  .flex {
    display: flex;
  }
  .flex-col {
    display: flex;
    flex-direction: column;
  }
  .flex-1 {
    flex: 1;
  }
  .flex-wrap {
    flex-wrap: wrap;
  }

  /* Alignment */
  .items-center {
    align-items: center;
  }
  .items-start {
    align-items: flex-start;
  }
  .items-end {
    align-items: flex-end;
  }
  .justify-center {
    justify-content: center;
  }
  .justify-between {
    justify-content: space-between;
  }
  .justify-end {
    justify-content: flex-end;
  }

  /* Gap utilities (using design tokens) */
  .gap-1 {
    gap: var(--pf-spacing-1, 4px);
  }
  .gap-2 {
    gap: var(--pf-spacing-2, 8px);
  }
  .gap-3 {
    gap: var(--pf-spacing-3, 12px);
  }
  .gap-4 {
    gap: var(--pf-spacing-4, 16px);
  }

  /* Padding utilities */
  .p-1 {
    padding: var(--pf-spacing-1, 4px);
  }
  .p-2 {
    padding: var(--pf-spacing-2, 8px);
  }
  .p-3 {
    padding: var(--pf-spacing-3, 12px);
  }
  .p-4 {
    padding: var(--pf-spacing-4, 16px);
  }
  .px-2 {
    padding-left: var(--pf-spacing-2, 8px);
    padding-right: var(--pf-spacing-2, 8px);
  }
  .py-2 {
    padding-top: var(--pf-spacing-2, 8px);
    padding-bottom: var(--pf-spacing-2, 8px);
  }

  /* Border utilities */
  .border {
    border: 1px solid var(--pf-color-border);
  }
  .border-t {
    border-top: 1px solid var(--pf-color-border);
  }
  .border-b {
    border-bottom: 1px solid var(--pf-color-border);
  }
  .border-l {
    border-left: 1px solid var(--pf-color-border);
  }
  .border-r {
    border-right: 1px solid var(--pf-color-border);
  }
  .rounded {
    border-radius: var(--pf-radius-sm, 4px);
  }
  .rounded-md {
    border-radius: var(--pf-radius-md, 6px);
  }

  /* Text utilities */
  .text-muted {
    color: var(--pf-color-text-muted);
  }
  .text-primary {
    color: var(--pf-color-text-main);
  }
  .text-xs {
    font-size: var(--pf-font-size-xs, 10px);
  }
  .text-sm {
    font-size: var(--pf-font-size-sm, 12px);
  }
  .text-center {
    text-align: center;
  }
  .whitespace-nowrap {
    white-space: nowrap;
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Overflow */
  .overflow-auto {
    overflow: auto;
  }
  .overflow-hidden {
    overflow: hidden;
  }
  .overflow-y-auto {
    overflow-y: auto;
  }

  /* Sizing */
  .w-full {
    width: 100%;
  }
  .h-full {
    height: 100%;
  }
  .min-w-0 {
    min-width: 0;
  }

  /* Visibility & display */
  .hidden {
    display: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Cursor */
  .cursor-pointer {
    cursor: pointer;
  }
  .cursor-not-allowed {
    cursor: not-allowed;
  }

  /* User select */
  .select-none {
    user-select: none;
  }
`;
