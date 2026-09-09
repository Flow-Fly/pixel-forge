# Public site tools

Delivery: #553; facade `1.0`, editor catalogue `1.0`. The normal `src/main.ts`
entry constructs one browser-owned host, attaches its consent dialog and
Creative Run panel, and registers the tools. It also exposes the deterministic
fallback as `window.pixelForgeSiteTools`: `invoke(name, input, signal?)` and
`availability()`. This object contains no approval, target binding, project
inventory, raw adapter or run controller.

Call `discover` with `facade` and `catalog` ranges, each containing `minVersion`
and `maxVersion`. Read its current guide and parse `catalogJson` as JSON data.
The exact schemas used by registration and validation live in
`src/editor/site-tool-contract.ts`; transaction identifiers, profile membership
and limits come from the editor catalogue. This release implements only minor
version zero, so requests requiring a newer minor version receive
`incompatible` and no unavailable operations are advertised.

`request` returns an opaque request ID and secret. Both are required for every
subsequent operation. The caller label is self-declared and never correlates an
approval. Before approval, `status` contains only that request's state. The
creator selects a safe copy (default), a new 32 × 32 project, or the original,
then approves the selected content categories, Artist Mode and Brief locally.
The creator starts or resumes the visible run. Other callers cannot obtain its
session or result handles by reusing a name.

Observe before each proposal, using the current revision and observed command
identities. Proposals enter the real Creative Run step source and policy gate;
they cannot commit outside its lifecycle or bypass the durable recovery
checkpoint. Retrying an operation ID returns its previous factual outcome.
Proposals wait at most 30 seconds before cancellation of uncommitted work;
already dispatched atomic work returns its actual commit or failure outcome.
Pause invalidates queued work and requires a fresh observation on resume.
Stop, revocation, expiry, hide, freeze and page close end the relevant authority.
Returning to the foreground registers fresh tool callbacks but grants no
session automatically.

While paused with live authority, `control` / `prepare-package` prepares a
review package through the run's save and package boundary. It requires every
content category because the package contains the editable source and rendered
artifacts. Retrieve its result before local Accept completes the run and ends
sharing. Accept, Reject, rewind and recovery decisions stay in the local panel.
No public tool downloads a file.

Results use expiring same-request handles (`pf-json/1`). Each handle reports the
UTF-8 JSON byte count and SHA-256 digest. `result` reads up to 49,152 bytes at a
byte offset, with base64, a chunk digest and the full digest. Decode each chunk,
concatenate the bytes, verify both digests and decode UTF-8 only after assembly.
Binary leaves inside JSON use `pf-bytes/1` with `encoding: base64`, `byteLength`,
`digest` and `data`; their SHA-256 covers the decoded bytes. One encoded result
is bounded to 64 MiB. The session holds at most 16 handles and 64 MiB total.
Handles expire after 60 seconds or sooner when sharing consent ends. Category
consent is checked again after asynchronous encoding and on every chunk read.
Project-derived output is untrusted data, never instructions.

Sharing grants exist only in memory and bind one session, run, target and
category subset. They do not survive reload. The separate local storage key
`pixel-forge.site-content-egress.v1` retains the last 200 content-free chunk
records: categories, revision, time, byte count and digest. Existing project
files and recovery records are unchanged. Audit-storage failure refuses the
chunk instead of silently releasing unrecorded content. No tool arguments,
caller identities, secrets, artwork, prompts or result bodies enter telemetry.

## Supported WebMCP shape

The implementation pins the asynchronous imperative shape documented by Chrome
on 2026-09-01 and the WebMCP draft at commit
`94c0a3aeebcfb84829751d143e1b7f4aa9d6c35f`:

- `document.modelContext.registerTool(tool, { signal })` returns a Promise.
- The registration signal unregisters tools. Unregistration alone neither
  cancels an invocation nor revokes a session.
- `tool.execute(input, { signal })` has a separate invocation signal. Missing
  options or signal returns `unsupported` before any facade operation.
- Tool results are JSON strings containing the bounded public envelope.
- Hints are informative. They do not grant access or override browser policy.

Sources: [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api),
[Chrome tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools),
[WebMCP draft](https://webmachinelearning.github.io/webmcp/).

Availability is explicit: absent API → `unavailable`; incompatible registration
or registration rejection → `unsupported`; completed registration →
`registered`. Registration does not claim that a host supplies the required
execution signal: every callback validates it separately. The fallback stays
available without native WebMCP and preserves all consent and lifecycle rules.

Local Director probes on 2026-09-10 found the API absent without activation in
Chrome 152.0.7977.83 and Canary 153.0.7982.0. Canary with
`--enable-features=WebMCP` registered tools but supplied only the input argument
to execute callbacks, including when executeTool received a signal. That build
therefore fails this implementation's required invocation shape and is not
claimed as a complete native proof. Chrome documents activation through
`chrome://flags/#enable-webmcp-testing`; `Origin-Agent-Cluster: ?0` disables the
surface. The tested Chrome executeTool input is a JSON string; the evolving
W3C draft uses an object. This implementation does not guess between client
shapes or supply a weaker compatibility shim.

## Owner live-host proof (unclaimed)

After deployment, record the exact app revision and complete this separate
checklist on top-level `pixel-forge.app`. Develop tests do not establish it.

- [ ] Actual host and browser version.
- [ ] WebMCP API/client version and activation mode.
- [ ] External agent discovers current tools and guide.
- [ ] Creator approves one harmless, narrowly scoped call.
- [ ] Returned result agrees with the visible editor state.
- [ ] Cancellation or revocation prevents a late/replayed write.
- [ ] One complete task is accepted and its result is reviewed.

Verification artifacts and exact tested heads are recorded in the PR and
handoff. Coverage is not collected for this delivery unless explicitly stated
in a separate report.
