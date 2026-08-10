# Meaningful history and deterministic Activity Groups

**Research date:** 2026-08-04
**Question:** Have visual and pixel-art editors gone beyond a flat undo stack, and what should Pixel Forge infer automatically?

## Conclusion

Yes. Meaningful history has been explored in shipped editors and extensively in HCI research. The useful ideas did not disappear because history was unnecessary. They split into safer, narrower patterns:

- deterministic grouping of similar strokes;
- explicit transaction labels from tools and scripts;
- thumbnails or affected-region previews for recognition;
- user-named snapshots or versions for human meaning;
- selective or regional restoration when the result can be explained.

What has not become a mainstream convention is automatically naming artistic intent. Research prototypes could infer likely **boundaries** between activities, but even specialized Photoshop studies found labels such as “skin smoothing” difficult to infer: similar command sequences can serve different tasks, and the same task can use different commands. A later study could establish human agreement for low-level groups but not for high-level task groupings.

The evidence supports Pixel Forge's revised direction: automatically create honest **Activity Groups**, preserve atomic commands underneath, and reserve names such as “Refine face” for an explicit tool/API transaction or the user's own “Name this moment” label.

## Shipped editor comparison

| Editor | Confirmed history behavior | Meaning beyond a flat stack | Relevant limit |
| --- | --- | --- | --- |
| **Aseprite** | The Undo History window renders each command's explicit label and marks the saved state. Its scripting API can wrap several modifications in one atomic transaction and supply the label shown in Undo History. ([window source](https://github.com/aseprite/aseprite/blob/main/src/app/commands/cmd_undo_history.cpp#L278-L294), [`app.transaction`](https://www.aseprite.org/api/app/#apptransaction)) | Explicitly named transactions are a strong precedent for Pixel Forge tools, plugins, and automation. | The reviewed official behavior exposes command/transaction labels, not automatic descriptions of artistic intent. |
| **Pixelorama** | The current Undo History dialog lists the action names stored in Godot's `UndoRedo`, plus “Initial state,” and moves to a chosen point by applying undo or redo. Product code supplies operator labels such as `Draw`, `Add Frame`, and `Change Layer Opacity`; some continuous property changes use Godot's merge mode. ([dialog source](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/UI/TopMenuContainer/undo_history_dialog.gd), [timeline action examples](https://github.com/Orama-Interactive/Pixelorama/blob/master/src/UI/Timeline/AnimationTimeline.gd)) | Operator labels and selected low-level merging. | No automatic layer/frame activity groups, thumbnails, or inferred task labels were found in the reviewed official dialog and action sources. |
| **Krita** | Its Undo History docker can jump between states. **Cumulative Undo** merges similar strokes using their time separation, a maximum interval, and maximum group duration; it preserves the newest strokes and refuses to merge strokes with different colors, brush presets, or blending modes. ([Krita manual](https://docs.krita.org/en/reference_manual/dockers/undo_history.html)) | This is the closest shipped precedent for deterministic Activity Groups. It groups observable similarities without claiming to know why the artist made them. | Krita's separate Snapshot docker allows user-named session snapshots, but switching discards the undo stack and snapshots disappear when the document closes. ([Snapshot Docker](https://docs.krita.org/en/reference_manual/dockers/snapshot_docker.html)) |
| **GIMP** | The Undo History dialog shows a small visual sketch for every action and lets the user jump to a state. Some repeated low-cost operations, such as layer-visibility changes, are compressed into one history point. ([Undo History dialog](https://docs.gimp.org/3.0/en/gimp-undo-dialog.html), [undo model](https://docs.gimp.org/3.0/en/gimp-concepts-undo.html)) | Visual recognition and conservative operation compression. | History is image-specific, bounded by memory, and not saved in the XCF file. It remains state/action history rather than inferred task history. |
| **Photoshop** | The History panel records changes such as painting, selecting, or rotating as separate session states. It offers manually named snapshots, optional non-linear history, and a History Brush that selectively restores pixels from an earlier state or snapshot. ([History settings](https://helpx.adobe.com/photoshop/desktop/get-started/set-up-toolbars-panels/history-panel-overview.html), [snapshots](https://helpx.adobe.com/photoshop/desktop/get-started/set-up-toolbars-panels/create-work-snapshots.html), [History Brush](https://helpx.adobe.com/photoshop/desktop/get-started/set-up-toolbars-panels/paint-image-states.html)) | User-authored milestones and regional restoration are more meaningful than a bare action label. | States and snapshots are cleared when the document closes. Adobe asks the user to name meaningful snapshots rather than generating artistic task names. |

The market pattern is therefore not “flat history only.” It is **operator truth plus optional recognition and user-authored meaning**.

## What research systems tried

### Adaptive History: direction B has a direct precedent

The 2016 **Data-driven Adaptive History for Image Editing** prototype augmented a familiar Photoshop-style linear list instead of replacing it. It color-coded predicted activity segments, folded repeated command patterns, allowed whole-group undo, supplied thumbnail navigation, and filtered history by selected image region. In the researchers' recorded professional-retoucher sessions, undo, redo, and navigation were about 9% of issued commands, so navigation was not a negligible need. ([original paper](https://people.eecs.berkeley.edu/~bjoern/papers/chen-historylist-i3d2016.pdf))

Its most important result for Pixel Forge is a limit, not a feature. The hypothesis that different retouching tasks would use distinguishable command sets was false. The researchers could predict probable **transition points** using changes in operations, parameters, layers, and location, but automatic task labeling remained difficult because:

- similar command sets were used for different tasks, such as editing eyes and hair;
- different command sets were used for the same task, such as skin smoothing;
- artists disagreed about granularity: one person's “face retouch” could be another person's several smaller tasks.

This is evidence for inferring a boundary while leaving the label factual.

### A broader follow-up confirmed low-level groups, not high-level intent

The 2020 **Data-driven Multi-level Segmentation of Image Editing Logs** study collected realistically complex Photoshop sessions for poster creation, portrait retouching, and special effects. Its model used command, timestamp, layer, image difference, and working-region overlap. Command, time, and layer were useful signals; image content was less useful. The researchers found good agreement between human coders for low-level chunks, but too little agreement to treat high-level chunks as ground truth. ([project and original paper](https://www.cs.ubc.ca/labs/imager/tr/2020/logseg/))

That finding matters more than the choice of machine-learning model. Even humans watching the workflow do not always agree where one high-level creative task ends. Pixel Forge should not turn an uncertain segmentation into an authoritative label.

### Research found better ways to recognize an old action

**Aquamarine** explored selective undo in bitmap painting. Its history used per-operation thumbnails, could filter operations by a selected canvas region, and could highlight the region affected by an operation. Interviews found that artists already used layers, duplicate layers, and saved copies as workarounds for selective undo. Participants preferred thumbnails showing the output of the individual operation, while a separate preview showed the complete state. ([original CHI paper](https://www.cs.cmu.edu/~NatProg/papers/pn2296-myers-preprint.pdf))

For vector artwork, **Interactive Visual Histories** drew storyboard-like depictions of transforms and color changes over the document and supported selective undo. It represented observable edits spatially instead of generating prose about creative intent. ([MIT/Adobe project and paper](https://people.csail.mit.edu/sarasu/pub/mittr09/))

These systems suggest that a changed-region preview may help more than a clever label when many entries say “Brush stroke.”

### Branching is possible, but it is a different product commitment

The 2011 **Nonlinear Revision Control for Images** GIMP prototype stored operations in a directed acyclic graph and supported replay, diff, branching, merging, and conflict resolution. ([Microsoft Research](https://www.microsoft.com/en-us/research/publication/nonlinear-revision-control-for-images-2/)) The 2020 segmentation paper nevertheless reports that its non-linear model was not intuitive for existing Photoshop users. Branching history is therefore technically credible, but it should not be smuggled into a 1.0 history cleanup. It needs its own interaction model and human test.

### Meaningful names work when the human supplies them

Figma combines automatic checkpoints with versions that users can name and describe. Autosaves are grouped, while titles, descriptions, milestone names, and task references remain user-authored. ([Figma version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history)) Photoshop and Krita follow the same principle for snapshots.

This is a useful distinction for Pixel Forge:

- **Activity Group**: automatically derived, deterministic, and factual;
- **Named moment**: explicitly authored by the user or supplied by a trusted tool transaction;
- **Local Recovery checkpoint**: persisted safety state, whether named or not;
- **Cloud Version**: durable cross-device milestone, outside ordinary Undo/Redo.

## Why mainstream tools stop at operator labels

No vendor source reviewed here states a single product-wide reason. The following is an inference from the original research and shipped designs:

1. **Intent is not observable from pixels.** A brush stroke can shade a face, clean an outline, test a color, or draw scenery. The 2016 study found direct evidence that command sequences do not map cleanly to task names.
2. **History is a trust surface.** Users need to predict exactly what Undo will reverse. A plausible but wrong label is worse than `8 brush strokes · Character · Frame 3` because it misrepresents the scope.
3. **High-level granularity is subjective.** The 2020 study could not establish reliable human ground truth for high-level chunks.
4. **Raster edits lack stable objects.** Aquamarine explains that painting operations affect overlapping pixel regions, making dependencies and selective replay harder to explain than object edits.
5. **Familiar linear interaction has value.** Adaptive History deliberately retained the normal list; its authors note usability problems with hierarchical graphs. Mainstream tools add snapshots, thumbnails, compression, or regional restore without forcing users to understand a history graph.
6. **The human already has the missing context.** Figma, Photoshop, and Krita let the user name a milestone instead of manufacturing that meaning.

## Recommendation for Pixel Forge 1.0

### Adopt deterministic Activity Groups

Keep the command stack atomic. Build grouping as a presentation index over consecutive commands, with the following priority:

1. **Explicit transaction:** a core tool, effect, plugin, or Editor API call supplies an honest label and atomic boundary, for example `Apply gradient map`.
2. **Deterministic activity burst:** otherwise, group consecutive operations when the target layer, frame, operation family, and relevant tool parameters match within a short time window.
3. **Fallback mixed group:** if closely related commands share the target but not one operation family, label the group generically, for example `Edited Character · Frame 3 · 8 actions`.
4. **User-authored meaning:** allow “Name this moment” or a bookmark without replacing the factual activity summary underneath.

A conservative initial predicate is:

```text
same layer
+ same frame
+ same operation family
+ compatible color / brush / blend parameters
+ consecutive commands
+ gap <= 5 seconds
+ group duration below a fixed ceiling
= one Activity Group
```

Start a new group on layer or frame changes, structural document operations, explicit transactions, checkpoints, undo/redo branching, or a longer pause. Treat layer as one signal, not a complete task boundary: both Adaptive History studies found it useful but insufficient.

### Generate labels only from recorded facts

Good automatic labels:

- `12 brush strokes · Character · Frame 3`
- `3 eraser strokes · Character · Frame 3`
- `Moved selection · Arm · Frame 1`
- `Changed layer opacity · Highlights`
- `Edited Character · Frame 3 · 8 actions`
- `Local checkpoint · 10:36`

Labels such as `Shade character`, `Adjust pose`, or `Refine face` should appear only when supplied by the user or by an explicit transaction whose caller owns that intent.

### Let the Editor API carry meaning safely

The automation/plugin API should expose a small transaction contract rather than requiring Pixel Forge to reverse-engineer intent:

```ts
await editor.history.transaction(
  { label: "Apply gradient map", target: { layerId, frameId } },
  async () => {
    // Editor commands remain inspectable inside the transaction.
  },
);
```

Transactions should be atomic for Undo, retain their child operations for inspection, reject nesting unless deliberately supported, and roll back on failure. The label is trustworthy because the caller initiating the operation supplies it.

### Add recognition before intelligence

After the grouping model is usable, test a small combined changed-region thumbnail or hover preview. GIMP and Aquamarine show that visual evidence can disambiguate repeated drawing actions without guessing prose. Keep thumbnail generation bounded and lazy so it does not compete with Local Recovery History for the browser's storage budget.

### Do not put these into the 1.0 history slice

- AI-generated creative-intent labels;
- automatic subject detection such as face, pose, or character-part naming;
- cross-layer high-level task inference;
- selective undo whose conflict behavior is not explainable in advance;
- a branching DAG/version-control interface;
- persisted recovery checkpoints hidden inside ordinary Ctrl+Z semantics.

## Decision

Proceed with prototype B as **Activity Groups**, not “semantic history.” The defensible 1.0 promise is:

> Pixel Forge groups related observable actions so history is easier to scan, while the artist remains the authority on what the work means.

This direction is not merely conservative. It combines the best shipped precedent (Krita's deterministic cumulative undo, explicit Aseprite transactions, visual GIMP history, user-named snapshots) with the central lesson from the research prototypes: infer structure, not intent.
