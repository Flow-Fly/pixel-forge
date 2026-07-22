import { parseProductEvent, type ProductEvent } from '@pixel-forge/shared';

const TELEMETRY_PATH = '/api/telemetry';
const PRODUCTION_ORIGIN = 'https://pixel-forge.app';
const MAX_BODY_BYTES = 512;
const RATE_LIMIT_KEY = 'product-events';

export default {
  async fetch(request, env): Promise<Response> {
    return handleTelemetryRequest(request, env);
  },
} satisfies ExportedHandler<Env>;

export async function handleTelemetryRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== TELEMETRY_PATH) return response(404, 'Not found');
  if (request.method !== 'POST') return response(405, 'Method not allowed', { Allow: 'POST' });
  if (request.headers.get('Origin') !== PRODUCTION_ORIGIN) return response(403, 'Forbidden');
  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return response(415, 'JSON required');
  }
  if (declaredBodyIsTooLarge(request.headers.get('Content-Length'))) {
    return response(413, 'Payload too large');
  }

  const rateLimit = await env.TELEMETRY_RATE_LIMITER.limit({ key: RATE_LIMIT_KEY });
  if (!rateLimit.success) return response(429, 'Too many requests');

  const body = await readBoundedBody(request);
  if (!body.ok) return response(413, 'Payload too large');

  const event = parseJsonProductEvent(body.text);
  if (!event) {
    writeInvalidPayloadRejection(env.PRODUCT_EVENTS);
    return response(400, 'Invalid event');
  }

  try {
    writeProductEvent(env.PRODUCT_EVENTS, event);
  } catch {
    return response(503, 'Telemetry unavailable');
  }

  return response(202, 'Accepted');
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType?.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

function declaredBodyIsTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  const bytes = Number(contentLength);
  return !Number.isFinite(bytes) || bytes < 0 || bytes > MAX_BODY_BYTES;
}

async function readBoundedBody(
  request: Request
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(bytes) };
}

function parseJsonProductEvent(body: string): ProductEvent | undefined {
  try {
    return parseProductEvent(JSON.parse(body));
  } catch {
    return undefined;
  }
}

function writeProductEvent(dataset: AnalyticsEngineDataset, event: ProductEvent): void {
  const [dimensionName, dimensionValue] = Object.entries(event.dimensions)[0] ?? ['', ''];
  dataset.writeDataPoint({
    indexes: [event.name],
    blobs: [dimensionName, dimensionValue],
  });
}

function writeInvalidPayloadRejection(dataset: AnalyticsEngineDataset): void {
  try {
    dataset.writeDataPoint({
      indexes: ['telemetry_request_rejected'],
      blobs: ['invalid_payload'],
    });
  } catch {
    // Rejection evidence must not turn a bounded client error into a Worker failure.
  }
}

function response(status: number, message: string, headers: HeadersInit = {}): Response {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      ...headers,
    },
  });
}
