import { afterEach, describe, expect, it } from 'vitest';

import { DuplicateLayerCommand, FlipLayerCommand } from '../../src/commands/layer-commands';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';
import type { Cel } from '../../src/types/animation';
import type { ReferenceLayerData } from '../../src/types/reference';

const contexts: ProjectContext[] = [];

function createContext() {
  const context = createProjectContext();
  contexts.push(context);
  return context;
}

function referenceData(overrides: Partial<ReferenceLayerData> = {}): ReferenceLayerData {
  return {
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 4,
    y: 8,
    scale: 2,
    desaturate: true,
    position: 'above',
    ...overrides,
  };
}

function layerIds(context: ProjectContext): string[] {
  return context.layers.layers.value.map((layer) => layer.id);
}

function addRogueReferenceCel(
  context: ProjectContext,
  layerId: string,
  frameId: string
): string {
  const key = context.animation.getCelKey(layerId, frameId);
  const cels = new Map(context.animation.cels.value);
  const cel: Cel = {
    id: 'rogue-reference-cel',
    layerId,
    frameId,
    canvas: document.createElement('canvas'),
    indexBuffer: Uint8Array.from([1, 2, 0]),
  };

  cels.set(key, cel);
  context.animation.cels.value = cels;
  return key;
}

describe('layer commands', () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.dispose();
    }
  });

  it('duplicates reference layers by cloning reference metadata without creating a canvas', () => {
    const context = createContext();
    const sourceData = referenceData();
    const source = context.layers.addReferenceLayer(sourceData, 'Guide');
    context.layers.updateLayer(source.id, {
      locked: true,
      opacity: 96,
      continuous: true,
    });

    const duplicate = context.layers.duplicateLayer(source.id);

    expect(duplicate).toMatchObject({
      name: 'Guide Copy',
      type: 'reference',
      visible: true,
      locked: false,
      opacity: 96,
      continuous: true,
    });
    expect(duplicate?.canvas).toBeUndefined();
    expect(duplicate?.referenceData).toEqual(sourceData);
    expect(duplicate?.referenceData).not.toBe(sourceData);
    expect(duplicate?.referenceData?.bytes).not.toBe(sourceData.bytes);

    duplicate!.referenceData!.bytes[0] = 9;

    expect(source.referenceData?.bytes[0]).toBe(1);
    expect(context.layers.activeLayerId.value).toBe(duplicate?.id);
    expect(layerIds(context)).toContain(duplicate!.id);
  });

  it('does not create duplicated cels for reference layers', () => {
    const context = createContext();
    const source = context.layers.addReferenceLayer(referenceData(), 'Guide');
    const frameId = context.animation.currentFrameId.value;
    const rogueKey = addRogueReferenceCel(context, source.id, frameId);
    const command = new DuplicateLayerCommand(source.id, context);

    command.execute();

    const duplicate = context.layers.layers.value.find(
      (layer) => layer.id !== source.id && layer.name === 'Guide Copy'
    );
    expect(duplicate?.type).toBe('reference');

    const duplicateKey = context.animation.getCelKey(duplicate!.id, frameId);
    expect(context.animation.cels.value.has(duplicateKey)).toBe(false);
    expect(context.animation.cels.value.get(rogueKey)?.id).toBe('rogue-reference-cel');

    command.undo();

    expect(layerIds(context)).not.toContain(duplicate!.id);
    expect(context.animation.cels.value.has(rogueKey)).toBe(true);
  });

  it('keeps image layer duplication cel-backed and undoable', () => {
    const context = createContext();
    const source = context.layers.layers.value[0];
    const frameId = context.animation.currentFrameId.value;
    const command = new DuplicateLayerCommand(source.id, context);

    command.execute();

    const duplicate = context.layers.layers.value.find(
      (layer) => layer.id !== source.id && layer.name === `${source.name} Copy`
    );
    expect(duplicate?.type).toBe('image');

    const duplicateKey = context.animation.getCelKey(duplicate!.id, frameId);
    expect(context.animation.cels.value.has(duplicateKey)).toBe(true);

    command.undo();

    expect(layerIds(context)).not.toContain(duplicate!.id);
    expect(context.animation.cels.value.has(duplicateKey)).toBe(false);
  });

  it('keeps a layer transform on the frame captured by the command', () => {
    const context = createContext();
    const layer = context.layers.layers.value[0];
    const firstFrameId = context.animation.currentFrameId.value;
    context.animation.addFrame(false);
    const secondFrameId = context.animation.currentFrameId.value;
    const firstKey = context.animation.getCelKey(layer.id, firstFrameId);
    const secondKey = context.animation.getCelKey(layer.id, secondFrameId);
    const sharedCanvas = context.animation.cels.value.get(firstKey)?.canvas;

    context.animation.goToFrame(firstFrameId);
    const command = new FlipLayerCommand(layer.id, 'horizontal', context);
    context.animation.goToFrame(secondFrameId);

    command.execute();
    command.undo();

    expect(context.animation.cels.value.get(firstKey)?.canvas).not.toBe(sharedCanvas);
    expect(context.animation.cels.value.get(secondKey)?.canvas).toBe(sharedCanvas);
  });
});
