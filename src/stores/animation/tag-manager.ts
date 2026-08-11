/**
 * Frame tag management.
 *
 * Tags define named ranges of frames for:
 * - Loop playback within a range
 * - Visual organization of animation sections
 * - Collapsing groups of frames in the UI
 */

import type { FrameTag } from '../../types/animation';
import { log } from '../../utils/log';

export type TagMutationFailure =
  | 'tag_overlap'
  | 'tag_not_found'
  | 'invalid_range'
  | 'frame_not_in_tag'
  | 'frame_not_at_tag_boundary';

export type TagMutationResult<T> =
  | { readonly ok: true; readonly value: T; readonly tagId?: string }
  | { readonly ok: false; readonly reason: TagMutationFailure };

function cloneFrameTag(tag: FrameTag): FrameTag {
  return { ...tag };
}

/**
 * Check if a range overlaps with any existing tags.
 * Optionally exclude a tag by ID (for updates).
 */
function hasTagOverlap(
  tags: readonly FrameTag[],
  startIndex: number,
  endIndex: number,
  excludeTagId?: string
): boolean {
  return tags.some(tag => {
    if (excludeTagId && tag.id === excludeTagId) return false;
    return startIndex <= tag.endFrameIndex && endIndex >= tag.startFrameIndex;
  });
}

function isValidTagRange(startFrameIndex: number, endFrameIndex: number, frameCount: number): boolean {
  return startFrameIndex >= 0 &&
    endFrameIndex >= startFrameIndex &&
    endFrameIndex < frameCount;
}

/**
 * Pure frame-tag mutations shared by the animation store and project-state seam.
 * These functions never log or mutate the input array.
 */
export function createFrameTagSnapshot(
  tags: readonly FrameTag[],
  name: string,
  color: string,
  startFrameIndex: number,
  endFrameIndex: number,
  frameCount: number,
): TagMutationResult<FrameTag[]> {
  if (!isValidTagRange(startFrameIndex, endFrameIndex, frameCount)) {
    return { ok: false, reason: 'invalid_range' };
  }
  if (hasTagOverlap(tags, startFrameIndex, endFrameIndex)) {
    return { ok: false, reason: 'tag_overlap' };
  }

  const newTag: FrameTag = {
    id: crypto.randomUUID(),
    name,
    color,
    startFrameIndex,
    endFrameIndex,
    collapsed: false,
  };
  return { ok: true, value: [...tags.map(cloneFrameTag), newTag], tagId: newTag.id };
}

/** Update a tag without changing its identity. */
export function updateFrameTagSnapshot(
  tags: readonly FrameTag[],
  tagId: string,
  updates: Partial<Omit<FrameTag, 'id'>>,
  frameCount?: number,
): TagMutationResult<FrameTag[]> {
  const tagIndex = tags.findIndex((tag) => tag.id === tagId);
  if (tagIndex === -1) {
    return { ok: false, reason: 'tag_not_found' };
  }

  const currentTag = tags[tagIndex];
  const newStart = updates.startFrameIndex ?? currentTag.startFrameIndex;
  const newEnd = updates.endFrameIndex ?? currentTag.endFrameIndex;
  if ((updates.startFrameIndex !== undefined || updates.endFrameIndex !== undefined) &&
      frameCount !== undefined &&
      !isValidTagRange(newStart, newEnd, frameCount)) {
    return { ok: false, reason: 'invalid_range' };
  }
  if ((updates.startFrameIndex !== undefined || updates.endFrameIndex !== undefined) &&
      hasTagOverlap(tags, newStart, newEnd, tagId)) {
    return { ok: false, reason: 'tag_overlap' };
  }

  const next = tags.map(cloneFrameTag);
  next[tagIndex] = { ...next[tagIndex], ...updates };
  return { ok: true, value: next };
}

/** Resize a tag while enforcing frame bounds and non-overlap. */
export function resizeFrameTagSnapshot(
  tags: readonly FrameTag[],
  tagId: string,
  startFrameIndex: number,
  endFrameIndex: number,
  frameCount: number,
): TagMutationResult<FrameTag[]> {
  return updateFrameTagSnapshot(
    tags,
    tagId,
    { startFrameIndex, endFrameIndex },
    frameCount,
  );
}

/** Remove one boundary frame from a tag, deleting a one-frame tag. */
export function removeFrameFromTagSnapshot(
  tags: readonly FrameTag[],
  tagId: string,
  frameIndex: number,
): TagMutationResult<FrameTag[]> {
  const tag = tags.find((item) => item.id === tagId);
  if (!tag) {
    return { ok: false, reason: 'tag_not_found' };
  }
  if (frameIndex < tag.startFrameIndex || frameIndex > tag.endFrameIndex) {
    return { ok: false, reason: 'frame_not_in_tag' };
  }
  if (tag.startFrameIndex === tag.endFrameIndex) {
    return { ok: true, value: tags.filter((item) => item.id !== tagId).map(cloneFrameTag) };
  }
  if (frameIndex === tag.startFrameIndex) {
    return updateFrameTagSnapshot(tags, tagId, { startFrameIndex: tag.startFrameIndex + 1 });
  }
  if (frameIndex === tag.endFrameIndex) {
    return updateFrameTagSnapshot(tags, tagId, { endFrameIndex: tag.endFrameIndex - 1 });
  }
  return { ok: false, reason: 'frame_not_at_tag_boundary' };
}

/** Delete a tag while preserving the remaining tag identities. */
export function deleteFrameTagSnapshot(
  tags: readonly FrameTag[],
  tagId: string,
): TagMutationResult<FrameTag[]> {
  if (!tags.some((tag) => tag.id === tagId)) {
    return { ok: false, reason: 'tag_not_found' };
  }
  return { ok: true, value: tags.filter((tag) => tag.id !== tagId).map(cloneFrameTag) };
}

/**
 * Add a new frame tag spanning the given range.
 * Returns null if the range overlaps with an existing tag.
 */
export function addFrameTag(
  tags: FrameTag[],
  name: string,
  color: string,
  startFrameIndex: number,
  endFrameIndex: number,
  frameCount: number = Number.POSITIVE_INFINITY,
): { tags: FrameTag[]; tagId: string | null } {
  const result = createFrameTagSnapshot(
    tags,
    name,
    color,
    startFrameIndex,
    endFrameIndex,
    frameCount,
  );
  if (!result.ok) {
    log.warn(
      result.reason === 'tag_overlap'
        ? 'Cannot create tag: range overlaps with existing tag'
        : 'Cannot create tag: range is invalid',
    );
    return { tags, tagId: null };
  }
  return { tags: result.value, tagId: result.tagId ?? null };
}

/**
 * Update an existing frame tag.
 * Returns false if the new range would overlap with another tag.
 */
export function updateFrameTag(
  tags: FrameTag[],
  tagId: string,
  updates: Partial<Omit<FrameTag, 'id'>>,
  frameCount?: number,
): { tags: FrameTag[]; success: boolean } {
  const result = updateFrameTagSnapshot(tags, tagId, updates, frameCount);
  if (!result.ok) {
    if (result.reason === 'tag_overlap') {
      log.warn('Cannot update tag: new range overlaps with existing tag');
    }
    return { tags: [...tags], success: false };
  }
  return { tags: result.value, success: true };
}

/**
 * Toggle the collapsed state of a tag.
 */
export function toggleTagCollapsed(
  tags: FrameTag[],
  tagId: string
): FrameTag[] {
  const tag = tags.find((item) => item.id === tagId);
  if (!tag) return tags;
  const result = updateFrameTagSnapshot(tags, tagId, { collapsed: !tag.collapsed });
  return result.ok ? result.value : [...tags];
}

/**
 * Remove a frame tag.
 */
export function removeFrameTag(
  tags: FrameTag[],
  tagId: string
): FrameTag[] {
  const result = deleteFrameTagSnapshot(tags, tagId);
  return result.ok ? result.value : [...tags];
}

/**
 * Get tags that include the given frame index.
 */
export function getTagsForFrame(
  tags: FrameTag[],
  frameIndex: number
): FrameTag[] {
  return tags.filter(
    t => frameIndex >= t.startFrameIndex && frameIndex <= t.endFrameIndex
  );
}

/**
 * Adjust tag indices after a frame is inserted.
 */
export function adjustTagsForFrameInsert(
  tags: FrameTag[],
  insertIndex: number
): FrameTag[] {
  return tags.map(tag => {
    const newTag = { ...tag };

    // If inserted before or at tag start, shift both start and end
    if (insertIndex <= tag.startFrameIndex) {
      newTag.startFrameIndex = tag.startFrameIndex + 1;
      newTag.endFrameIndex = tag.endFrameIndex + 1;
    }
    // If inserted within tag, extend the end
    else if (insertIndex <= tag.endFrameIndex) {
      newTag.endFrameIndex = tag.endFrameIndex + 1;
    }

    return newTag;
  });
}

/**
 * Adjust tag indices after a frame is deleted.
 */
export function adjustTagsForFrameDelete(
  tags: FrameTag[],
  deleteIndex: number,
  frameCountAfterDelete: number = Number.POSITIVE_INFINITY,
): FrameTag[] {
  const lastFrameIndex = frameCountAfterDelete - 1;
  return tags
    .map(tag => {
      const newTag = { ...tag };

      // If deleted before tag, shift both start and end down
      if (deleteIndex < tag.startFrameIndex) {
        newTag.startFrameIndex = tag.startFrameIndex - 1;
        newTag.endFrameIndex = tag.endFrameIndex - 1;
      }
      // If deleted within tag, shrink the end
      else if (deleteIndex <= tag.endFrameIndex) {
        newTag.endFrameIndex = Math.max(tag.startFrameIndex, tag.endFrameIndex - 1);
      }

      newTag.startFrameIndex = Math.max(0, newTag.startFrameIndex);
      newTag.endFrameIndex = Math.min(lastFrameIndex, newTag.endFrameIndex);

      return newTag;
    })
    // Remove tags that have become invalid (start > end)
    .filter(tag => tag.startFrameIndex <= tag.endFrameIndex);
}
