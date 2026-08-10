# Pixel Forge

Pixel Forge is a local-first pixel-art editor for creating static artwork and frame-based sprite animation across desktop and touch-capable devices.

## Editor control

**Editor Command API**:
The semantic contract for observing and changing a project through explicit, undoable editor actions.
_Avoid_: Drawing Control API, tool remote control

**Editor Catalog**:
The machine-readable, versioned source of truth for available commands, observations, Tool Gestures, schemas, capability requirements, limits, and surface availability.
_Avoid_: Toolbar registry, handwritten API inventory, exposed command classes

**Editor Session**:
A caller's bounded access to Workspace Commands and to Project Commands addressed through an explicit Project Target.
_Avoid_: Current editor, active-tab API

**Automation Session**:
A visible, expiring Editor Session granted to one identified automation client for explicit Project Targets, Capability Grants, and an Execution Policy. The user can pause, downgrade, or revoke it from Pixel Forge.
_Avoid_: Account login, background access, invisible agent connection

**Execution Policy**:
The user-selected automation posture: inspect-only, supervised preview and approval, or delegated commits within granted undoable capabilities.
_Avoid_: Capability Grant, model-selected permission, global approval setting

**Capability Grant**:
A project-scoped, session-lived permission that allows an Editor Session to observe or change a bounded editor domain. Destructive workspace actions require separate grants.
_Avoid_: Permanent access, blanket automation permission, per-command prompt

**Creative Content Grant**:
The explicit Automation Session permission to return artwork pixels, rendered previews, references, project names, filenames, or export bytes to a connected client. A local bridge does not imply that a remote model keeps this content on-device.
_Avoid_: Structure-only access, login consent, invisible model egress

**Limit Profile**:
The discoverable finite resource bounds for individual observations, operations, transactions, gestures, and payloads in an Editor Session. It prevents unsafe resource spikes without imposing an arbitrary quota on the session's total actions.
_Avoid_: Feature restriction, session action quota, undocumented limit

**Project Target**:
The stable identity of the project an observation or command addresses, captured before the operation begins rather than resolved from whichever tab is currently active.
_Avoid_: Current project, active project

**Project Revision**:
The monotonic identity of one committed state of a Project Target. Project Commands name the revision they observed and fail rather than silently applying to a different state.
_Avoid_: File version, Cloud Version, latest state

**Project Working State**:
The project-targeted but ephemeral state used to prepare edits, including the selection mask, active colors, chosen tool, and default tool settings. It is not persisted in Session History.
_Avoid_: Project document, view state, global tool state

**Pending Edit**:
A project-targeted, non-destructive staging area for a selection transform or paste. It is bound to observed revisions and changes the document only when committed as one Editor Transaction.
_Avoid_: Floating selection, removed-but-uncommitted pixels, temporary project

**Working Revision**:
The monotonic identity of one Project Working State. Tool Gestures capture it so they cannot silently use a selection or tool configuration that changed after the gesture began.
_Avoid_: Project Revision, history position

**View State**:
Presentation-only editor state such as pan, zoom, hover, cursor, open panels, and layout. It belongs to the browser UI rather than the core Editor Command API.
_Avoid_: Project Working State, project document

**Project Observation**:
An immutable, transport-neutral, bounded description of a Project Target at one Project Revision.
_Avoid_: Store snapshot, live store, canvas reference

**Render Observation**:
A bounded canonical rendering of project content, a selection, or a transaction preview at named revisions. It exposes artwork rather than browser chrome.
_Avoid_: UI screenshot, canvas reference, unbounded pixel dump

**Project Change Event**:
A compact ordered notification that names the Project Revisions and project domains affected by a committed change. Consumers re-observe the bounded state they need.
_Avoid_: State stream, pixel event, store subscription

**Workspace Commands**:
Editor Session actions that manage project lifecycle without changing the contents of an implicitly active project.
_Avoid_: Project Commands

**Project Commands**:
Editor Session actions that observe or change one explicit Project Target.
_Avoid_: Workspace Commands, active-project commands

**Editor Transaction**:
The atomic unit of project mutation. It validates and applies one or more Project Commands as one Project Revision and one Session History entry, or applies none of them.
_Avoid_: Command batch, partial update, nested transaction

**Editor Operation**:
A potentially long-running Editor Session request with a stable identity, observable bounded progress, and exactly one terminal outcome. It may be cooperatively cancelled before its atomic commit point; after commit, reversal belongs to Undo.
_Avoid_: Background job, interruptible commit

**Tool Gesture**:
An ephemeral, semantic use of an interactive editor tool. It receives explicit editor-space samples and settings, may expose bounded previews, and commits as one Editor Transaction or is cancelled without changing the project.
_Avoid_: Pointer simulation, DOM gesture, partial stroke command

**Transaction Preview**:
A non-committing evaluation of an Editor Transaction against one Project Revision. It may be committed only while that revision remains current.
_Avoid_: Draft project, temporary save, committed change

**Editor Error**:
A stable machine-readable failure returned by the Editor Command API with a code, retry guidance, and bounded safe details.
_Avoid_: Exception text, toast message, internal stack trace

**Automation Adapter**:
A privileged client of the Editor Command API used by tests and agent-controlled workflows to operate and observe the supported editor surface.
_Avoid_: Plugin API, DOM automation

**Local Automation Bridge**:
The first LLM transport: a locally paired MCP process that connects an agent client to an active browser or installed Pixel Forge session without making cloud infrastructure or account login a prerequisite.
_Avoid_: Public editor endpoint, pointer automation, remote relay

**Remote Automation Relay**:
A later authenticated MCP transport that relays scoped commands to an explicitly connected browser session. Account authentication does not replace the session's project-specific Capability Grants.
_Avoid_: Logged-in blanket access, server-side project mutation

**Pixel Forge Agent Skill**:
A thin, catalog-driven workflow guide that teaches an LLM to work with pixel-art practice and to combine, verify, and recover from Pixel Forge MCP operations without duplicating the live Editor Catalog.
_Avoid_: API specification, command inventory, transport implementation, autonomous art direction

**Artist Mode**:
The Pixel Forge Agent Skill workflow for creative editing. It establishes proportional art direction, targets layers and frames explicitly, and evaluates work at intended nearest-neighbor display scales while leaving consequential aesthetic choices to the user.
_Avoid_: Conformance fixture, autonomous taste, zoom-only evaluation

**Creative Brief**:
The concise user-owned intent for an Artist Mode task, including the asset's purpose, style constraints, palette expectations, and intended display scale.
_Avoid_: Generated artistic intent, implementation plan

**Layer Plan**:
The proportional organization of visual responsibilities across explicitly named and targeted layers for an Artist Mode task.
_Avoid_: Active-layer assumption, layer-per-command fragmentation

**Timeline Plan**:
The intended animation structure for an Artist Mode task, including key poses, frame order, durations, holds, loop boundaries, and tags where applicable.
_Avoid_: Accidental frame duplication, unplanned in-betweening

**Golden Automation Journey**:
The canonical end-to-end conformance scenario in which the Automation Adapter creates, edits, animates, inspects, previews, commits, undoes, reloads, and exports a deterministic project through the same editor behavior used by the built-in UI.
_Avoid_: Smoke test, pointer-driven end-to-end test

**Conformance Fixture**:
A deterministic proof that one supported editor behavior can be invoked and observed through the Editor Command API, including its meaningful settings and failure cases. Stable API 1.0 requires coverage for every supported project-changing behavior.
_Avoid_: Implementation unit test, UI snapshot

**Fixture Session**:
An isolated deterministic Editor Session that uses the real catalog, validation, algorithms, transactions, observations, and errors while replacing only environmental dependencies such as time, identifiers, storage, clipboard, and file destinations.
_Avoid_: Mock editor, fixture-only command, validation bypass

**Plugin API**:
The version-negotiated, permission-limited public subset of stabilized Editor Catalog operations and extension points. It never exposes editor stores or browser internals.
_Avoid_: Automation API, internal command classes, experimental catalog

## History and recovery

**Local Project Library**:
The device-local collection of saved working projects. The free product limits this library to 100 MB so users can see and manage artwork that remains vulnerable to browser-data deletion; paid users are governed by browser capacity rather than this product limit.
_Avoid_: Local Recovery History, cloud quota, browser cache

**Project Library Usage**:
The unique content bytes and manifest metadata referenced by the latest saved local projects. Identical content is counted once within the device. It excludes Local Recovery History, regenerable caches and thumbnails, application data, and temporary atomic-save overhead.
_Avoid_: IndexedDB origin usage, recovery budget, browser quota estimate

**Content Blob**:
Immutable creative bytes addressed by their canonical content hash and shared by manifests within one device or one account. Cross-account deduplication is outside the contract.
_Avoid_: Public object, project file, cross-user shared blob

**Safety Overflow**:
A small temporary exception that lets Pixel Forge preserve an already-committed edit when the free Project Library Usage crosses its hard limit. It blocks further size growth and is not advertised as additional capacity.
_Avoid_: Bonus storage, silent quota increase, failed autosave

**Managed Over-Limit State**:
The non-destructive state entered when a former paid user's local library exceeds the free 100 MB allowance. Existing projects remain openable, editable without further size growth, exportable, and removable, while new projects, imports, duplication, and size-growing changes wait until usage is reduced or Paid Sync resumes.
_Avoid_: Downgrade deletion, forced project choice, hidden grace quota

**Save Safety State**:
The visible status of whether the current Project Revision is durably saved. A failed local write keeps the project dirty and exposes retry and rescue export rather than relying on a log entry.
_Avoid_: Console error, optimistic saved badge, silent failure

**Paid Sync**:
The subscription entitlement that synchronizes projects and their current revisions across devices. Free users remain local-only rather than receiving a smaller synchronization allowance.
_Avoid_: Free sync quota, local autosave, Cloud Version History

**Conflict Copy**:
A new Project Target created when two devices advance the same synchronized project from different Cloud Revisions. Both states are preserved and no pixel merge or last-write-wins overwrite occurs.
_Avoid_: Conflict winner, automatic merge, overwritten branch

**Cloud Project Storage**:
The 1 GB server-enforced allowance for unique content bytes and manifest metadata referenced by the current synchronized heads of a paid user's projects. Project count is not limited, and Cloud Version History follows a separate retention contract.
_Avoid_: Unlimited bytes, local library quota, version-history storage

**Frozen Cloud Library**:
The read-only synchronized project heads and Cloud Versions retained after Paid Sync ends. Users may inspect and export them, but new uploads and versions require an active entitlement.
_Avoid_: Deleted account, free synchronization, billing purge queue

**Cloud Trash**:
The tombstone state for a deleted synchronized project. Each trashed project remains restorable for 30 days, continues counting against cloud allowances during that window, and is permanently deleted when its own recovery window expires unless the user deletes it sooner.
_Avoid_: Permanent archive, immediate blob deletion, one account-wide expiry date

**Account Erasure**:
The verified, explicitly confirmed deletion of a user's account and cloud data after a 7-day cancellation window. Pixel Forge offers a complete export before scheduling it, then removes cloud manifests and account metadata and garbage-collects unreferenced content; subscription cancellation never initiates this process.
_Avoid_: Subscription cancellation, downgrade cleanup, immediate accidental deletion

**Activity Group**:
A deterministic presentation grouping of consecutive Session History entries using observable transaction metadata. It does not change the atomic Undo boundary or invent artistic intent.
_Avoid_: Semantic guess, hidden macro command, recovery checkpoint

**Transaction Provenance**:
Immutable history metadata identifying whether a transaction came from the user, an automation client, a plugin, or the editor itself, together with the responsible client or session identity where applicable.
_Avoid_: Editable AI badge, inferred authorship, artistic-intent label

**Automation Activity**:
An Activity Group that visibly identifies AI-assisted work and coherently groups the transactions belonging to one explicit automation operation or task while preserving each conventional Undo step.
_Avoid_: Unmarked AI edit, one giant Undo command, time-only grouping

**Automation Recovery Checkpoint**:
The single Local Recovery History checkpoint created before the first document write of an Automation Activity so the pre-automation project remains recoverable after reload.
_Avoid_: Per-command snapshot, Undo entry, paid cloud version

**Session History**:
The bounded in-memory sequence that supports conventional undo and redo during one editing session.
_Avoid_: Version history

**Local Recovery History**:
A free device-wide 50 MB rolling set of automatic persisted checkpoints used to recover recent work on the current device. Checkpoints are created from successfully saved revisions and evicted by byte pressure.
_Avoid_: Undo history, cloud history

**Recovery Checkpoint**:
An automatic restorable copy of a successfully saved Project Revision, created periodically during active work or before a high-risk operation. It is deduplicated, byte-budgeted, and not a manually pinned version.
_Avoid_: Undo entry, manual archive, Cloud Version

**Recovery Copy**:
A new Project Target created from a Recovery Checkpoint. Restoring local recovery never overwrites the current project in place.
_Avoid_: Rollback, replacement restore, history rewind

**Cloud Version History**:
The paid, durable sequence of synchronized project versions that can be inspected or restored across devices. Versions are guaranteed before high-risk transitions; the periodic capture cadence remains an evidence gate until beta storage growth and deduplication data establish a useful frequency.
_Avoid_: Undo history, local recovery

**Cloud Restore**:
The forward-only operation that restores a selected Cloud Version by publishing it as a new synchronized Project Revision. Previewing never mutates the project; opening as a copy creates a new Project Target; restoring in place first preserves the current state and is blocked when that state cannot be preserved safely.
_Avoid_: Revision rewind, destructive rollback, preview-as-mutation

**Cloud Version Storage**:
The initial 2 GB account-wide allowance for unique Content Blobs referenced only by retained Cloud Versions. Versions do not expire by age; creation pauses at capacity rather than deleting older versions automatically. The allowance is reviewed from aggregate storage evidence.
_Avoid_: Current project quota, time-based expiry, automatic oldest-version deletion

## Platform

**Community Logo Submission**:
An explicitly submitted, immutable artwork snapshot proposed for use as a rotating Pixel Forge 1.0 brand mark. A simple `[pf-logo]-[logo-name]` project name may reveal the submission action, but never uploads or publishes artwork; structured submission metadata carries the public artist name and optional profile links independently of the project name. Valid artwork sizes are 16×16, 32×32, and 64×64, and every signed-in user may submit regardless of payment status.
_Avoid_: Filename-encoded attribution, filename-triggered upload, live project reference, implicit publication consent

**Community Logo Variant**:
A standardized 16×16, 32×32, or 64×64 rendition belonging to one immutable Community Logo Submission. A submission may originate at any accepted size; Pixel Forge preserves that original and deterministically scales it down for smaller supported slots without requiring separately authored renditions.
_Avoid_: Unsupported dimensions, independent uncredited artwork, required hand-authored downscale

**Community Logo Review**:
The private editorial moderation state between submission and rotation eligibility. Automated checks validate objective asset and metadata requirements; a Pixel Forge moderator evaluates authorship and rights, 16×16 readability across supported themes, safety, technical validity, third-party brand or character use, and suitability as a Pixel Forge mark, then approves or rejects with a reason. AI-assisted artwork is eligible without a separate public category. An account may have one pending submission at a time, with no lifetime contribution limit; accepted artwork remains reportable and withdrawable.
_Avoid_: Automatic publication, public voting queue, silent rejection

**Community Logo Credit**:
The public attribution associated with an accepted Community Logo Submission: a required artist display name and optional structured social or profile links that may be corrected independently of the immutable artwork snapshot.
_Avoid_: Private account identity, attribution parsed from project name, baked-in credit text

**Community Logo Permission**:
The narrow, non-exclusive permission granted by an artist who retains copyright in an accepted logo. It covers display of the immutable snapshot in explicitly named Pixel Forge product surfaces and its credit gallery; marketing and store use require separate consent, and withdrawal stops future rotation without attempting to recall historical releases or screenshots.
_Avoid_: Copyright transfer, public Creative Commons license, perpetual undisclosed marketing consent

**Community Logo Surface**:
An in-product brand slot or credit/detail view where approved community artwork may appear. Browser favicons, installed-app icons, store assets, and the canonical Pixel Forge identity remain stable rather than participating in rotation.
_Avoid_: Random store icon, rotating favicon, replacement trademark

**Brand Mark Preference**:
The user's choice between rotating approved Community Logo Submissions, retaining the canonical Pixel Forge mark, or pinning one approved logo. A future private-project mark is a separate local personalization capability with its own asset-lifecycle contract.
_Avoid_: Mandatory rotation, public submission as customization, missing-logo failure

**Community Logo Rotation**:
The per-device shuffle bag that selects one approved logo for a fresh app session, exposes every eligible logo before repeating, and avoids the immediately previous selection. Its catalog is cached for offline startup and falls back to the canonical mark when no valid community asset is available. The canonical mark remains the default until at least five approved logos exist; rotation then becomes the explained, user-disableable default.
_Avoid_: Mid-session logo changes, unconstrained random selection, network-dependent startup

**Tutorial Track**:
An independently resumable, skippable, and replayable interactive Learning Center guide that teaches one coherent creative outcome in the real editor without touching an existing project. Pixel Forge 1.0 includes Editor Basics, First Animation, and Community Logo tracks.
_Avoid_: One monolithic walkthrough, passive feature tour, tutorial over user artwork

**Learning Center**:
The searchable, offline-available, versioned documentation and guided-learning section that combines written reference material with optional Tutorial Tracks, prepared projects, meaningful milestone detection, and independent progress. It is accessible from anywhere through the Learning Center Modal, global search, and contextual Learn links, and it uses easy-to-understand tool demonstrations. Starting or resuming hands-on work moves the active guide into the optional Guide Companion. First launch suggests Editor Basics without locking other guides, and future features extend the same content system rather than adding bespoke tutorial UI.
_Avoid_: Mandatory first-run gate, separate tutorial application, hard-coded walkthrough per feature

**Learning Center Modal**:
The globally available, accessible surface for browsing, searching, reading, and watching tool demonstrations without navigating away from the current project. Opening a contextual Learn link targets a stable guide heading and never mutates editor state.
_Avoid_: Route-only documentation, work-interrupting popup, modal that edits the project

**Guide Companion**:
The optional right-sidebar panel used while actively completing a Tutorial Track. It keeps the current milestone, compact demonstration, progress, and guide actions beside the real editor, can be closed immediately, and can be restored through View → Learning Center. Browsing and searching remain in the Learning Center Modal rather than expanding the companion into a second documentation library.
_Avoid_: Mandatory persistent panel, floating coach, full guide library in the workspace, hidden restore path

**Guide Progression**:
The user-controlled transition between Tutorial Track milestones. When the editor proves the current milestone, the Guide Companion immediately marks it complete and reveals Continue, but it does not replace the current instructions until the user chooses to proceed. Closing, pausing, or reopening the companion preserves that state.
_Avoid_: Surprise auto-advance, timer-based completion, losing a completed milestone before Continue

**Guide Milestone**:
A stable, versioned completion rule for one Tutorial Track step. Outcome milestones accept any editor state that satisfies the intended result, while technique milestones require evidence that the specifically taught Editor Command was used. Milestones observe the Tutorial Project through its ProjectContext and never require an exact pixel match unless the exercise explicitly defines one.
_Avoid_: CSS-selector tour step, one mandatory action sequence, accidental completion from another project, creativity graded against a hidden bitmap

**Practice Scaffold**:
An optional raster-exercise aid that a Tutorial Track may offer for one milestone. It may reuse Guided Drawing patterns such as target preview, numbered or visual overlays, derived coverage, and safe user-controlled finishing, but it does not turn the Tutorial Project into a Guided Drawing session or inherit its palette, layer, canvas, or timeline restrictions. Free-form work remains the default.
_Avoid_: Mandatory tracing, tutorial-wide structural lock, hidden exact-image grading, separate disposable canvas

**Guidance Target Path**:
A stable semantic path from an editor container to the control taught by a Guide Milestone. When a step becomes active, cooperating menus, panels, popovers, and Shadow DOM components automatically reveal the path and apply a restrained highlight without moving focus or invoking the action. Guide content names semantic target identifiers rather than DOM selectors.
_Avoid_: Show-me confirmation, global querySelector traversal, forced click, focus theft, CSS-class contract

**Guidance Reveal State**:
Ephemeral UI state owned by the active Guide Milestone that records which target-path ancestors the guide revealed. It is removed when the step changes, pauses, or ends, restores only guide-owned changes, never persists as a workspace preference, and yields immediately when the user manually changes the same surface.
_Avoid_: Persistent tutorial layout mutation, restoring over user input, guide repeatedly reopening a dismissed surface

**Guidance Highlight**:
The accessible attention state applied to the active Guidance Target Path: a persistent high-contrast outline that does not depend on color alone, optionally introduced by one restrained non-repeating pulse. Reduced-motion preferences suppress the pulse, and a polite live-region message communicates the target and instruction without moving keyboard or screen-reader focus.
_Avoid_: Repeating animation, flashing, focus theft, color-only cue, visual-only instruction

**Learning Guide Source**:
Version-controlled Markdown with validated front matter and constrained interactive directives, compiled at build time into an offline guide manifest and search index. Interactive steps name stable Editor Command API milestones rather than CSS selectors or arbitrary executable content.
_Avoid_: Runtime remote HTML, selector-driven tour, JavaScript embedded in documentation

**Learning Demonstration**:
A deterministic, replayable tool or workflow animation declared in guide source through a constrained script of stable editor commands and rendered against an isolated disposable fixture, never the current ProjectContext. Build validation rejects unknown commands or Guidance Target Paths; the compiled result remains available offline, and reduced-motion presentation uses a static sequence of meaningful states.
_Avoid_: User-project mutation, arbitrary executable guide code, manually drifting GIF, animation-only explanation

**Learning Progress**:
The local record of stable guide and milestone identifiers, content version, completion, and associated Tutorial Project. Compatible guide updates migrate matching milestones; major rewrites may offer replay but never revoke earned completion, erase an achievement, or discard the user's project.
_Avoid_: Scroll-position completion, version-reset badge, tutorial-content ownership of artwork

**Tutorial Telemetry**:
The privacy-bounded product milestones `tutorial_started`, `tutorial_completed`, and `tutorial_skipped`, carrying only a closed stable `tutorialId` for Editor Basics, First Animation, or Community Logo. Skipped means an explicit skip action; closing, pausing, replaying, restarting, or abandoning a session emits no skip event. No milestone, duration, project, artwork, account, or interaction data is collected.
_Avoid_: Step analytics, inferred abandonment, free-form guide identifier, project linkage, once-per-page loss across different tutorials

**Tutorial Project**:
A normal autosaved Project Target created for a Tutorial Track and marked with its tutorial origin. It receives ordinary save, recovery, export, quota, and never-silently-discard protections, appears in both the Learning Center and Project Library, and is never overwritten by restarting a track without explicit confirmation.
_Avoid_: Disposable sandbox, quota-free hidden project, tutorial reset overwrite

**Editor Basics Tutorial**:
The Tutorial Track that teaches one complete static-art workflow through a small real project: zoom and pan; pencil and eraser; primary and secondary colors and eyedropper; fill; Undo and Redo; selection and move; layer creation, ordering, and visibility; save; and PNG export. Advanced tools remain later contextual or optional lessons.
_Avoid_: Complete tool reference, animation lesson, empty tooltip sequence

**First Animation Tutorial**:
The Tutorial Track that creates a four-frame bouncing sprite with one continuous background layer and one animated subject layer, teaching frame and cel duplication and editing, onion skinning, one duration adjustment, loop preview, and GIF export.
_Avoid_: Keyframe course, passive timeline tour, advanced animation curriculum

**Logo Tutorial Challenge**:
The optional Tutorial Track that creates a prepared `[pf-logo]-untitled` project at an accepted logo size and teaches the Community Logo Submission constraints. Its lesson completes when the user creates a technically valid logo; its separate Community Logo Achievement is granted only after moderation approves and publishes an explicitly submitted snapshot.
_Avoid_: Mandatory contribution, approval-as-learning gate, hidden upload

**Community Logo Achievement**:
The approval-based milestone awarded when a Logo Tutorial Challenge submission is accepted and published. Pending work appears as Under Review; rejection appears as Needs Revision with the moderator's reason rather than erasing lesson completion.
_Avoid_: Submission badge, tutorial completion, automatic publication reward

**Logo-Matched Accent**:
An explicit accent-theme mode that derives a session-stable rest, hover, and active palette from the current community logo's dominant non-transparent color. It validates every required contrast role and falls back to the canonical accent when no safe palette can be produced; it never silently overrides another chosen theme.
_Avoid_: Unvalidated sampled color, per-view accent churn, mandatory logo theming

**Complete Editor**:
The supported creation surface on desktop browsers, the installed PWA, and tablets, including drawing, animation, project safety, and export.
_Avoid_: Desktop parity

**Phone Editor**:
The focused phone surface for project access, preview, and bounded edits without promising the complete editor workspace.
_Avoid_: Compressed desktop editor
