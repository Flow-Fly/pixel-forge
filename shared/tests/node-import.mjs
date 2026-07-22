import assert from 'node:assert/strict';
import { PROJECT_VERSION, decodeProjectFile, parseProductEvent } from '@pixel-forge/shared';

const project = decodeProjectFile({
  version: PROJECT_VERSION,
  name: 'Node ESM smoke',
  width: 1,
  height: 1,
  layers: [
    {
      id: 'layer-1',
      name: 'Layer 1',
      type: 'image',
      visible: true,
      opacity: 255,
      data: { 0: 1 },
    },
  ],
  frames: [
    {
      id: 'frame-1',
      duration: 100,
      cels: [{ layerId: 'layer-1', data: {} }],
    },
  ],
  animation: { fps: 12, currentFrameIndex: 0 },
});

assert.equal(project.version, '4.1.0');
assert.deepEqual(project.layers[0].data, Uint8Array.from([1]));
assert.deepEqual(
  parseProductEvent({ name: 'playback_started', dimensions: {} }),
  { name: 'playback_started', dimensions: {} }
);
