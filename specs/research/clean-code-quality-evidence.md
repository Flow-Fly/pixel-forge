# Pixel Forge quality evidence: verified producers

Research for [slice #604](https://github.com/Flow-Fly/pixel-forge/issues/604),
under [capability #602](https://github.com/Flow-Fly/pixel-forge/issues/602).
The inspected repository head was
`e94f52e4f8c22f78db93688f5dab3ad95430a652`, in a clean detached research
checkout. This establishes tool mechanics; it does **not** verify a delivery
head or approve a quality gate.

The existing dependencies can produce five separate measured coverage maps.
Keep Vitest's V8 provider. No dependency change, Istanbul instrumentation,
coverage merge, score threshold, debt cleanup, or performance-test split is
justified by these probes. Fallow consumes the maps but still produces mixed
measured and estimated function attribution.

## Evidence identity

The isolated checkout used `npm ci`: Node `22.22.3`, npm `10.9.8`,
Vitest and `@vitest/coverage-v8` `4.1.10`, Playwright and its Vitest provider
`1.62.1` / `4.1.10`, Fallow `3.2.0`, macOS arm64. Chromium headless shell
`151.0.7922.34`, Playwright revision `1234`, was already cached.

Raw evidence is under
[/Users/flow/.codex/artifacts/pixel-forge-quality-adoption/research/](/Users/flow/.codex/artifacts/pixel-forge-quality-adoption/research/).
Each `*.command.json` records the actual argument array, working directory,
explicit environment, head, UTC start/end, and exit status. Matching logs,
coverage maps, summaries, and artifact SHA-256 hashes are retained.
[environment.json](/Users/flow/.codex/artifacts/pixel-forge-quality-adoption/research/environment.json),
[source-input-hashes.json](/Users/flow/.codex/artifacts/pixel-forge-quality-adoption/research/source-input-hashes.json),
and [artifact-hashes.json](/Users/flow/.codex/artifacts/pixel-forge-quality-adoption/research/artifact-hashes.json)
identify the inputs and outputs. These are local research artifacts, without a
CI retention guarantee. The retained probe scripts and command records allow
regeneration at the named commit with the locked dependencies.

## Coverage producers and scopes

All five probes exited zero and emitted Istanbul-format `coverage-final.json`
through the **V8** provider. JSON format does not imply Istanbul
instrumentation. Each output path below is relative to the evidence directory.

| Producer and owning configuration                                                                                        | Focused tests actually executed                                                        | Verified production scope                                               | Result and map                                         |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Root Vitest, [vitest.config.ts](../../vitest.config.ts), Node/happy-dom with `fake-indexeddb/auto`                       | `tests/utils/mask-utils.test.ts`                                                       | `src/**/*.ts`, excluding `**/*.d.ts`, `src/main.ts`, `src/**/*.test.ts` | 18 tests; 300 files; `root-scoped/coverage-final.json` |
| Chromium Browser Mode, [vitest.browser.config.ts](../../vitest.browser.config.ts)                                        | `tests/browser/canonical-composition.test.ts`                                          | `src/**/*.ts`, excluding `**/*.d.ts`                                    | 3 tests; 301 files; `browser/coverage-final.json`      |
| Shared workspace's root/happy-dom configuration, [shared/package.json](../../shared/package.json)                        | Both `tests/shared/project-contract.test.ts` and `tests/shared/product-events.test.ts` | `shared/src/**/*.ts`, excluding `**/*.d.ts`                             | 35 tests; 6 files; `shared/coverage-final.json`        |
| Server Node unit runner, [server/vitest.config.ts](../../server/vitest.config.ts)                                        | `server/tests/config.test.ts`                                                          | `src/**/*.ts` relative to `server/`, excluding `**/*.d.ts`              | 25 tests; 18 files; `server/coverage-final.json`       |
| Telemetry workspace's root/happy-dom unit runner, [workers/telemetry/package.json](../../workers/telemetry/package.json) | `tests/workers/telemetry-worker.test.ts`                                               | `workers/telemetry/src/**/*.ts`, excluding `**/*.d.ts`                  | 13 tests; 1 file; `worker-npm/coverage-final.json`     |

These source inventories include unexecuted files, not just imported modules.
The broad root probe recorded 283 nonempty files with only zero statement
counts; server recorded 16. Empty maps also occur legitimately for type-only
source or barrels; requiring executable statements in every source file would
reject valid output. Keep the existing root `src/main.ts` exclusion. Its
current configuration also includes two empty `.d.ts` entries; explicitly
excluding declarations makes the runtime source inventory unambiguous.

The root test selection for a complete evidence run remains
`tests/**/*.test.ts` minus `tests/browser/**/*.test.ts`. Shared and Worker
tests overlap that selection but need their own source scopes and invocation
records. The server unit runner excludes `*.database.test.ts` and
`*.storage.test.ts`. The research selected fewer tests to verify mechanics;
delivery collection must run the complete declared selection.

Vitest 4 removed `coverage.all`: set `coverage.include` explicitly to add
unexecuted source. Use separate `coverage.reportsDirectory` values because
Vitest cleans that directory. Keep explicit exclusions and apply them after
source remapping where necessary. [Vitest 4 migration](https://v4.vitest.dev/guide/migration),
[coverage configuration](https://v4.vitest.dev/config/coverage), and
[installed-version provider source](https://github.com/vitest-dev/vitest/blob/v4.1.10/packages/coverage-v8/src/provider.ts)
own these behaviors.

The Chromium probe emitted a Vite resolution warning for the unexecuted
`src/services/pwa-registration.ts` import of `virtual:pwa-register`.
No source file disappeared: all 301 expected non-declaration files remained;
that file had seven zero-hit statements and four functions. Vitest's provider
catches a failed transform and can fall back to original source. Preserve the
warning and inventory check; this is not grounds for excluding PWA files.
Root and browser maps can have different transformed function inventories,
so their counts must not be added or implicitly merged.

## Reproducible commands

Use the installed Vitest binary or package scripts, with `CI=true`, and record
the working directory. The probes used these common coverage arguments:

```sh
--coverage.enabled --coverage.provider=v8 \
--coverage.reporter=json --coverage.reporter=json-summary \
--coverage.include='<scope from table>' --coverage.exclude='**/*.d.ts' \
--coverage.reportsDirectory='<absolute runner-specific output directory>'
```

Append those arguments to the following invocations. Root additionally repeats
`--coverage.exclude=src/main.ts` and `--coverage.exclude=src/**/*.test.ts` to
preserve its existing exclusions. The optional `lcovonly` reporter was also
probed; it is unnecessary for the proposed Fallow input.

```sh
# Repository root; shared build is required by the normal package flow.
npm run shared:build
./node_modules/.bin/vitest run tests/utils/mask-utils.test.ts
./node_modules/.bin/vitest run --config vitest.browser.config.ts tests/browser/canonical-composition.test.ts

# shared/ working directory, matching its Vitest selection.
../node_modules/.bin/vitest run --root .. tests/shared/project-contract.test.ts tests/shared/product-events.test.ts

# Build from root, then run from server/.
npm run server:build
../node_modules/.bin/vitest run --config vitest.config.ts tests/config.test.ts

# Repository root. Verified: flags reach Vitest after Wrangler type generation.
npm run test --workspace @pixel-forge/telemetry-worker -- <coverage arguments>
```

The real Worker npm invocation passed 13/13 tests. Calling its inner Vitest
command directly from `workers/telemetry/` without npm's root `INIT_CWD`
failed two configuration tests by resolving the Wrangler path twice. Preserve
the root npm caller and forwarding contract. The shared script ends with a
plain Node command, so appending coverage flags to `npm run shared:test` does
not configure its earlier Vitest command; collect at the actual Vitest call.

## What these maps do not measure

- The telemetry runner uses happy-dom and mocked Analytics Engine/rate-limiter
  bindings. It measures Worker source executed in those tests, not workerd,
  Cloudflare deployment, or real bindings. Vitest V8 requires an exposed V8
  profiler; actual Cloudflare Workers do not provide that interface.
  [Vitest coverage providers](https://v4.vitest.dev/guide/coverage).
- `shared/tests/node-import.mjs` passed separately after build. This plain Node
  ESM/package-export smoke test is outside Vitest coverage. Browser tests and
  server tests can import the compiled shared package; that does not substitute
  for the shared source-map evidence.
- Server database/storage integration runners need their guarded external
  targets; neither was executed here. Server process and compatibility tests
  spawn built Node subprocesses, whose execution is not recorded by the parent
  Vitest inspector. Retain these checks with `not-collected` coverage rather
  than attributing their execution to the unit map.
- V8 has known limitations around default arguments and statements following
  an unexpectedly throwing call. Coverage remains measured execution evidence
  with provider limits, not proof that assertions exercise every behavior.
  [Remapper limitations](https://github.com/AriPerkkio/ast-v8-to-istanbul#limitations).

No wall-clock performance budget assertion was found by inspection of
`performance.now`, `Date.now`, timing assertions, and test timeouts. Creative
Run tests use controlled application time; server timeouts bound integration
completion. No local evidence supports importing a separate uninstrumented
performance runner.

## Fallow 3.2.0 consumption and refusal behavior

Source was checked at upstream tag `v3.2.0`, commit
`0d568277b6cf91e95c98cb92f8228154e58d6984`, alongside installed CLI help.
`health --coverage` accepts a single Istanbul coverage map JSON, or a directory
containing `coverage-final.json`. It does not accept LCOV or native V8 JSON for
this purpose. `--runtime-coverage` is a different runtime-analysis feature and
is unnecessary here. [Pinned CLI contract](https://github.com/fallow-rs/fallow/blob/0d568277b6cf91e95c98cb92f8228154e58d6984/crates/cli/src/main.rs#L1030).

For diagnostic enumeration only, the probes ran:

```sh
./node_modules/.bin/fallow health --report-only --file-scores --complexity \
  --max-crap 1 --coverage '<one runner coverage-final.json>' --format json --no-cache
```

`--max-crap 1` exposed attribution fields; it is **not a proposed threshold**.
With the broad probe maps, findings inside each corresponding production
scope had the following `coverage_source` values:

| Input map                                   | `istanbul` findings | `estimated` findings |
| ------------------------------------------- | ------------------: | -------------------: |
| Root, broad diagnostic scope including main |               5,216 |                  102 |
| Chromium                                    |               5,215 |                  103 |
| Shared                                      |                 116 |                    1 |
| Server unit                                 |                  84 |                    0 |
| Worker unit                                 |                  10 |                    0 |

These are surfaced findings, not a complete function inventory or a coverage
percentage. No duplicate `(path, name, line, col)` finding identities occurred
in these reports. The whole-repository reports additionally estimate paths
outside the supplied map. `coverage_source: istanbul` names the consumed JSON
format; the producer is still Vitest V8.

Fallow matches canonical file paths, then function names and source positions,
with limited nearby-name/anonymous fallbacks. It calculates the fraction of
covered statements contained inside each matched function body, falling back
to function hits when no statements exist. Unmatched functions receive an
estimate. For example, Vitest names the second `execute` method `execute_2`
while Fallow names it `execute`, leaving a real method estimated. The shared
unmatched `atob` is an ambient declaration without runtime implementation.
[Pinned matching/scoring implementation](https://github.com/fallow-rs/fallow/blob/0d568277b6cf91e95c98cb92f8228154e58d6984/crates/engine/src/health/scoring.rs#L730).

| Explicit coverage input exercise                         | Observed result                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Valid Vitest JSON                                        | Exit 0 under `--report-only`; `coverage_model: istanbul`, mixed function provenance |
| Missing file                                             | Exit 2, JSON `error: true`                                                          |
| LCOV text                                                | Exit 2, coverage parse error                                                        |
| Empty map `{}`                                           | Exit 0; `coverage_model: istanbul`, zero matches, uniform estimated findings        |
| Valid map with foreign absolute file paths               | Exit 0; zero matches                                                                |
| Same foreign map plus correct absolute `--coverage-root` | Exit 0; all 84 server matches restored                                              |

Consequently, neither exit 0 nor `coverage_model: istanbul` proves valid
measured evidence. Preserve each finding's `coverage_source`, summary
`coverage_source_consistency`, and `istanbul_matched` / `istanbul_total`.
Use source-root rebasing only after validating the recorded producer root.
Fallow's input loader does not establish base/head or source/test/config
freshness. Its nearby-position matching especially cannot certify freshness.

Audit classification needs a separate implementation exercise. Source inspection
confirms `kind: audit`, `verdict`, `base_ref`, `head_sha`, and introduced/inherited
category counts. However, `summary.dead_code_has_errors` considers all
changed-scope issues, whereas the default `new-only` verdict checks introduced
issues. That summary cannot replace the existing gate. Native SARIF generation
receives configured rule severities; the audit JSON dead-code serializer does
not. Do not downgrade every exit 1 or infer per-finding severity from category
counts. Preserve the existing new-only contract until a tested classifier can
separate advisory findings from required errors. The fixture appendix below
verifies these distinctions; no global Pixel Forge dead-code baseline was
established here.
[Pinned audit gate](https://github.com/fallow-rs/fallow/blob/0d568277b6cf91e95c98cb92f8228154e58d6984/crates/cli/src/audit.rs#L358),
[output contract](https://github.com/fallow-rs/fallow/blob/0d568277b6cf91e95c98cb92f8228154e58d6984/crates/api/src/audit_output.rs#L25),
and [JSON/SARIF serializers](https://github.com/fallow-rs/fallow/blob/0d568277b6cf91e95c98cb92f8228154e58d6984/crates/cli/src/audit_output.rs#L737).

## Recommended first delivery contract

Keep five independently identified JSON maps and an executable inventory of
their exact test selection, source files, exclusions, runner/config/tool
versions, environment, commands, base/head, and artifact hashes. A source file
with zero hits must remain visible; type-only files may have empty counters.
Reject missing reports, error payloads, malformed maps, unexpected or absent
source paths, inconsistent internal file paths, stale inputs, and incorrect
base/head before consuming coverage. Check map structure and counters, not
just the file name or existence.

Retain raw maps, command logs, tool reports, inventory, and input/output hashes
as one identifiable CI artifact. State retention and regenerate from the exact
commit/lockfile/configuration when artifacts expire. Recollection is new
evidence and cannot reuse the expired artifact's identity.
If the output lives under `.fallow/quality`, explicitly enable hidden-file
upload, set missing files to an error, and upload only that generated evidence
directory. Record the artifact ID/digest and configured retention.
[Official upload-artifact options](https://github.com/actions/upload-artifact).

Keep architecture/runtime checks blocking in their own evidence records.
Keep configured complexity and duplication advisory, with explicit Director
dispositions. Do not apply `--report-only` to a combined command that also owns
required architecture failures. Separate raw measured coverage from Fallow's
mixed advisory interpretation; no merged score is needed. Exercises must
demonstrate acceptance of a correctly identified complete bundle and rejection
of absent, stale, wrong-revision, and wrong-scope reports.

The research checkout produced only this note for later import into the delivery branch. No configuration, product
code, GitHub state, or dependency lockfile was changed. Focused probes and
`git diff --check` ran; full repository gates remain the delivery worker's
responsibility after implementation.

## Appendix: native audit gate probes

Four tiny Git repositories under the evidence directory's `audit-fixtures/`
used real base/head commits, an explicit entry point, and fixture-only rules
`unused-exports: warn` and `unresolved-imports: error`. Installed Fallow ran
`audit --base <exact SHA> --gate new-only --format json --no-cache`, then the
same command with `--format sarif`. The script is
[probe-audit.py](/Users/flow/.codex/artifacts/pixel-forge-quality-adoption/research/probe-audit.py);
`audit-<case>-<format>.command.json` records each identity and invocation.

| Candidate change                                                 | Audit JSON verdict / exit | Native SARIF                                          |
| ---------------------------------------------------------------- | ------------------------- | ----------------------------------------------------- |
| New unused export configured as warning                          | `warn` / 0                | `fallow/unused-export`, `warning`                     |
| New unresolved import configured as error                        | `fail` / 1                | `fallow/unresolved-import`, `error`                   |
| Complexity alone, no dead-code finding                           | `fail` / 1                | `fallow/high-crap-score`, `error`                     |
| Inherited unresolved-import error plus new unused-export warning | `warn` / 0                | Contains both the inherited `error` and new `warning` |

The last case proves two unsafe shortcuts: `summary.dead_code_has_errors`
was true despite the correct warning verdict, and SARIF retained the inherited
error without `introduced` or baseline metadata. Audit JSON correctly marked
the unresolved import `introduced: false` and unused export `introduced: true`.
Replacing audit with `dead-code --changed-since <same base> --format sarif`
exited 1 on the inherited error, changing the existing new-only contract.

Installed CLI help limits `--only`/`--skip` to invocations without a subcommand;
there is no verified native audit option to omit just health and duplication.
Do not change thresholds to simulate that omission. A safe acceptance adapter
needs a tested join between JSON introduced findings and native SARIF levels,
with errors for missing, ambiguous, or unsupported identities. The installed
`fallow/issue-registry.json` provides `result_key` and `sarif_rule_ids` mappings
for dead-code categories, avoiding invented pluralization rules. In these
fixtures, file path, line, and column aligned after converting JSON's zero-based
column to SARIF's one-based column. Other finding shapes still need explicit
fixtures before acceptance support is claimed. Complexity/duplication can then
receive advisory dispositions while configured introduced errors remain
blocking; whole-repository boundary checks remain a separately verified scope.
