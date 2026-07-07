import { describe, it, expect } from 'vitest';
import {
  floodFillSelect,
  combineMasks,
  traceMaskOutline,
  connectSegments,
  isPointInMask,
  type MaskSelectionState,
} from '../../src/utils/mask-utils';
import type { Rect } from '../../src/types/geometry';

/** Build an ImageData-like object from a grid of hex colors (0xRRGGBBAA). */
function imageDataFrom(grid: number[][]): ImageData {
  const height = grid.length;
  const width = grid[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = grid[y][x];
      const pos = (y * width + x) * 4;
      data[pos] = (px >>> 24) & 0xff;
      data[pos + 1] = (px >>> 16) & 0xff;
      data[pos + 2] = (px >>> 8) & 0xff;
      data[pos + 3] = px & 0xff;
    }
  }
  return { width, height, data } as ImageData;
}

/** Build a freeform mask from a string grid ('#' = selected). */
function maskFrom(rows: string[]): { mask: Uint8Array; bounds: Rect } {
  const height = rows.length;
  const width = rows[0].length;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] === '#') mask[y * width + x] = 255;
    }
  }
  return { mask, bounds: { x: 0, y: 0, width, height } };
}

/** Render a mask back to a string grid for readable assertions. */
function maskToRows(mask: Uint8Array, bounds: Rect): string[] {
  const rows: string[] = [];
  for (let y = 0; y < bounds.height; y++) {
    let row = '';
    for (let x = 0; x < bounds.width; x++) {
      row += mask[y * bounds.width + x] === 255 ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
}

const RED = 0xff0000ff;
const BLUE = 0x0000ffff;

describe('floodFillSelect', () => {
  it('selects a contiguous region of matching pixels', () => {
    const img = imageDataFrom([
      [RED, RED, BLUE],
      [RED, BLUE, BLUE],
      [BLUE, BLUE, RED],
    ]);
    const result = floodFillSelect(img, 0, 0, { tolerance: 0, contiguous: true });
    expect(result).not.toBeNull();
    expect(result!.bounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(maskToRows(result!.mask, result!.bounds)).toEqual(['##', '#.']);
  });

  it('does not include the disconnected matching pixel when contiguous', () => {
    const img = imageDataFrom([
      [RED, BLUE],
      [BLUE, RED],
    ]);
    const result = floodFillSelect(img, 0, 0, { tolerance: 0, contiguous: true });
    expect(result!.bounds).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('selects all matching pixels when not contiguous', () => {
    const img = imageDataFrom([
      [RED, BLUE],
      [BLUE, RED],
    ]);
    const result = floodFillSelect(img, 0, 0, { tolerance: 0, contiguous: false });
    expect(result!.bounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(maskToRows(result!.mask, result!.bounds)).toEqual(['#.', '.#']);
  });

  it('connects through diagonals only with the diagonal option', () => {
    const img = imageDataFrom([
      [RED, BLUE],
      [BLUE, RED],
    ]);
    const without = floodFillSelect(img, 0, 0, { tolerance: 0, contiguous: true });
    expect(without!.bounds.width).toBe(1);

    const withDiag = floodFillSelect(img, 0, 0, {
      tolerance: 0,
      contiguous: true,
      diagonal: true,
    });
    expect(withDiag!.bounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(maskToRows(withDiag!.mask, withDiag!.bounds)).toEqual(['#.', '.#']);
  });

  it('includes near colors within tolerance', () => {
    const nearRed = 0xfa0000ff; // distance 5 from RED
    const img = imageDataFrom([[RED, nearRed, BLUE]]);
    const exact = floodFillSelect(img, 0, 0, { tolerance: 0, contiguous: true });
    expect(exact!.bounds.width).toBe(1);

    const tolerant = floodFillSelect(img, 0, 0, { tolerance: 10, contiguous: true });
    expect(tolerant!.bounds.width).toBe(2);
  });

  it('returns null for an out-of-bounds start point', () => {
    const img = imageDataFrom([[RED]]);
    expect(floodFillSelect(img, -1, 0, { tolerance: 0, contiguous: true })).toBeNull();
    expect(floodFillSelect(img, 0, 1, { tolerance: 0, contiguous: true })).toBeNull();
  });
});

describe('combineMasks', () => {
  const freeformState = (rows: string[]): MaskSelectionState => {
    const { mask, bounds } = maskFrom(rows);
    return { bounds, shape: 'freeform', mask };
  };

  it('returns the new mask unchanged for replace', () => {
    const current = freeformState(['#']);
    const { mask, bounds } = maskFrom(['##']);
    const result = combineMasks(current, bounds, mask, 'replace');
    expect(result).toEqual({ mask, bounds });
  });

  it('adds two disjoint regions with union bounds', () => {
    const current = freeformState(['#..', '...', '...']);
    const add = maskFrom(['...', '...', '..#']);
    const result = combineMasks(current, add.bounds, add.mask, 'add');
    expect(result!.bounds).toEqual({ x: 0, y: 0, width: 3, height: 3 });
    expect(maskToRows(result!.mask, result!.bounds)).toEqual(['#..', '...', '..#']);
  });

  it('subtracts an overlapping region and trims bounds', () => {
    const current = freeformState(['###', '###', '###']);
    const sub = maskFrom(['.##', '.##', '.##']);
    const result = combineMasks(current, sub.bounds, sub.mask, 'subtract');
    expect(result!.bounds).toEqual({ x: 0, y: 0, width: 1, height: 3 });
    expect(maskToRows(result!.mask, result!.bounds)).toEqual(['#', '#', '#']);
  });

  it('returns null when subtraction removes everything', () => {
    const current = freeformState(['##']);
    const sub = maskFrom(['##']);
    expect(combineMasks(current, sub.bounds, sub.mask, 'subtract')).toBeNull();
  });

  it('intersects overlapping regions with tight bounds', () => {
    const current = freeformState(['##.', '##.', '...']);
    const inter = maskFrom(['...', '.##', '.##']);
    const result = combineMasks(current, inter.bounds, inter.mask, 'intersect');
    expect(result!.bounds).toEqual({ x: 1, y: 1, width: 1, height: 1 });
    expect(maskToRows(result!.mask, result!.bounds)).toEqual(['#']);
  });

  it('returns null when intersecting disjoint bounds', () => {
    const current: MaskSelectionState = {
      bounds: { x: 0, y: 0, width: 2, height: 2 },
      shape: 'rectangle',
    };
    const next = maskFrom(['##']);
    const away: Rect = { x: 10, y: 10, width: 2, height: 1 };
    expect(combineMasks(current, away, next.mask, 'intersect')).toBeNull();
  });

  it('treats a rectangle-shaped current state as fully selected', () => {
    const current: MaskSelectionState = {
      bounds: { x: 0, y: 0, width: 2, height: 1 },
      shape: 'rectangle',
    };
    const add = maskFrom(['..#']);
    const result = combineMasks(current, add.bounds, add.mask, 'add');
    expect(result!.bounds).toEqual({ x: 0, y: 0, width: 3, height: 1 });
    expect(maskToRows(result!.mask, result!.bounds)).toEqual(['###']);
  });

  it('treats an ellipse-shaped current state by ellipse membership', () => {
    // 4x4 ellipse: corners are outside the inscribed ellipse
    const current: MaskSelectionState = {
      bounds: { x: 0, y: 0, width: 4, height: 4 },
      shape: 'ellipse',
    };
    const all = maskFrom(['####', '####', '####', '####']);
    const result = combineMasks(current, all.bounds, all.mask, 'intersect');
    expect(result).not.toBeNull();
    const rows = maskToRows(result!.mask, result!.bounds);
    // Center pixels are inside the ellipse; the exact corner cells are not
    expect(result!.bounds.width).toBeLessThanOrEqual(4);
    expect(rows.join('')).toContain('#');
  });
});

describe('traceMaskOutline + connectSegments', () => {
  it('outlines a single pixel as one closed path around it', () => {
    const { mask, bounds } = maskFrom(['#']);
    const segments = traceMaskOutline(mask, bounds);
    expect(segments).toHaveLength(4);

    const paths = connectSegments(segments);
    expect(paths).toHaveLength(1);
    const corners = new Set(paths[0].map((p) => `${p.x},${p.y}`));
    expect(corners).toContain('0,0');
    expect(corners).toContain('1,0');
    expect(corners).toContain('0,1');
    expect(corners).toContain('1,1');
  });

  it('produces no segments for an empty mask', () => {
    const { mask, bounds } = maskFrom(['.']);
    expect(traceMaskOutline(mask, bounds)).toHaveLength(0);
    expect(connectSegments([])).toEqual([]);
  });

  it('outlines only the boundary of a solid block', () => {
    const { mask, bounds } = maskFrom(['##', '##']);
    const segments = traceMaskOutline(mask, bounds);
    // Perimeter of a 2x2 block: 8 unit segments, no interior edges
    expect(segments).toHaveLength(8);
  });
});

describe('isPointInMask', () => {
  it('respects mask contents and bounds offset', () => {
    const { mask } = maskFrom(['#.', '.#']);
    const bounds: Rect = { x: 10, y: 20, width: 2, height: 2 };
    expect(isPointInMask(10, 20, mask, bounds)).toBe(true);
    expect(isPointInMask(11, 20, mask, bounds)).toBe(false);
    expect(isPointInMask(11, 21, mask, bounds)).toBe(true);
    expect(isPointInMask(9, 20, mask, bounds)).toBe(false);
    expect(isPointInMask(12, 22, mask, bounds)).toBe(false);
  });
});
