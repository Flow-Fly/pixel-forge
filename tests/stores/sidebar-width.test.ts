import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  getSidebarWidthBounds,
  persistSidebarWidth,
  readSidebarWidth,
  resetSidebarWidth,
} from '../../src/stores/sidebar-width';

describe('sidebar width state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the default width when no preference exists', () => {
    expect(readSidebarWidth(1280)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('clamps requested widths to the configured bounds', () => {
    expect(clampSidebarWidth(100, 1280)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(900, 1280)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('reserves usable workspace width in a narrow viewport', () => {
    const bounds = getSidebarWidthBounds(700);

    expect(bounds).toEqual({ min: MIN_SIDEBAR_WIDTH, max: 324 });
    expect(clampSidebarWidth(400, 700)).toBe(324);
  });

  it('disables resizing when the viewport can only fit the minimum', () => {
    expect(getSidebarWidthBounds(600)).toEqual({
      min: MIN_SIDEBAR_WIDTH,
      max: MIN_SIDEBAR_WIDTH,
    });
  });

  it('falls back from invalid storage and clamps stale values', () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, 'not-a-width');
    expect(readSidebarWidth(1280)).toBe(DEFAULT_SIDEBAR_WIDTH);

    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '900');
    expect(readSidebarWidth(1280)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('persists the resolved width', () => {
    expect(persistSidebarWidth(360, 1280)).toBe(360);
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('360');
    expect(readSidebarWidth(1280)).toBe(360);
  });

  it('resets the stored preference to the 288px default', () => {
    persistSidebarWidth(420, 1280);

    expect(resetSidebarWidth(1280)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(DEFAULT_SIDEBAR_WIDTH));
  });

  it('preserves a stored preference while resolving it for a narrow viewport', () => {
    persistSidebarWidth(420, 1280);

    expect(readSidebarWidth(700)).toBe(324);
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('420');
    expect(readSidebarWidth(1280)).toBe(420);
  });
});
