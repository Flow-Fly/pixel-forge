import * as Sentry from '@sentry/browser';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const sentryLevel = {
  debug: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
} as const;

function formatLogPart(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level: LogLevel, values: unknown[]) {
  console[level](...values);

  Sentry.addBreadcrumb({
    category: 'app',
    level: sentryLevel[level],
    message: values.map(formatLogPart).join(' '),
  });
}

export const log = {
  debug: (...values: unknown[]) => write('debug', values),
  info: (...values: unknown[]) => write('info', values),
  warn: (...values: unknown[]) => write('warn', values),
  error: (...values: unknown[]) => write('error', values),
};
