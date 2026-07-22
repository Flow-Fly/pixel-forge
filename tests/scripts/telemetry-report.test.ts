import { describe, expect, it, vi } from 'vitest';
import { buildTelemetryQuery, createTelemetryReport } from '../../scripts/telemetry-report.mjs';

describe('telemetry owner report', () => {
  it('uses sampling-aware counts over only supported windows', () => {
    expect(buildTelemetryQuery(7)).toContain('SUM(_sample_interval) AS estimated_count');
    expect(buildTelemetryQuery(7)).toContain("INTERVAL '7' DAY");
    expect(() => buildTelemetryQuery(2)).toThrow('Unsupported telemetry report window');
  });

  it('reports all windows as directional event-count ratios', async () => {
    const send = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { event_name: 'editor_loaded', estimated_count: '20' },
              { event_name: 'project_created', estimated_count: 5 },
              { event_name: 'telemetry_request_rejected', estimated_count: 2 },
            ],
          }),
          { status: 200 }
        )
    );

    const report = await createTelemetryReport({
      accountId: 'account-id',
      apiToken: 'read-only-secret',
      fetch: send,
    });

    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-id/analytics_engine/sql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer read-only-secret',
        }),
      })
    );
    expect(report).toContain('24 hours');
    expect(report).toContain('7 days');
    expect(report).toContain('30 days');
    expect(report).toMatch(/project_created\s+5\s+25\.0%/);
    expect(report).toContain('not unique-user or cohort conversions');
    expect(report).toContain('Rejected privacy-invalid requests: 2');
    expect(report).not.toContain('read-only-secret');
  });

  it('returns a bounded error without exposing Cloudflare response content', async () => {
    const send = vi.fn(async () => new Response('private provider detail', { status: 403 }));

    await expect(
      createTelemetryReport({
        accountId: 'account-id',
        apiToken: 'read-only-secret',
        fetch: send,
      })
    ).rejects.toThrow('HTTP 403');
  });
});
