# Quality evidence

Before collecting delivery evidence, accepting a downloaded bundle, or finalizing
its PR, use these commands from the exact clean candidate checkout:

```sh
npm run quality:verify -- --base <exact-starting-origin-develop-sha>
npm run quality:check -- --base <same-sha> --head <exact-candidate-sha>
npm run quality:check -- --base <same-sha> --head <exact-candidate-sha> --bundle <downloaded-directory>
```

`quality:verify` invalidates the previous certification before starting a
producer. It builds the shared and server packages, runs five coverage profiles,
executes the shared Node import smoke, checks runtime imports, and reconciles
Fallow reports. It certifies only after all required evidence is valid and the
checkout still has the same HEAD and input hashes. Failure leaves logs and no
certification. `quality:check` reads existing evidence without modifying it or
rerunning producers.

Run `npm run quality:test` for the focused public-command exercises. These use
small isolated Git repositories and installed Vitest, Chromium, Wrangler,
TypeScript, ESLint and Fallow commands. The root test selection also includes
these tests; their child repositories contain small fixture tests, so they do
not recursively execute the product suite.

## Producers and measured scope

The executable inventory is [config.mjs](../../scripts/quality/config.mjs).
The manifest records its resolved source and test paths, configuration hashes,
commands, environment, producer root, tools and results.

| Profile   | Test selection                                                       | Production source                                                          | Runtime                                    |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| `root`    | All `tests/**/*.test.ts` except `tests/browser/**`                   | `src/**/*.ts`, excluding declarations, source test files and `src/main.ts` | Node/happy-dom                             |
| `browser` | All `tests/browser/**/*.test.ts`                                     | `src/**/*.ts`, excluding declarations; includes `main.ts`                  | Chromium through Playwright                |
| `shared`  | `tests/shared/project-contract.test.ts` and `product-events.test.ts` | `shared/src/**/*.ts`, excluding declarations                               | Node/happy-dom                             |
| `server`  | All `server/tests/**/*.test.ts` except database and storage suites   | `server/src/**/*.ts`, excluding declarations                               | Node                                       |
| `worker`  | `tests/workers/telemetry-worker.test.ts`                             | `workers/telemetry/src/**/*.ts`, excluding declarations                    | Node/happy-dom with mocked Worker bindings |

The root coverage command uses one Vitest worker so its product files and CLI
fixtures do not overlap. This controls this runner’s concurrency; other local
processes can still compete for CPU. Test selection and product timeouts stay
unchanged. The limit is part of the recorded and accepted command.

Each profile uses the installed Vitest V8 provider and emits its own
Istanbul-shaped JSON map. Every declared source file must appear, including
zero-hit files and empty type-only or barrel maps. The five maps are independent;
there is no combined percentage or coverage threshold.

`scripts/**` is outside all five coverage maps. The CLI exercises prove tooling
behavior, but they do not produce measured coverage for these modules. Fallow
function scores for tooling therefore retain estimated provenance.

Absolute includes prevent Vitest 4's substring glob matching from collecting
`shared/src` and Worker files in the root profile. The public fixture preserves
this regression: its root tests import all three areas, but each profile keeps
its declared scope. `excludeAfterRemap` also applies exclusions after source-map
translation. V8 can serialize an unbounded end column as `null`; this remains a
valid location, while hit counts must be nonnegative integers. The remapper also
emits `{start: {}, end: {}}` for the second location of a two-way `if` branch
with no explicit `else`; only that precise implicit-branch sentinel is accepted.

The Worker command runs from the root npm workspace caller, generates its types,
and records root `INIT_CWD`. It does not measure workerd or deployed bindings.
The plain Node shared import smoke is executed but not covered. Server process
and compatibility subprocesses are likewise outside their parent's V8 map.
Database and object-storage integration suites remain separate provisioned
commands; unit coverage does not imply those integrations ran. Provider and
matching limits are detailed in the
[verified research note](../../specs/research/clean-code-quality-evidence.md).

## Bundle and acceptance

Generated evidence stays under ignored `.fallow/quality/`:

- `identity.json` identifies base/head, clean state, producer root and OS,
  Node/npm/tool versions, and sorted hashes of tracked and nonignored untracked
  inputs. Configuration and lock files are part of that input inventory.
- `profiles.json` records the five resolved scopes and configuration identities.
- `commands/` retains each command's explicit environment, result, duration,
  working directory and raw log. It never serializes the ambient environment.
- Each profile directory keeps `tests.json`, `coverage-final.json`,
  `coverage-summary.json`, and `fallow.json`.
- `audit.json`, `audit.sarif.json`, `boundaries.json`, and
  `boundary-inventory.json` retain the independent Fallow outputs.
- `review.json` separates blockers from the advisory catalogue.
- `manifest.json` binds records and artifact hashes; `certification.json` binds
  its digest to the exact base/head. `failure.log` explains a failed collection.

Acceptance derives required commands, profile files and configuration from the
expected checkout. It checks artifact hashes, separate and embedded records,
actual executed test files, coverage schema and complete source inventories,
installed tool and registry identity, and the Fallow policy result. Missing,
failed, stale, wrong-profile, empty or foreign evidence fails closed.

For downloaded evidence, retain the original `producerRoot`. It translates
absolute coverage paths; it never permits reading artifacts outside the selected
bundle. Evidence can move between the verified macOS developer host and Linux CI.
Windows producer and consumer paths are unsupported and unverified in this slice.
Replacing the original root with the download directory invalidates the evidence.

An input change invalidates acceptance even if HEAD did not change. Restoring
the exact revision and inputs can make the same intact historical bundle valid
again. A failed collection must be rerun from the intended clean candidate;
there is no certification-history ledger.

## Constraints and advisory review

Fallow zones enforce local source direction for browser, shared, server, Worker,
tooling and the three test areas. The full-tree boundary scan blocks violations
in unchanged and newly discovered files. ESLint applies explicit package
allowlists to static and literal dynamic imports and rejects computed dynamic
imports in production roots. A new package needs a deliberate allowlist update.
TypeScript remains required for types and globals; it accepts some wrong-runtime
packages, including `node:fs` from shared code, and cannot replace these rules.

The Fallow audit compares the exact base with `new-only`. Its JSON introduced
identity is joined to native SARIF severity through the installed
`fallow/issue-registry.json`, whose digest is retained. Introduced non-heuristic
errors and every boundary violation block; unknown or ambiguous joins fail.
Inherited errors cannot turn a new warning into a blocker.

Complexity and duplication remain advisory regardless of native SARIF level or
exit 1. `review.json` lists introduced advisories and inherited configured
hotspots in the changed scope. The Director supplies explicit dispositions,
possibly grouping exact listed IDs with one rationale. The existing inherited
clone `dup:af384e5f` keeps its prior grouped disposition unless its code or
evidence changes. Raw native `npm run fallow:audit` remains a diagnostic command;
the quality command applies the accepted policy.

Each profile's health report uses `--max-crap 1` only to enumerate function
provenance. Its raw rows are not thousands of separate review requests. Retain
`coverage_source`, `coverage_source_consistency`, `istanbul_matched` and
`istanbul_total`: Fallow can estimate unmatched functions even with a valid V8
map. Its `coverage_model: istanbul` is an input-format label, not a producer or
proof of measured attribution.

## CI and remaining checks

Both CI jobs check out the actual source head. The checks job passes the exact
event base/head to the same public command. Quality collection replaces the five
unit/browser test invocations and native Fallow action. It includes shared Node
smoke; CI separately runs shared typecheck, server typecheck/lint, Worker
typecheck/dry-run, root typecheck/lint, and the browser build. The second job
retains the server container build and smoke. Database/storage integration
commands remain guarded by their separate provisioned targets.

Before handoff, run focused checks plus root typecheck, lint, exact-base
`quality:verify`, build, and `git diff --check`. Record the applicable workspace
and container checks separately. Evidence acceptance does not replace the
Standards/Spec review, Director dispositions, fresh finalizer after `FIXED`, or
human merge approval.

CI uploads only `.fallow/quality`, including hidden files, under `if: always()`;
missing artifacts are an error. Artifacts are named with the source head, run ID and attempt, and
retained for 14 days. Record the Actions artifact ID and digest in the handoff.
After expiration, check out the same source revision, install its lockfile and
Chromium, then regenerate with the same exact base. That creates new evidence
and a new artifact identity; an expired artifact is not a passing record.
