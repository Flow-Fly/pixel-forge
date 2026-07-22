import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handleTelemetryRequest } from '../../workers/telemetry/src/index';

function createEnvironment(options: { rateLimitSuccess?: boolean } = {}) {
  const writeDataPoint = vi.fn();
  const limit = vi.fn(async () => ({ success: options.rateLimitSuccess ?? true }));
  return {
    env: {
      PRODUCT_EVENTS: { writeDataPoint },
      TELEMETRY_RATE_LIMITER: { limit },
    } as unknown as Env,
    limit,
    writeDataPoint,
  };
}

function telemetryRequest(body: string, headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({
    'Content-Type': 'application/json',
    Origin: 'https://pixel-forge.app',
    ...headers,
  });
  const request = new Request('https://pixel-forge.app/api/telemetry', {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
  const getHeader = request.headers.get.bind(request.headers);
  vi.spyOn(request.headers, 'get').mockImplementation((name) =>
    requestHeaders.has(name) ? requestHeaders.get(name) : getHeader(name)
  );
  return request;
}

describe('telemetry Worker', () => {
  it('publishes the telemetry route through the fixed Pixel Forge zone', async () => {
    const repositoryRoot = process.env.INIT_CWD ?? process.cwd();
    const configPath = resolve(repositoryRoot, 'workers/telemetry/wrangler.jsonc');
    const source = await readFile(configPath, 'utf8');
    const config = JSON.parse(source.replace(/,\s*(?=[}\]])/g, ''));

    expect(config.routes).toEqual([
      {
        pattern: 'pixel-forge.app/api/telemetry',
        zone_id: '7f0f45faf62c6bb62ba89617a79497fb',
      },
    ]);
    expect(source).not.toContain('zone_name');
  });

  it('keeps persisted logs, invocation logs, and traces disabled', async () => {
    const repositoryRoot = process.env.INIT_CWD ?? process.cwd();
    const configPath = resolve(repositoryRoot, 'workers/telemetry/wrangler.jsonc');
    const source = await readFile(configPath, 'utf8');
    const config = JSON.parse(source.replace(/,\s*(?=[}\]])/g, ''));

    expect(config.observability).toEqual({
      enabled: false,
      logs: {
        enabled: false,
        invocation_logs: false,
        persist: false,
      },
      traces: {
        enabled: false,
        persist: false,
      },
    });
  });

  it('writes only the approved event and dimension', async () => {
    const { env, limit, writeDataPoint } = createEnvironment();

    const result = await handleTelemetryRequest(
      telemetryRequest(
        JSON.stringify({
          name: 'project_created',
          dimensions: { source: 'guided_drawing' },
        })
      ),
      env
    );

    expect(result.status).toBe(202);
    expect(limit).toHaveBeenCalledWith({ key: 'product-events' });
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['project_created'],
      blobs: ['source', 'guided_drawing'],
    });
  });

  it.each([
    ['method', new Request('https://pixel-forge.app/api/telemetry'), 405],
    [
      'origin',
      telemetryRequest('{"name":"playback_started","dimensions":{}}', {
        Origin: 'https://attacker.example',
      }),
      403,
    ],
    [
      'content type',
      telemetryRequest('{"name":"playback_started","dimensions":{}}', {
        'Content-Type': 'text/plain',
      }),
      415,
    ],
    [
      'declared body size',
      telemetryRequest('{"name":"playback_started","dimensions":{}}', {
        'Content-Length': '513',
      }),
      413,
    ],
  ])('rejects an invalid %s before writing', async (_name, request, status) => {
    const { env, writeDataPoint } = createEnvironment();

    const result = await handleTelemetryRequest(request, env);

    expect(result.status).toBe(status);
    expect(writeDataPoint).not.toHaveBeenCalled();
    expect(await result.text()).not.toContain('attacker');
  });

  it('rejects a streamed body above the limit without parsing or writing', async () => {
    const { env, writeDataPoint } = createEnvironment();
    const oversizedBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(513)));
        controller.close();
      },
    });
    const request = new Request('https://pixel-forge.app/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://pixel-forge.app',
      },
      body: oversizedBody,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const getHeader = request.headers.get.bind(request.headers);
    vi.spyOn(request.headers, 'get').mockImplementation((name) =>
      name.toLowerCase() === 'origin' ? 'https://pixel-forge.app' : getHeader(name)
    );

    const result = await handleTelemetryRequest(request, env);

    expect(result.status).toBe(413);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('records only a fixed rejection reason for a privacy-invalid payload', async () => {
    const { env, writeDataPoint } = createEnvironment();
    const body = JSON.stringify({
      name: 'project_created',
      dimensions: { source: 'blank', filename: 'private-project.pf' },
    });

    const result = await handleTelemetryRequest(telemetryRequest(body), env);

    expect(result.status).toBe(400);
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['telemetry_request_rejected'],
      blobs: ['invalid_payload'],
    });
    expect(JSON.stringify(writeDataPoint.mock.calls)).not.toContain('private-project');
  });

  it('rate limits without writing product or rejection rows', async () => {
    const { env, writeDataPoint } = createEnvironment({ rateLimitSuccess: false });

    const result = await handleTelemetryRequest(
      telemetryRequest('{"name":"playback_started","dimensions":{}}'),
      env
    );

    expect(result.status).toBe(429);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});
