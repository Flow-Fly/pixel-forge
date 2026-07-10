import { describe, expect, it } from 'vitest';
import { createGuidedDrawingStore } from '../../src/stores/guided-drawing-store';

function createSession() {
  return {
    version: 1 as const,
    width: 2,
    height: 1,
    target: new Uint8Array([1, 2]),
    settings: {
      longSide: 2,
      paletteSource: 'restricted' as const,
      restrictedPalette: ['#000000', '#ffffff'],
      mapping: 'luminance' as const,
      simplifyIsolatedPixels: true,
    },
    sourceName: 'source.png',
    createdAt: 123,
  };
}

describe('GuidedDrawingStore', () => {
  it('owns and clones runtime session data', () => {
    const store = createGuidedDrawingStore();
    const session = createSession();

    store.start(session);
    session.target[0] = 9;
    session.settings.restrictedPalette[0] = '#ff00ff';

    expect(store.session.value?.target).toEqual(new Uint8Array([1, 2]));
    expect(store.session.value?.settings.restrictedPalette).toEqual([
      '#000000',
      '#ffffff',
    ]);
  });

  it('converts typed targets to serializable file data', () => {
    const store = createGuidedDrawingStore();
    store.start(createSession());

    expect(store.toFile()).toEqual({
      ...createSession(),
      target: [1, 2],
    });
  });

  it('loads, clears, and rejects mismatched targets', () => {
    const store = createGuidedDrawingStore();
    const file = { ...createSession(), target: [1, 2] };

    store.load(file);
    expect(store.active).toBe(true);
    store.clear();
    expect(store.active).toBe(false);
    store.load(undefined);
    expect(store.active).toBe(false);

    expect(() => store.start({ ...createSession(), target: new Uint8Array([1]) }))
      .toThrow('target does not match');
  });

  it('keeps temporary view choices out of the durable session', () => {
    const store = createGuidedDrawingStore();
    store.start(createSession());

    store.toggleNumbers();
    store.toggleTargetPreview();
    expect(store.numbersVisible.value).toBe(false);
    expect(store.targetPreviewVisible.value).toBe(true);
    expect(store.toFile()).not.toHaveProperty('numbersVisible');

    store.load({ ...createSession(), target: [1, 2] });
    expect(store.numbersVisible.value).toBe(true);
    expect(store.targetPreviewVisible.value).toBe(false);

    store.toggleNumbers();
    store.toggleTargetPreview();
    store.clear();
    expect(store.numbersVisible.value).toBe(true);
    expect(store.targetPreviewVisible.value).toBe(false);
  });

  it('omits guidance only while an explicit finish is being saved', () => {
    const store = createGuidedDrawingStore();
    store.start(createSession());

    store.beginFinish();
    expect(store.active).toBe(true);
    expect(store.toFile()).toBeUndefined();

    store.cancelFinish();
    expect(store.toFile()?.target).toEqual([1, 2]);

    store.beginFinish();
    store.completeFinish();
    expect(store.active).toBe(false);
    expect(store.finishPending.value).toBe(false);
  });
});
