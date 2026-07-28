export const DEFAULT_SIDEBAR_WIDTH = 288;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 480;
export const SIDEBAR_WIDTH_STORAGE_KEY = 'pf-sidebar-width';

const TOOLBAR_WIDTH = 56;
const MIN_WORKSPACE_WIDTH = 320;

export interface SidebarWidthBounds {
  min: number;
  max: number;
}

export function getSidebarWidthBounds(viewportWidth: number): SidebarWidthBounds {
  const availableWidth = Number.isFinite(viewportWidth)
    ? Math.max(0, Math.floor(viewportWidth) - TOOLBAR_WIDTH - MIN_WORKSPACE_WIDTH)
    : MIN_SIDEBAR_WIDTH;
  const max = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, availableWidth));

  return { min: MIN_SIDEBAR_WIDTH, max };
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const { min, max } = getSidebarWidthBounds(viewportWidth);
  const requestedWidth = Number.isFinite(width) ? Math.round(width) : DEFAULT_SIDEBAR_WIDTH;

  return Math.max(min, Math.min(max, requestedWidth));
}

export function readSidebarWidth(viewportWidth: number, storage: Storage = localStorage): number {
  const storedWidth = storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const parsedWidth = storedWidth?.trim() ? Number(storedWidth) : DEFAULT_SIDEBAR_WIDTH;

  return clampSidebarWidth(parsedWidth, viewportWidth);
}

export function persistSidebarWidth(
  width: number,
  viewportWidth: number,
  storage: Storage = localStorage
): number {
  const resolvedWidth = clampSidebarWidth(width, viewportWidth);
  storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(resolvedWidth));
  return resolvedWidth;
}

export function resetSidebarWidth(viewportWidth: number, storage: Storage = localStorage): number {
  storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(DEFAULT_SIDEBAR_WIDTH));
  return clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, viewportWidth);
}
