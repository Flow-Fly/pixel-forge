import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TransformReferenceLayerCommand,
  type ReferenceLayerTransform,
} from '../../src/commands/layer-commands';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';
import type { ReferenceLayerData } from '../../src/types/reference';

const contexts: ProjectContext[] = [];

function createContext() {
  const context = createProjectContext();
  contexts.push(context);
  return context;
}

function createReferenceData(
  transform: ReferenceLayerTransform = { x: 4, y: 8, scale: 2 }
): ReferenceLayerData {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png',
    ...transform,
    desaturate: true,
    position: 'above',
  };
}

function getReferenceData(context: ProjectContext, layerId: string) {
  return context.layers.layers.value.find((layer) => layer.id === layerId)?.referenceData;
}

describe('TransformReferenceLayerCommand', () => {
  beforeEach(() => {
    contexts.length = 0;
  });

  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.dispose();
    }
  });

  it('applies, undoes, and reapplies a reference transform', () => {
    const context = createContext();
    const oldTransform = { x: 4, y: 8, scale: 2 };
    const newTransform = { x: 12.5, y: 16.25, scale: 1.75 };
    const referenceData = createReferenceData(oldTransform);
    const layer = context.layers.addReferenceLayer(referenceData, 'Guide');
    context.dirtyRect.consumeFullRedraw();

    const command = new TransformReferenceLayerCommand(
      layer.id,
      oldTransform,
      newTransform,
      context
    );

    command.execute();

    expect(getReferenceData(context, layer.id)).toMatchObject({
      x: 12.5,
      y: 16.25,
      scale: 1.75,
      mimeType: 'image/png',
      desaturate: true,
      position: 'above',
    });
    expect(getReferenceData(context, layer.id)?.bytes).toBe(referenceData.bytes);
    expect(context.dirtyRect.consumeFullRedraw()).toBe(true);

    command.undo();

    expect(getReferenceData(context, layer.id)).toMatchObject(oldTransform);
    expect(context.dirtyRect.consumeFullRedraw()).toBe(true);

    command.execute();

    expect(getReferenceData(context, layer.id)).toMatchObject(newTransform);
    expect(context.dirtyRect.consumeFullRedraw()).toBe(true);
  });

  it('does nothing when the layer is missing', () => {
    const context = createContext();
    const originalLayers = context.layers.layers.value;
    context.dirtyRect.consumeFullRedraw();
    const command = new TransformReferenceLayerCommand(
      'missing-layer',
      { x: 0, y: 0, scale: 1 },
      { x: 10, y: 10, scale: 2 },
      context
    );

    command.execute();

    expect(context.layers.layers.value).toBe(originalLayers);
    expect(context.dirtyRect.consumeFullRedraw()).toBe(false);
  });

  it('does nothing for non-reference layers', () => {
    const context = createContext();
    const layer = context.layers.addLayer('Paint', 8, 8);
    context.dirtyRect.consumeFullRedraw();
    const command = new TransformReferenceLayerCommand(
      layer.id,
      { x: 0, y: 0, scale: 1 },
      { x: 10, y: 10, scale: 2 },
      context
    );

    command.execute();

    const updatedLayer = context.layers.layers.value.find((item) => item.id === layer.id);
    expect(updatedLayer?.referenceData).toBeUndefined();
    expect(context.dirtyRect.consumeFullRedraw()).toBe(false);
  });
});
