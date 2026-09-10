import { describe, expect, it } from 'vitest';
import {
  editorCatalog,
  transactionCatalog,
  ANIMATION_FRAME_COMMAND_ID,
} from '../../src/editor/catalog';
import {
  compatibleSiteVersion,
  siteToolInputSchemas,
  siteToolResultSchemas,
  validateSiteInput,
  siteFailure,
} from '../../src/editor/site-tool-contract';
import {
  siteCommandInputSchemas,
  siteTransactionSchema,
} from '../../src/editor/site-tool-command-schemas';
import { matchesSiteSchema } from '../../src/editor/site-tool-schema';

describe('public site contract', () => {
  it('derives every transaction profile and its command membership from the catalogue', () => {
    const commands = Object.values(transactionCatalog.profiles).flatMap((profile) =>
      'oneOfEach' in profile.children
        ? [...profile.children.oneOfEach]
        : [...profile.children.oneOf]
    );
    expect(Object.keys(siteCommandInputSchemas).sort()).toEqual([...new Set(commands)].sort());
    expect(siteTransactionSchema.oneOf).toHaveLength(
      Object.keys(transactionCatalog.profiles).length
    );
    for (const command of commands)
      expect(editorCatalog.commands.some((entry) => entry.id === command)).toBe(true);
    expect(
      matchesSiteSchema(
        {
          profile: 'animation',
          children: [
            {
              command: ANIMATION_FRAME_COMMAND_ID,
              input: { kind: 'frame.create', position: 'end', duration: 100 },
            },
          ],
        },
        siteTransactionSchema
      )
    ).toBe(true);
  });

  it('rejects unknown fields, unknown commands and oversized content before dispatch', () => {
    const request = {
      facadeVersion: '1.0',
      catalogVersion: '1.0',
      clientName: 'Client',
      purpose: 'Draw a flame',
      observationClasses: ['structure'],
      writeCategories: ['raster'],
      transactionLimit: 2,
      lifetimeSeconds: 60,
    };
    expect(validateSiteInput('request', request)).toBe(true);
    expect(validateSiteInput('request', { ...request, target: 'private-project' })).toBe(false);
    expect(validateSiteInput('request', { ...request, purpose: 'x'.repeat(513) })).toBe(false);
    expect(
      matchesSiteSchema(
        { profile: 'animation', children: [{ command: 'invented.command', input: {} }] },
        siteTransactionSchema
      )
    ).toBe(false);
    expect(
      matchesSiteSchema(
        {
          profile: 'animation',
          children: [
            {
              command: ANIMATION_FRAME_COMMAND_ID,
              input: { kind: 'frame.create', position: 'end', duration: 100, hidden: true },
            },
          ],
        },
        siteTransactionSchema
      )
    ).toBe(false);
  });

  it('fails closed on major incompatibility and omits versions outside the common range', () => {
    expect(compatibleSiteVersion('1.0', '1.0', '1.2')).toBe(true);
    expect(compatibleSiteVersion('1.0', '2.0', '2.1')).toBe(false);
    expect(compatibleSiteVersion('1.0', '1.1', '1.2')).toBe(false);
    expect(compatibleSiteVersion('1.0', 'bad', '1.2')).toBe(false);
  });

  it('publishes a bounded result schema for every input and refuses exception leakage', () => {
    expect(Object.keys(siteToolResultSchemas)).toEqual(Object.keys(siteToolInputSchemas));
    const refused = siteFailure('capability_denied', 'Review local consent.');
    for (const schema of Object.values(siteToolResultSchemas)) {
      expect(matchesSiteSchema(refused, schema)).toBe(true);
      expect(matchesSiteSchema({ ...refused, stack: 'private content' }, schema)).toBe(false);
    }
  });
});

describe('site binary wire representation', () => {
  it('preserves exact bytes and their digest inside bounded JSON', async () => {
    const { encodeSiteResult, siteDigest } = await import('../../src/editor/site-tool-wire');
    const pixels = new Uint8Array([0, 127, 128, 255]);
    const encoded = await encodeSiteResult({ pixels });
    const decoded = JSON.parse(new TextDecoder().decode(encoded));
    expect(decoded.pixels).toEqual({
      type: 'pf-bytes/1',
      encoding: 'base64',
      byteLength: 4,
      digest: await siteDigest(pixels),
      data: 'AH+A/w==',
    });
    await expect(encodeSiteResult({ value: Infinity })).rejects.toThrow('result_type');
  });
});

it('preserves the catalogue and runtime one-of-each requirement in the published schema', async () => {
  const palette = {
    command: 'project.palette.declaration',
    input: { kind: 'palette.declaration', entries: [{ id: 'ink', color: '#000000' }] },
  };
  const layers = {
    command: 'project.layer.tree',
    input: {
      kind: 'layer-tree.declaration',
      layers: [
        {
          id: 'art',
          name: 'Artwork',
          type: 'image',
          parentId: null,
          visible: true,
          locked: false,
          opacity: 255,
          blendMode: 'normal',
        },
      ],
    },
  };
  expect(transactionCatalog.profiles['static-structure'].children.oneOfEach).toEqual([
    palette.command,
    layers.command,
  ]);
  for (const children of [
    [palette, layers],
    [layers, palette],
  ])
    expect(
      matchesSiteSchema({ profile: 'static-structure', children }, siteTransactionSchema)
    ).toBe(true);
  expect(
    matchesSiteSchema(
      { profile: 'static-structure', children: [palette, palette] },
      siteTransactionSchema
    )
  ).toBe(false);
  const { createProjectContext } = await import('../../src/stores/project-context');
  const { createAutomationAdapter } = await import('../../src/editor/automation-adapter');
  const context = createProjectContext();
  const target = { projectId: context.project.id.value };
  const adapter = createAutomationAdapter({ targetRegistry: new Map([[target.projectId, context]]) });
  try {
    expect(adapter.negotiateCatalog({ version: editorCatalog.version }).ok).toBe(true);
    expect(
      await adapter.executeTransaction({
        profile: 'static-structure',
        target,
        expectedRevision: 0,
        provenance: {
          clientId: 'schema-test',
          sessionId: 'schema-session',
          runId: 'schema-run',
          operationId: 'schema-operation',
        },
        children: [palette, palette],
      })
    ).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
  } finally {
    context.dispose();
  }
});
