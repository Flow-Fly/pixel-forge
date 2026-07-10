import { describe, expect, it } from 'vitest';

import {
  CRT_PARAM_CONTROLS,
  CRT_PRESETS,
  CRT_PRESET_OPTIONS,
  getCrtParams,
  getCrtPresetId,
} from '../../../src/services/view-effects';

describe('CRT view effect', () => {
  it('keeps every preset component in the supported intensity range', () => {
    for (const { id } of CRT_PRESET_OPTIONS) {
      for (const { key } of CRT_PARAM_CONTROLS) {
        expect(CRT_PRESETS[id][key]).toBeGreaterThanOrEqual(0);
        expect(CRT_PRESETS[id][key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('recognizes presets and custom settings', () => {
    expect(getCrtPresetId(getCrtParams(CRT_PRESETS.arcade))).toBe('arcade');
    expect(
      getCrtPresetId(
        getCrtParams({
          ...CRT_PRESETS.arcade,
          bloom: 0.73,
        })
      )
    ).toBe('custom');
    expect(
      getCrtPresetId(
        getCrtParams({
          ...CRT_PRESETS.arcade,
          maskStyle: CRT_PRESETS.subtle.maskStyle,
        })
      )
    ).toBe('custom');
  });

  it('clamps stored params and fills missing values from the subtle preset', () => {
    expect(
      getCrtParams({
        scanlines: 2,
        mask: -1,
      })
    ).toEqual({
      ...CRT_PRESETS.subtle,
      scanlines: 1,
      mask: 0,
    });
  });

  it('keeps the preset-only mask style on a supported integer', () => {
    expect(getCrtParams({ maskStyle: 1.4 }).maskStyle).toBe(1);
    expect(getCrtParams({ maskStyle: 12 }).maskStyle).toBe(2);
    expect(getCrtParams({ maskStyle: -4 }).maskStyle).toBe(0);
  });

  it('upgrades the previously shipped presets to their stronger profiles', () => {
    expect(
      getCrtParams({
        scanlines: 0.22,
        mask: 0.16,
        curvature: 0.08,
        bloom: 0.14,
        vignette: 0.18,
      })
    ).toEqual(CRT_PRESETS.subtle);
  });
});
