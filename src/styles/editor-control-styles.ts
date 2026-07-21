import { css } from 'lit';

export const checkboxStyles = css`
  input[type='checkbox'] {
    box-sizing: border-box;
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 auto;
    margin: 0;
    appearance: none;
    display: inline-grid;
    place-content: center;
    border: 1px solid var(--pf-color-border-strong);
    border-radius: var(--pf-radius-sm);
    background: var(--pf-color-bg-input);
    color: var(--pf-color-bg-dark);
    cursor: pointer;
  }

  input[type='checkbox']::before {
    content: '';
    inline-size: 3px;
    block-size: 3px;
    background: currentColor;
    box-shadow:
      3px 3px currentColor,
      6px 0 currentColor,
      9px -3px currentColor;
    opacity: 0;
    transform: translate(-4px, 1px);
  }

  input[type='checkbox']:checked {
    border-color: var(--pf-color-accent);
    background: var(--pf-color-accent);
  }

  input[type='checkbox']:checked::before {
    opacity: 1;
  }

  input[type='checkbox']:hover:not(:disabled) {
    border-color: var(--pf-color-accent-hover);
  }

  input[type='checkbox']:focus-visible {
    outline: 2px solid var(--pf-color-accent-hover);
    outline-offset: 2px;
  }

  input[type='checkbox']:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (forced-colors: active) {
    input[type='checkbox'] {
      appearance: auto;
      accent-color: auto;
    }

    input[type='checkbox']::before {
      display: none;
    }
  }
`;

export const rangeStyles = css`
  input[type='range'] {
    inline-size: 60px;
    block-size: 16px;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  input[type='range']::-webkit-slider-runnable-track {
    block-size: 6px;
    border: 1px solid var(--pf-color-border-strong);
    border-radius: var(--pf-radius-sm);
    background: var(--pf-color-bg-tertiary);
  }

  input[type='range']::-moz-range-track {
    block-size: 6px;
    border: 1px solid var(--pf-color-border-strong);
    border-radius: var(--pf-radius-sm);
    background: var(--pf-color-bg-tertiary);
  }

  input[type='range']::-webkit-slider-thumb {
    inline-size: 14px;
    block-size: 14px;
    margin-block-start: -5px;
    appearance: none;
    border: 1px solid var(--pf-color-accent-hover);
    border-radius: 0;
    background: var(--pf-color-accent);
  }

  input[type='range']::-moz-range-thumb {
    inline-size: 14px;
    block-size: 14px;
    border: 1px solid var(--pf-color-accent-hover);
    border-radius: 0;
    background: var(--pf-color-accent);
  }

  input[type='range']:hover:not(:disabled)::-webkit-slider-runnable-track {
    border-color: var(--pf-color-accent);
  }

  input[type='range']:hover:not(:disabled)::-moz-range-track {
    border-color: var(--pf-color-accent);
  }

  input[type='range']:hover:not(:disabled)::-webkit-slider-thumb {
    background: var(--pf-color-accent-hover);
  }

  input[type='range']:hover:not(:disabled)::-moz-range-thumb {
    background: var(--pf-color-accent-hover);
  }

  input[type='range']:focus-visible {
    outline: 2px solid var(--pf-color-accent-hover);
    outline-offset: 2px;
  }

  input[type='range']:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (forced-colors: active) {
    input[type='range'] {
      appearance: auto;
    }
  }
`;
