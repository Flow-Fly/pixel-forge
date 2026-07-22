import { pathToFileURL } from 'node:url';
import { PRODUCT_EVENT_NAMES } from '@pixel-forge/shared';

const DATASET = 'pixel_forge_product_events';
const REJECTED_REQUEST = 'telemetry_request_rejected';
const REPORT_WINDOWS = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

export function buildTelemetryQuery(days) {
  const safeDays = REPORT_WINDOWS.find((window) => window.days === days)?.days;
  if (!safeDays) throw new RangeError('Unsupported telemetry report window');

  const names = [...PRODUCT_EVENT_NAMES, REJECTED_REQUEST].map((name) => `'${name}'`).join(', ');
  return [
    'SELECT index1 AS event_name, SUM(_sample_interval) AS estimated_count',
    `FROM ${DATASET}`,
    `WHERE timestamp >= NOW() - INTERVAL '${safeDays}' DAY`,
    `AND index1 IN (${names})`,
    'GROUP BY event_name',
    'ORDER BY event_name',
  ].join('\n');
}

export async function fetchTelemetryCounts({ accountId, apiToken, days, fetch: send = fetch }) {
  const response = await send(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: buildTelemetryQuery(days),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare Analytics Engine query failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('Cloudflare Analytics Engine returned an unexpected response');
  }

  const counts = new Map();
  for (const row of payload.data) {
    if (!row || typeof row.event_name !== 'string') continue;
    const count = Number(row.estimated_count);
    if (Number.isFinite(count) && count >= 0) counts.set(row.event_name, count);
  }
  return counts;
}

export function formatTelemetryReport(reports) {
  const lines = [
    'Pixel Forge activation telemetry',
    'Directional event-count ratios; these are not unique-user or cohort conversions.',
  ];

  for (const report of reports) {
    const editorLoads = report.counts.get('editor_loaded') ?? 0;
    lines.push('', report.label, 'Event                         Count     / editor_loaded');

    for (const eventName of PRODUCT_EVENT_NAMES) {
      const count = report.counts.get(eventName) ?? 0;
      const ratio = editorLoads > 0 ? `${((count / editorLoads) * 100).toFixed(1)}%` : '—';
      lines.push(`${eventName.padEnd(29)} ${String(count).padStart(7)}     ${ratio}`);
    }

    const rejected = report.counts.get(REJECTED_REQUEST) ?? 0;
    lines.push(`Rejected privacy-invalid requests: ${rejected}`);
  }

  return lines.join('\n');
}

export async function createTelemetryReport({ accountId, apiToken, fetch: send = fetch }) {
  const reports = [];
  for (const window of REPORT_WINDOWS) {
    reports.push({
      label: window.label,
      counts: await fetchTelemetryCounts({
        accountId,
        apiToken,
        days: window.days,
        fetch: send,
      }),
    });
  }
  return formatTelemetryReport(reports);
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_ANALYTICS_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error(
      'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_API_TOKEN before running the report'
    );
  }

  console.log(await createTelemetryReport({ accountId, apiToken }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Telemetry report failed');
    process.exitCode = 1;
  });
}
