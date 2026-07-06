import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'https://5320b1b2198d016786117b6abd41ecbd@o4510552987598848.ingest.de.sentry.io/4511616631242832',
  integrations: [Sentry.browserTracingIntegration({ enableInp: true })],
  tracesSampleRate: 1,
  enableLogs: true,
});
