/**
 * Frame tag management.
 *
 * Tags define named ranges of frames for:
 * - Loop playback within a range
 * - Visual organization of animation sections
 * - Collapsing groups of frames in the UI
 */

import type { FrameTag } from '../../types/animation';

/**
 * Check if a range overlaps with any existing tags.
 * Optionally exclude a tag by ID (for updates).
 */
export function hasTagOverlap(
  tags: FrameTag[],
  startIndex: number,
  endIndex: number,
  excludeTagId?: string
): boolean {
  return tags.some(tag => {
    if (excludeTagId && tag.id === excludeTagId) return false;
    return startIndex <= tag.endFrameIndex && endIndex >= tag.startFrameIndex;
  });
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
  endFrameIndex: number
): { tags: FrameTag[]; tagId: string | null } {
  if (hasTagOverlap(tags, startFrameIndex, endFrameIndex)) {
    console.warn('Cannot create tag: range overlaps with existing tag');
    return { tags, tagId: null };
  }

  const newTag: FrameTag = {
    id: crypto.randomUUID(),
    name,
    color,
    startFrameIndex,
    endFrameIndex,
    collapsed: false
  };

  return {
    tags: [...tags, newTag],
    tagId: newTag.id
  };
}

/**
 * Update an existing frame tag.
 * Returns false if the new range would overlap with another tag.
 */
export function updateFrameTag(
  tags: FrameTag[],
  tagId: string,
  updates: Partial<Omit<FrameTag, 'id'>>
): { tags: FrameTag[]; success: boolean } {
  const tagIndex = tags.findIndex(t => t.id === tagId);
  if (tagIndex === -1) {
    return { tags, success: false };
  }

  const currentTag = tags[tagIndex];
  const newStart = updates.startFrameIndex ?? currentTag.startFrameIndex;
  const newEnd = updates.endFrameIndex ?? currentTag.endFrameIndex;

  // Check for overlap with other tags (excluding self)
  if (updates.startFrameIndex !== undefined || updates.endFrameIndex !== undefined) {
    if (hasTagOverlap(tags, newStart, newEnd, tagId)) {
      console.warn('Cannot update tag: new range overlaps with existing tag');
      return { tags, success: false };
    }
  }

  const newTags = [...tags];
  newTags[tagIndex] = { ...currentTag, ...updates };

  return { tags: newTags, success: true };
}

/**
 * Toggle the collapsed state of a tag.
 */
export function toggleTagCollapsed(
  tags: FrameTag[],
  tagId: string
): FrameTag[] {
  const tagIndex = tags.findIndex(t => t.id === tagId);
  if (tagIndex === -1) return tags;

  const newTags = [...tags];
  newTags[tagIndex] = { ...tags[tagIndex], collapsed: !tags[tagIndex].collapsed };

  return newTags;
}

/**
 * Remove a frame tag.
 */
export function removeFrameTag(
  tags: FrameTag[],
  tagId: string
): FrameTag[] {
  return tags.filter(t => t.id !== tagId);
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
  deleteIndex: number
): FrameTag[] {
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

      return newTag;
    })
    // Remove tags that have become invalid (start > end)
    .filter(tag => tag.startFrameIndex <= tag.endFrameIndex);
}
