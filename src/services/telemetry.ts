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

const DEVELOPMENT_EVENT_LIMIT = 100;

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

export const productTelemetry = createTelemetryClient();

function ignoreTelemetryFailure(): void {
  // Rejections stay contained so telemetry remains outside the product path.
}
