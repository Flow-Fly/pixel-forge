# Reusable guidance from Pixel Forge demonstrations

Research date: 2026-09-05. Repository baseline:
`07bc075b82e040738d696a3b33b702bb810b08a1`.

Research for [Determine how demonstrations become reusable Pixel Forge guidance](https://github.com/Flow-Fly/pixel-forge/issues/591),
within [Teach agents to improve Pixel Forge animations with UI control and structured tools](https://github.com/Flow-Fly/pixel-forge/issues/589).
This is evidence and a prototype recommendation, not approval of a production integration.

## What a demonstration teaches

OpenAI documents Record & Replay as a way to capture actions and window content,
then draft a skill describing its trigger, variable inputs, procedure, and
verification. A later chat invokes that skill with new input values and uses the
tools available in that environment. The documented mechanism supplies reusable
context; it does not permanently train Astra or promise an identical sequence of
clicks. The draft can be refined to explain preferences and decision points that
the demonstration did not make explicit. Short, complete demonstrations with
stable steps and clear success criteria are the documented best fit.
([Record & Replay](https://learn.chatgpt.com/docs/extend/record-and-replay))

A skill uses the open Agent Skills format: a directory containing `SKILL.md`
with `name` and `description`, plus optional references, assets, and scripts.
Hosts initially expose metadata and load the full instructions when selected.
Codex supports explicit invocation and description-based discovery; local skill
folders and plugin distribution serve different installation needs. OpenAI also
provides optional dependency metadata in `agents/openai.yaml`.
([Build skills](https://learn.chatgpt.com/docs/build-skills))

Inference: portable instructions do not make their tools portable. A generated
skill that names one host's browser methods, local paths, app permissions, or
connected plugins must be adapted and tested elsewhere. The cited documentation
does not promise automatic import into T3 Code, universal replay across hosts,
or automatic repair after Pixel Forge's UI changes.

## Availability is a host question

Record & Replay requires macOS and available, enabled Computer Use. Its documented
entry point is the ChatGPT desktop app, using Work or Codex. An administrator's
`[features].computer_use = false` disables recording too.
([Record & Replay](https://learn.chatgpt.com/docs/extend/record-and-replay))

Computer Use has its own plugin setup, app approvals, and, on macOS, Screen
Recording and Accessibility permissions. Current guidance recommends Astra for
difficult visual tasks when available in the model selector. It describes
availability in supported regions; this research did not verify the owner's
account, region eligibility, desktop installation, or permissions.
([Computer Use](https://learn.chatgpt.com/docs/computer-use))

Astra's API model page lists Skills, Computer Use, and MCP support. That does not
establish desktop recording or WebMCP availability in a particular host.
([Astra model](https://developers.openai.com/api/docs/models/gpt-6-astra))
The current Site tools page still names Sol and Terra, excludes Enterprise/Edu,
and makes access dependent on rollout and the live page. It documents top-level
JavaScript registration, not iframe or declarative-form tools. Astra WebMCP
support therefore remains unverified by these sources.
([Site tools](https://learn.chatgpt.com/docs/webmcp))

Local observation: this research session exposes T3 preview and preview-recording
tools, but no callable Record & Replay skill-authoring tool. Preview recording is
not evidence that the desktop Record & Replay feature is installed. No browser
or recording was started and no plugin was installed.

## Fit with the accepted Pixel Forge plan

The accepted [Agentic Preview specification](https://github.com/Flow-Fly/pixel-forge/issues/523)
already makes the Agent Bootstrap Guide the shared instruction base for the site,
embedded agent, and Pixel Forge Agent Skill. The live Editor Catalog owns schemas,
limits, grants, and available operations. Installed guidance must yield to current
catalog-matched guidance; major contract incompatibility blocks writes and minor
differences hide unavailable capabilities. The
[Local Automation Bridge and Agent Skill capability](https://github.com/Flow-Fly/pixel-forge/issues/536)
requires a thin skill without duplicated command definitions and preservation of
the original cup project.

Recommendation: use a demonstration as evidence for improving that existing
workflow guide. Do not copy a recorded tool inventory into it. A successful UI
experiment would still need an explicit decision before changing the accepted
structured automation contract.

The smallest useful instruction structure for the later comparison is one short
entry document and three separately identifiable references:

| Part | Proposed contents | Authority and reuse |
| --- | --- | --- |
| Entry and editor workflow | Inputs: approved Creative Brief, independent working copy, permitted interaction mode, budgets. Discover current capabilities; inspect, plan, edit, check, recover, present. | Agent Bootstrap Guide and live Editor Catalog govern structured operations. Examples never override grants or incompatibility errors. |
| Animation craft | Small prompts about timing, readable poses, continuity, and the loop boundary, tied to the Creative Brief. | Optional advice, not autonomous art direction. Keep this text identical across comparison modes. |
| Interface reference | Named controls and expected visible states for layers, timeline, tools, and playback; dated screenshots or demonstration excerpts where useful. | Identify editor revision, viewport, and host. Re-observe the current UI when an example differs; never assume recorded coordinates still apply. |
| Verification reference | Editable layers and frames, playback at intended scale, preserved original, recoverability, and human review. | Distinguish Render Observations of artwork from screenshots of controls. Use an independent evaluator so unavailable agent observations do not weaken acceptance. |

These are proposed research inputs, not a new glossary or authored skill package.
They reuse the repository's existing Creative Brief, Layer Plan, Timeline Plan,
Render Observation, and Pixel Forge Agent Skill vocabulary.
([Baseline domain model](https://github.com/Flow-Fly/pixel-forge/blob/07bc075b82e040738d696a3b33b702bb810b08a1/CONTEXT.md))

## What the human-reviewed prototype should test

Use the same short guidance, craft reference, starting project, and acceptance
criteria across UI-only, structured-tool-only, and hybrid runs; vary only the
authorized tools and the instructions needed to invoke them. Teach a small
representative edit rather than the final desired animation, so replay cannot
succeed merely by copying the answer. These are recommendations for the later
experiment decision, not a settled evaluation protocol.

Inspect any recorded draft before reuse: replace personal paths, filenames,
project/entity identities, and incidental layout details with inputs; preserve
useful decision points; record tested host and editor versions. Test a new chat
and an independent copy first. A changed panel layout and an unavailable catalog
operation are useful later probes for adaptation and honest failure. Measure
corrections, control mistakes, preserved structure, and owner judgment separately
from execution speed. Keep the craft material fixed if the question is whether
computer use adds value.

Recording is optional for the experiment: manually authored instruction-only
guidance is a documented alternative. A distributable plugin is a later packaging
choice, not a prerequisite for finding out whether the teaching works.
([Build skills](https://learn.chatgpt.com/docs/build-skills))

Verification: primary pages and live planning issues were read; Markdown structure,
linked repository path, and `git diff --check` were checked. This branch changes
one research Markdown file only. Product tests, browser playtests, and actual
skill replay were not run.
