/**
 * Tool Groups Configuration
 *
 * Defines how tools are grouped in the toolbar.
 * Right-clicking a group button shows all tools in that group.
 */

import type { ToolType } from './tools';

export interface ToolGroup {
  id: string;
  tools: ToolType[];
  defaultTool: ToolType;
}

/**
 * Toolbar groups - each group appears as one button
 * Right-click to see alternatives within the group
 */
export const toolGroups: ToolGroup[] = [
  {
    id: 'pencil',
    tools: ['pencil'],
    defaultTool: 'pencil',
  },
  {
    id: 'eraser',
    tools: ['eraser'],
    defaultTool: 'eraser',
  },
  {
    id: 'eyedropper',
    tools: ['eyedropper'],
    defaultTool: 'eyedropper',
  },
  {
    id: 'selection',
    tools: ['marquee-rect', 'lasso', 'polygonal-lasso', 'magic-wand'],
    defaultTool: 'marquee-rect',
  },
  {
    id: 'shapes',
    tools: ['rectangle', 'line', 'ellipse'],
    defaultTool: 'rectangle',
  },
  {
    id: 'fill',
    tools: ['fill', 'gradient'],
    defaultTool: 'fill',
  },
  {
    id: 'transform',
    tools: ['transform'],
    defaultTool: 'transform',
  },
  {
    id: 'navigation',
    tools: ['hand', 'zoom'],
    defaultTool: 'hand',
  },
];

/**
 * Map from tool to its group for quick lookup
 */
export const toolToGroup: Map<ToolType, ToolGroup> = new Map();
toolGroups.forEach(group => {
  group.tools.forEach(tool => {
    toolToGroup.set(tool, group);
  });
});

/**
 * Get the group for a given tool
 */
export function getToolGroup(tool: ToolType): ToolGroup | undefined {
  return toolToGroup.get(tool);
}

/**
 * Track the last selected tool per group (for remembering user's preference)
 */
const lastSelectedInGroup: Map<string, ToolType> = new Map();

export function getLastSelectedTool(groupId: string): ToolType | undefined {
  return lastSelectedInGroup.get(groupId);
}

export function setLastSelectedTool(groupId: string, tool: ToolType): void {
  lastSelectedInGroup.set(groupId, tool);
}

/**
 * Get the tool to show for a group (last selected or default)
 */
export function getActiveToolForGroup(group: ToolGroup): ToolType {
  return lastSelectedInGroup.get(group.id) ?? group.defaultTool;
}
