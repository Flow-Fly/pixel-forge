import { describe, expect, it, vi } from 'vitest';
import { SiteToolTransport, type SiteWebMcp } from '../../src/editor/site-tool-transport';
import { siteSuccess, siteToolInputSchemas } from '../../src/editor/site-tool-contract';

describe('site tool registration and lifecycle', () => {
  it('registers the supported async shape and rejects missing execution cancellation before dispatch', async () => {
    const invoke = vi.fn(async () => siteSuccess({}));
    const transport = new SiteToolTransport({ invoke });
    const tools: Parameters<SiteWebMcp['registerTool']>[0][] = [];
    const signals: AbortSignal[] = [];
    expect(
      await transport.register({
        registerTool: async (
          tool: Parameters<SiteWebMcp['registerTool']>[0],
          options: { signal: AbortSignal }
        ) => {
          tools.push(tool);
          signals.push(options.signal);
        },
      })
    ).toBe('registered');
    expect(tools.map((tool) => tool.name)).toEqual(
      Object.keys(siteToolInputSchemas).map((name) => `pixel_forge_${name}`)
    );
    expect(tools.find((tool) => tool.name === 'pixel_forge_propose')?.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: false,
      consequentialHint: true,
    });
    const discover = tools[0];
    expect(JSON.parse(await discover.execute({}))).toMatchObject({
      ok: false,
      error: { code: 'unsupported' },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(transport.fallback.availability()).toBe('unsupported');
    const invocation = new AbortController();
    await discover.execute({}, { signal: invocation.signal });
    expect(invoke).toHaveBeenCalledTimes(1);
    transport.unregister();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await discover.execute({}, { signal: invocation.signal });
    expect(invoke).toHaveBeenCalledTimes(2);
    transport.suspend();
    expect(JSON.parse(await discover.execute({}, { signal: invocation.signal }))).toMatchObject({
      ok: false,
      error: { code: 'capability_denied' },
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('reports absent, synchronous and failed host shapes explicitly while retaining the fallback', async () => {
    for (const candidate of [
      undefined,
      {},
      { registerTool: () => undefined },
      {
        registerTool: async () => {
          throw new Error('host internals');
        },
      },
    ]) {
      const invoke = vi.fn(async () => siteSuccess({}));
      const transport = new SiteToolTransport({ invoke });
      expect(await transport.register(candidate)).toBe(
        candidate === undefined ? 'unavailable' : 'unsupported'
      );
      await transport.fallback.invoke('status', {});
      expect(invoke).toHaveBeenCalledTimes(1);
      transport.dispose();
    }
  });
});
