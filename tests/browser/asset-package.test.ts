import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';
import type { AssetPackageArtifact } from '../../src/editor/automation-adapter';

const sessions: FixtureSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  vi.restoreAllMocks();
});

describe('Creative Asset Package Chromium evidence', () => {
  it('prepares static source, preview, and manifest without browser side effects', async () => {
    const objectUrl = vi.spyOn(URL, 'createObjectURL');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runAssetPackage();
    // The fixture's source round-trip intentionally exercises the normal load
    // boundary, which decodes persisted image bytes through object URLs. Clear
    // that evidence before checking the package operation and PNG decoder.
    objectUrl.mockClear();
    anchorClick.mockClear();

    expect(journey.exact).toEqual({
      staticArtifacts: true,
      manifest: true,
      deterministic: true,
      source: true,
      render: true,
    });
    expect(journey.assetPackage.artifacts.map((artifact) => artifact.role))
      .toEqual(['source', 'preview', 'manifest']);
    expect(journey.assetPackage.manifest.spriteSheet).toBeUndefined();
    expect(objectUrl).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();

    const preview = requiredArtifact(journey.assetPackage.artifacts, 'preview');
    const previewPixels = await decodePng(preview, 4, 4);
    expect(Array.from(previewPixels)).toEqual(Array.from(journey.roundTrip.renderPixels));
  });

  it('decodes animated sprite cells and matches every canonical frame', async () => {
    const objectUrl = vi.spyOn(URL, 'createObjectURL');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const session = createFixtureSession({ projectId: 'animated-package-fixture' });
    sessions.push(session);
    const journey = await session.runAnimatedAssetPackage();
    objectUrl.mockClear();
    anchorClick.mockClear();

    expect(journey.exact).toEqual({
      sprite: true,
      cells: true,
      timing: true,
      deterministic: true,
      referenceExcluded: true,
    });
    expect(objectUrl).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();

    const sprite = requiredArtifact(journey.assetPackage.artifacts, 'sprite-sheet');
    const sheet = journey.assetPackage.manifest.spriteSheet;
    if (!sheet) throw new Error('Animated package did not include sprite metadata.');
    const spritePixels = await decodePng(sprite, sheet.width, sheet.height);
    for (const cell of sheet.cells) {
      const expected = journey.canonicalRenders[cell.index];
      if (!expected) throw new Error(`Missing canonical render ${cell.index}.`);
      expect(Array.from(crop(spritePixels, sheet.width, cell.x, cell.y, cell.width, cell.height)))
        .toEqual(Array.from(expected));
    }
    expect(journey.assetPackage.manifest.frames.map((frame) => frame.duration))
      .toEqual([100, 180, 260]);
  });

  it('rejects stale revisions, source mutation during an await, and oversized bounds', async () => {
    const session = createFixtureSession({ projectId: 'asset-package-failure-fixture' });
    sessions.push(session);
    const journey = await session.runAssetPackage();
    const request = {
      operation: 'project.asset-package.prepare',
      target: session.target,
      expectedRevision: journey.save.revision,
      expectedSaveSafety: journey.save.saveSafety,
    };

    const stale = await session.adapter.request({
      ...request,
      expectedRevision: journey.save.revision + 1,
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'revision_conflict', retryable: true } });

    const projectStore = session.projectContext.project;
    const originalSaveProject = projectStore.saveProject.bind(projectStore);
    projectStore.saveProject = async () => {
      const saved = await originalSaveProject({ rebuildIndexBuffers: false });
      projectStore.name.value = 'Changed during package preparation';
      return saved;
    };
    try {
      const mutated = await session.adapter.request(request);
      expect(mutated).toMatchObject({
        ok: false,
        error: { code: 'revision_conflict', details: { reason: 'source_changed' } },
      });
    } finally {
      projectStore.saveProject = originalSaveProject;
    }

    projectStore.name.value = 'Fixture Project';
    projectStore.setSize(65, 4);
    const oversized = await session.adapter.request(request);
    expect(oversized).toMatchObject({
      ok: false,
      error: { code: 'bounds_exceeded', details: { reason: 'canvas_dimensions' } },
    });
  });
});

function requiredArtifact(
  artifacts: readonly AssetPackageArtifact[],
  role: AssetPackageArtifact['role'],
): AssetPackageArtifact {
  const artifact = artifacts.find((candidate) => candidate.role === role);
  if (!artifact) throw new Error(`Missing ${role} artifact.`);
  return artifact;
}

async function decodePng(
  artifact: AssetPackageArtifact,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([artifact.bytes], { type: artifact.mediaType }));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) throw new Error('Chromium did not provide a decoding canvas.');
  drawing.imageSmoothingEnabled = false;
  drawing.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Uint8Array(drawing.getImageData(0, 0, width, height).data);
}

function crop(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  cropWidth: number,
  cropHeight: number,
): Uint8Array {
  const result = new Uint8Array(cropWidth * cropHeight * 4);
  for (let row = 0; row < cropHeight; row++) {
    const sourceStart = ((y + row) * width + x) * 4;
    result.set(pixels.subarray(sourceStart, sourceStart + cropWidth * 4), row * cropWidth * 4);
  }
  return result;
}
