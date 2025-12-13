import { html, css } from "lit";
import { customElement, query } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { BaseComponent } from "../../core/base-component";
import { animationStore, EMPTY_CEL_LINK_ID } from "../../stores/animation";
import { layerStore } from "../../stores/layers";
import { historyStore } from "../../stores/history";
import { SetCelOpacityCommand } from "../../commands/cel-opacity-command";
import type { FrameTag } from "../../types/animation";
import "../ui/pf-context-menu";
import type { PFContextMenu, ContextMenuItem } from "../ui/pf-context-menu";

@customElement("pf-timeline-grid")
export class PFTimelineGrid extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
    }

    .grid-row {
      display: flex;
      height: 32px;
      border-bottom: 1px solid var(--pf-color-border);
    }

    .cel {
      width: 32px;
      height: 100%;
      flex-shrink: 0;
      border-right: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-sizing: border-box;
      position: relative;
    }

    .cel:hover {
      background-color: var(--pf-color-bg-hover);
    }

    .cel.active {
      background-color: var(--pf-color-primary-muted);
      box-shadow: inset 0 0 0 2px var(--pf-color-primary);
    }

    .cel.selected {
      background-color: rgba(74, 158, 255, 0.15);
      box-shadow: inset 0 0 0 2px var(--pf-color-accent, #4a9eff);
    }

    .cel.active.selected {
      background-color: rgba(74, 158, 255, 0.25);
      // box-shadow: inset 0 0 0 2px var(--pf-color-primary), 0 0 0 2px var(--pf-color-accent, #4a9eff);
    }

    .cel-content {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--pf-color-text-muted);
      position: relative;
      z-index: 1;
    }

    .cel.has-content .cel-content {
      background-color: var(--pf-color-text-main);
    }

    /* Tag column tinting - use real element to avoid ::before conflict with link lines */
    .tag-tint {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.12;
      background-color: var(--tag-tint-color);
      z-index: 0;
    }

    /* Tag resize preview tint - shows during drag */
    .resize-preview-tint {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.25;
      background-color: var(--resize-preview-color);
      z-index: 3;
      border: 2px dashed rgba(255, 255, 255, 0.4);
      box-sizing: border-box;
    }

    /* Collapsed tag cell styling */
    .cel.collapsed-tag {
      cursor: pointer;
    }

    .cel.collapsed-tag:hover {
      filter: brightness(1.1);
    }

    .collapsed-tag-block {
      width: 100%;
      height: 100%;
      opacity: 0.6;
    }

    /* Link badge (only for hard links) */
    .link-badge {
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      z-index: 2;
    }

    /* Soft link spanning lines */
    /* Line connecting to next cel (right side) */
    .cel.link-continues-right::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      right: 0;
      height: 2px;
      background-color: var(--link-line-color, var(--pf-color-text-muted));
      transform: translateY(-50%);
      z-index: 1;
    }

    /* Line connecting from previous cel (left side) */
    .cel.link-continues-left::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 0;
      width: 50%;
      height: 2px;
      background-color: var(--link-line-color, var(--pf-color-text-muted));
      transform: translateY(-50%);
      z-index: 1;
    }
  `;

  @query("pf-context-menu") private contextMenu!: PFContextMenu;

  // Track original opacity for undo/redo
  private contextMenuOriginalOpacity: number = 100;

  selectCel(layerId: string, frameId: string, e: MouseEvent) {
    const anchor = animationStore.selectionAnchor.value;

    if (e.shiftKey && anchor) {
      // Range select from anchor to clicked cell
      animationStore.selectCelRange(
        anchor.layerId,
        anchor.frameId,
        layerId,
        frameId
      );
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle individual cell (anchor unchanged)
      animationStore.toggleCel(layerId, frameId);
    } else {
      // Normal click: clear selection, select this cell, set anchor
      animationStore.clearCelSelection();
      animationStore.selectCel(layerId, frameId, false);
      animationStore.setSelectionAnchor(layerId, frameId);
    }

    // Always navigate to clicked cell
    layerStore.setActiveLayer(layerId);
    animationStore.goToFrame(frameId);
  }

  private handleCollapsedTagClick(tag: FrameTag) {
    animationStore.toggleTagCollapsed(tag.id);
  }

  private handleCelContextMenu(e: MouseEvent, celKey: string) {
    e.preventDefault();
    e.stopPropagation();

    const cels = animationStore.cels.value;
    const cel = cels.get(celKey);
    const currentOpacity = cel?.opacity ?? 100;

    // Store for undo/redo
    this.contextMenuOriginalOpacity = currentOpacity;

    const items: ContextMenuItem[] = [
      {
        type: "slider",
        label: "Opacity",
        min: 0,
        max: 100,
        value: currentOpacity,
        unit: "%",
        onSliderChange: (value: number) => {
          // Live preview
          animationStore.setCelOpacity([celKey], value);
        },
        onSliderCommit: (value: number) => {
          // Add to history for undo/redo
          if (value !== this.contextMenuOriginalOpacity) {
            // Restore original, then execute command to record in history
            animationStore.setCelOpacity([celKey], this.contextMenuOriginalOpacity);
            const beforeOpacities = new Map<string, number>();
            beforeOpacities.set(celKey, this.contextMenuOriginalOpacity);
            historyStore.execute(new SetCelOpacityCommand([celKey], beforeOpacities, value));
          }
        }
      }
    ];

    this.contextMenu.show(e.clientX, e.clientY, items);
  }

  /**
   * Get the tag color for a frame index (for column tinting).
   * Returns null if frame is not in any tag.
   */
  private getTagColorForFrame(
    frameIndex: number,
    tags: FrameTag[]
  ): string | null {
    for (const tag of tags) {
      if (
        frameIndex >= tag.startFrameIndex &&
        frameIndex <= tag.endFrameIndex
      ) {
        return tag.color;
      }
    }
    return null;
  }

  /**
   * Check if a frame is within the tag resize preview range.
   * Returns the preview info if in range, null otherwise.
   */
  private getResizePreviewForFrame(
    frameIndex: number,
    tags: FrameTag[]
  ): { inPreview: boolean; color: string | null } {
    const preview = animationStore.tagResizePreview.value;
    if (!preview) return { inPreview: false, color: null };

    if (frameIndex >= preview.previewStart && frameIndex <= preview.previewEnd) {
      const tag = tags.find(t => t.id === preview.tagId);
      return { inPreview: true, color: tag?.color ?? null };
    }
    return { inPreview: false, color: null };
  }

  /**
   * Build a map of frame index to collapsed tag (if any).
   * For collapsed tags, only the first frame should be rendered,
   * subsequent frames in the range are hidden.
   */
  private getFrameRenderInfo(
    tags: FrameTag[],
    totalFrames: number
  ): Map<
    number,
    { tag: FrameTag | null; isFirstOfCollapsed: boolean; isHidden: boolean }
  > {
    const info = new Map<
      number,
      { tag: FrameTag | null; isFirstOfCollapsed: boolean; isHidden: boolean }
    >();

    // Initialize all frames as normal (not hidden, no tag)
    for (let i = 0; i < totalFrames; i++) {
      info.set(i, { tag: null, isFirstOfCollapsed: false, isHidden: false });
    }

    // Mark frames that are in collapsed tags
    for (const tag of tags) {
      if (tag.collapsed) {
        for (let i = tag.startFrameIndex; i <= tag.endFrameIndex; i++) {
          if (i === tag.startFrameIndex) {
            // First frame of collapsed tag is rendered as the collapsed cell
            info.set(i, { tag, isFirstOfCollapsed: true, isHidden: false });
          } else {
            // Other frames in the collapsed tag are hidden
            info.set(i, { tag, isFirstOfCollapsed: false, isHidden: true });
          }
        }
      }
    }

    return info;
  }

  render() {
    const layers = [...layerStore.layers.value].reverse();
    const frames = animationStore.frames.value;
    const currentFrameId = animationStore.currentFrameId.value;
    const activeLayerId = layerStore.activeLayerId.value;
    const cels = animationStore.cels.value;
    const tags = animationStore.tags.value;
    // Read selection signal to trigger re-renders on selection change
    const selectedCels = animationStore.selectedCelKeys.value;

    // Get frame render info (which frames are collapsed/hidden)
    const frameRenderInfo = this.getFrameRenderInfo(tags, frames.length);

    return html`
      ${layers.map(
        (layer) => html`
          <div class="grid-row">
            ${frames.map((frame, frameIndex) => {
              const renderInfo = frameRenderInfo.get(frameIndex);

              // Skip hidden frames (part of a collapsed tag but not the first)
              if (renderInfo?.isHidden) {
                return "";
              }

              // Render collapsed tag cell
              if (renderInfo?.isFirstOfCollapsed && renderInfo.tag) {
                const tag = renderInfo.tag;
                return html`
                  <div
                    class="cel collapsed-tag"
                    @click=${() => this.handleCollapsedTagClick(tag)}
                    title="${tag.name} - Click to expand"
                  >
                    <div
                      class="collapsed-tag-block"
                      style="background-color: ${tag.color};"
                    ></div>
                  </div>
                `;
              }

              // Normal cel rendering
              const key = animationStore.getCelKey(layer.id, frame.id);
              const cel = cels.get(key);
              const isActive =
                layer.id === activeLayerId && frame.id === currentFrameId;
              const isSelected = selectedCels.has(key);
              // Exclude empty cels from linking visualization (they're just a memory optimization)
              const isLinked =
                cel?.linkedCelId != null &&
                cel.linkedCelId !== EMPTY_CEL_LINK_ID;
              const isHardLinked = isLinked && cel?.linkType === "hard";
              const linkColor = isLinked
                ? animationStore.getLinkColor(cel!.linkedCelId!)
                : null;

              // Check link continuity with neighboring frames
              let linkContinuesLeft = false;
              let linkContinuesRight = false;
              if (isLinked && cel?.linkedCelId) {
                // Check previous frame
                if (frameIndex > 0) {
                  const prevFrame = frames[frameIndex - 1];
                  const prevKey = animationStore.getCelKey(
                    layer.id,
                    prevFrame.id
                  );
                  const prevCel = cels.get(prevKey);
                  linkContinuesLeft =
                    prevCel?.linkedCelId === cel.linkedCelId;
                }
                // Check next frame
                if (frameIndex < frames.length - 1) {
                  const nextFrame = frames[frameIndex + 1];
                  const nextKey = animationStore.getCelKey(
                    layer.id,
                    nextFrame.id
                  );
                  const nextCel = cels.get(nextKey);
                  linkContinuesRight =
                    nextCel?.linkedCelId === cel.linkedCelId;
                }
              }

              // Empty cels (sharing transparent canvas) don't have content
              const hasContent =
                !!cel && cel.linkedCelId !== EMPTY_CEL_LINK_ID;
              const tagColor = this.getTagColorForFrame(frameIndex, tags);
              const hasTint = tagColor !== null;

              // Check for resize preview
              const resizePreview = this.getResizePreviewForFrame(frameIndex, tags);
              const hasResizePreview = resizePreview.inPreview;

              const celClasses = {
                cel: true,
                active: isActive,
                selected: isSelected,
                "has-content": hasContent,
                linked: isLinked,
                "hard-linked": isHardLinked,
                "link-continues-left": linkContinuesLeft,
                "link-continues-right": linkContinuesRight,
              };

              // Build style string with link line color
              // Soft links: colorless (same as cel-content dot)
              // Hard links: colored (distinct per link group)
              const effectiveLinkColor = isHardLinked
                ? linkColor
                : "var(--pf-color-text-muted)";
              const styleStr = [
                hasTint ? `--tag-tint-color: ${tagColor}` : "",
                isLinked ? `--link-line-color: ${effectiveLinkColor}` : "",
                hasResizePreview ? `--resize-preview-color: ${resizePreview.color}` : "",
              ]
                .filter(Boolean)
                .join("; ");

              return html`
                <div
                  class=${classMap(celClasses)}
                  style="${styleStr}"
                  @click=${(e: MouseEvent) =>
                    this.selectCel(layer.id, frame.id, e)}
                  @contextmenu=${(e: MouseEvent) =>
                    this.handleCelContextMenu(e, key)}
                >
                  ${hasTint ? html`<div class="tag-tint"></div>` : ""}
                  ${hasResizePreview ? html`<div class="resize-preview-tint"></div>` : ""}
                  <div class="cel-content"></div>
                  ${isHardLinked
                    ? html`<div
                        class="link-badge"
                        style="background-color: ${linkColor}"
                      ></div>`
                    : ""}
                </div>
              `;
            })}
          </div>
        `
      )}
      <pf-context-menu></pf-context-menu>
    `;
  }
}
