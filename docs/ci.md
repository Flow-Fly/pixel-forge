# CI and browser test checks

The repository keeps two separate browser boundaries:

- `npm run test:run` is the existing default suite. It uses Happy DOM for
  unit and component tests and keeps its current include patterns unchanged.
- `npm run test:browser` is the small Vitest Browser Mode suite under
  `tests/browser/`. It uses the Playwright provider with one headless
  Chromium instance and does not start the Pixel Forge application or require
  an external service.

## Local browser checks

Install the repository dependencies and the matching Chromium artifacts once:

```sh
npm ci
npx playwright install --with-deps --only-shell chromium
```

The Playwright command installs the Chromium headless shell, its Linux system
dependencies when needed, and the provider's FFmpeg artifact. Then run the
dedicated suite:

```sh
npm run test:browser
```

The command exits non-zero when a browser test fails. Run it again from the
same clean fixture state when checking determinism:

```sh
npm run test:browser
```

The browser lane is intentionally Chromium-only. It does not include Firefox,
WebKit, screenshots, retries, coverage merging, a hosted test service, or full
application end-to-end navigation. Production code and the Happy DOM suite do
not depend on this lane.

## Pull-request checks

The existing `checks` job installs the pinned npm dependencies, installs the
matching headless Chromium artifacts explicitly, and runs the browser suite
alongside the existing shared, server, telemetry, typecheck, lint, Happy DOM,
build, Fallow, and container checks. No application server, port, secret, or
network assertion is part of the browser fixture contract.
