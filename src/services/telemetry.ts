import { parseProductEvent, type ProductEvent } from '@pixel-forge/shared';

export type { ProductEvent, ProductEventDimensions, ProductEventName } from '@pixel-forge/shared';

export interface TelemetrySink {
  record(event: ProductEvent): void | Promise<void>;
}

export interface TelemetryClient {
  record(event: ProductEvent): void;
}

export interface DevelopmentTelemetrySink extends TelemetrySink {
  events(): readonly ProductEvent[];
  clear(): void;
}

export interface DevelopmentTelemetryInspector {
  list(): readonly ProductEvent[];
  clear(): void;
}

interface HttpTelemetrySinkOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEVELOPMENT_EVENT_LIMIT = 100;
const TELEMETRY_ENDPOINT = '/api/telemetry';
const TELEMETRY_TIMEOUT_MS = 2_000;

const noOpSink: TelemetrySink = {
  record: () => undefined,
};

export function createTelemetryClient(sink: TelemetrySink = noOpSink): TelemetryClient {
  return {
    record(event) {
      try {
        const acceptedEvent = parseProductEvent(event);
        if (!acceptedEvent) return;

        const pending = sink.record(acceptedEvent);
        if (pending) void pending.catch(ignoreTelemetryFailure);
      } catch {
        // Telemetry is best-effort and must never interrupt product behavior.
      }
    },
  };
}

export function createDevelopmentTelemetrySink(): DevelopmentTelemetrySink {
  const recordedEvents: ProductEvent[] = [];

  return {
    record(event) {
      const acceptedEvent = parseProductEvent(event);
      if (!acceptedEvent) return;

      if (recordedEvents.length === DEVELOPMENT_EVENT_LIMIT) {
        recordedEvents.shift();
      }

      recordedEvents.push(acceptedEvent);
    },
    events: () => recordedEvents.slice(),
    clear: () => {
      recordedEvents.length = 0;
    },
  };
}

export function createHttpTelemetrySink(options: HttpTelemetrySinkOptions = {}): TelemetrySink {
  const send = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? TELEMETRY_TIMEOUT_MS;

  return {
    async record(event) {
      const acceptedEvent = parseProductEvent(event);
      if (!acceptedEvent) return;

      await send(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acceptedEvent),
        credentials: 'omit',
        keepalive: true,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    },
  };
}

export function createOncePerPageTelemetryClient(sink: TelemetrySink): TelemetryClient {
  const recordedNames = new Set<ProductEvent['name']>();
  const telemetry = createTelemetryClient(sink);

  return {
    record(event) {
      try {
        const acceptedEvent = parseProductEvent(event);
        if (!acceptedEvent || recordedNames.has(acceptedEvent.name)) return;

        recordedNames.add(acceptedEvent.name);
        telemetry.record(acceptedEvent);
      } catch {
        // Hostile values stay outside both the product path and the dedupe state.
      }
    },
  };
}

const developmentTelemetrySink = createDevelopmentTelemetrySink();

export const productTelemetry = createOncePerPageTelemetryClient(
  import.meta.env.PROD ? createHttpTelemetrySink() : developmentTelemetrySink
);

if (import.meta.env.DEV) {
  window.pixelForgeTelemetry = {
    list: () => developmentTelemetrySink.events(),
    clear: () => developmentTelemetrySink.clear(),
  };
}

function ignoreTelemetryFailure(): void {
  // Rejections stay contained so telemetry remains outside the product path.
}

declare global {
  interface Window {
    pixelForgeTelemetry?: DevelopmentTelemetryInspector;
  }
}
