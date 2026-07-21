import { css } from 'lit';

/**
 * Native scrollbar treatment for scroll containers inside Lit shadow roots.
 * The axis rail stays visible when the operating system hides an overlay thumb.
 */
export const scrollbarStyles = css`
  [data-scrollbar] {
    scrollbar-color: var(--pf-color-scrollbar-thumb) var(--pf-color-scrollbar-track);
    scrollbar-width: thin;
    box-shadow:
      var(--pf-scrollbar-surface-shadow, 0 0 transparent),
      var(--pf-scrollbar-rail-shadow, 0 0 transparent);
  }

  [data-scrollbar='horizontal'] {
    --pf-scrollbar-rail-shadow: inset 0 -2px 0 var(--pf-color-scrollbar-thumb);
  }

  [data-scrollbar='vertical'] {
    --pf-scrollbar-rail-shadow: inset -2px 0 0 var(--pf-color-scrollbar-thumb);
    scrollbar-gutter: stable;
  }

  [data-scrollbar='both'] {
    --pf-scrollbar-rail-shadow:
      inset -2px 0 0 var(--pf-color-scrollbar-thumb), inset 0 -2px 0 var(--pf-color-scrollbar-thumb);
    scrollbar-gutter: stable;
  }

  [data-scrollbar]::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  [data-scrollbar]::-webkit-scrollbar-track {
    background: var(--pf-color-scrollbar-track);
  }

  [data-scrollbar]::-webkit-scrollbar-thumb {
    background: var(--pf-color-scrollbar-thumb);
    border: 1px solid var(--pf-color-scrollbar-track);
  }

  [data-scrollbar]::-webkit-scrollbar-thumb:hover {
    background: var(--pf-color-scrollbar-thumb-hover);
  }

  [data-scrollbar]::-webkit-scrollbar-corner {
    background: var(--pf-color-scrollbar-track);
  }

  @media (forced-colors: active) {
    [data-scrollbar] {
      scrollbar-color: auto;
      --pf-scrollbar-rail-shadow: 0 0 transparent;
    }
  }
`;
