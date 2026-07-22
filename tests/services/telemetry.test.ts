import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/browser';
import {
  createDevelopmentTelemetrySink,
  createHttpTelemetrySink,
  createOncePerPageTelemetryClient,
  createTelemetryClient,
  type ProductEvent,
} from '../../src/services/telemetry';

vi.mock('@sentry/browser', () => ({
  addBreadcrumb: vi.fn(),
}));

const projectCreated: ProductEvent = {
  name: 'project_created',
  dimensions: { source: 'blank' },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('client telemetry', () => {
  it('keeps the production default inert', () => {
    const fetchRequest = vi.fn();
    const sendBeacon = vi.fn();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const indexedDbWrite = vi.spyOn(indexedDB, 'open');
    const initialCookies = document.cookie;
    vi.stubGlobal('fetch', fetchRequest);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    const telemetry = createTelemetryClient();
    telemetry.record(projectCreated);

    expect(fetchRequest).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(indexedDbWrite).not.toHaveBeenCalled();
    expect(document.cookie).toBe(initialCookies);
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('retains deterministic, immutable development evidence', () => {
    const inspector = createDevelopmentTelemetrySink();
    const telemetry = createTelemetryClient(inspector);
    const mutableInput: {
      name: 'project_created';
      dimensions: { source: 'blank' | 'import' };
    } = {
      name: 'project_created',
      dimensions: { source: 'blank' },
    };

    telemetry.record(mutableInput as ProductEvent);
    mutableInput.dimensions.source = 'import';

    expect(inspector.events()).toEqual([projectCreated]);
    expect(Object.isFrozen(inspector.events()[0])).toBe(true);
    expect(Object.isFrozen(inspector.events()[0]?.dimensions)).toBe(true);

    inspector.clear();
    expect(inspector.events()).toEqual([]);
  });

  it('keeps only the latest bounded development evidence', () => {
    const inspector = createDevelopmentTelemetrySink();
    const telemetry = createTelemetryClient(inspector);

    for (let index = 0; index < 101; index += 1) {
      telemetry.record({
        name: 'project_opened',
        dimensions: { source: index === 100 ? 'file' : 'library' },
      });
    }

    expect(inspector.events()).toHaveLength(100);
    expect(inspector.events().at(-1)).toEqual({
      name: 'project_opened',
      dimensions: { source: 'file' },
    });
  });

  it('does not forward rejected payloads to a sink', () => {
    const record = vi.fn();
    const telemetry = createTelemetryClient({ record });

    telemetry.record({
      name: 'project_created',
      dimensions: { source: 'blank', filename: 'portrait.pf' },
    } as ProductEvent);

    expect(record).not.toHaveBeenCalled();
  });

  it('contains validation failures from hostile runtime objects', () => {
    const record = vi.fn();
    const telemetry = createTelemetryClient({ record });
    const hostileEvent = new Proxy(projectCreated, {
      ownKeys: () => {
        throw new Error('blocked property access');
      },
    });

    expect(() => telemetry.record(hostileEvent)).not.toThrow();
    expect(record).not.toHaveBeenCalled();
  });

  it('does not throw into product actions when a sink throws', () => {
    const telemetry = createTelemetryClient({
      record: () => {
        throw new Error('sink unavailable');
      },
    });

    expect(() => telemetry.record(projectCreated)).not.toThrow();
  });

  it('handles asynchronous sink rejection without blocking the caller', async () => {
    const telemetry = createTelemetryClient({
      record: async () => {
        throw new Error('sink unavailable');
      },
    });

    expect(() => telemetry.record(projectCreated)).not.toThrow();
    await Promise.resolve();
  });

  it('delivers the exact revalidated event to the same-origin endpoint', async () => {
    const fetchRequest = vi.fn(async () => new Response(null, { status: 202 }));
    const telemetry = createTelemetryClient(createHttpTelemetrySink({
      fetch: fetchRequest,
      timeoutMs: 500,
    }));

    telemetry.record(projectCreated);
    await vi.waitFor(() => expect(fetchRequest).toHaveBeenCalledOnce());

    expect(fetchRequest).toHaveBeenCalledWith('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectCreated),
      credentials: 'omit',
      keepalive: true,
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('revalidates before HTTP dispatch', async () => {
    const fetchRequest = vi.fn();
    const sink = createHttpTelemetrySink({ fetch: fetchRequest });

    await sink.record({
      name: 'project_created',
      dimensions: { source: 'blank', filename: 'private.pf' },
    } as ProductEvent);

    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it('emits each milestone name at most once per page lifecycle', () => {
    const record = vi.fn();
    const telemetry = createOncePerPageTelemetryClient({ record });

    telemetry.record(projectCreated);
    telemetry.record({ name: 'project_created', dimensions: { source: 'import' } });
    telemetry.record({ name: 'playback_started', dimensions: {} });

    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenNthCalledWith(1, projectCreated);
    expect(record).toHaveBeenNthCalledWith(2, { name: 'playback_started', dimensions: {} });
  });

  it('does not let rejected events reserve a milestone name', () => {
    const record = vi.fn();
    const telemetry = createOncePerPageTelemetryClient({ record });

    telemetry.record({
      name: 'project_created',
      dimensions: { source: 'blank', filename: 'private.pf' },
    } as ProductEvent);
    telemetry.record(projectCreated);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(projectCreated);
  });

  it('exposes only the bounded local inspector in development', () => {
    window.pixelForgeTelemetry?.clear();

    expect(window.pixelForgeTelemetry?.list()).toEqual([]);
    expect(window.pixelForgeTelemetry).toEqual({
      list: expect.any(Function),
      clear: expect.any(Function),
    });
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });
});
