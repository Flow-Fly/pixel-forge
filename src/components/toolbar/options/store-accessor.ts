/**
 * Store Accessor Utility
 *
 * Provides a unified way to read and write tool options from different stores.
 */

import { brushStore } from "../../../stores/brush";
import {
  eraserSettings,
  magicWandSettings,
  shapeSettings,
  fillSettings,
  gradientSettings,
  textSettings,
  toolSizes,
  type EraserMode,
} from "../../../stores/tool-settings";
import type { ToolOption } from "../../../types/tool-meta";

export type StoreType = ToolOption["store"];

/**
 * Get the current value for a tool option from its store
 */
export function getOptionValue(store: StoreType, storeKey: string): unknown {
  switch (store) {
    case "brush":
      return brushStore.activeBrush.value[storeKey as keyof typeof brushStore.activeBrush.value];

    case "magicWand":
      if (storeKey === "tolerance") return magicWandSettings.tolerance.value;
      if (storeKey === "contiguous") return magicWandSettings.contiguous.value;
      if (storeKey === "diagonal") return magicWandSettings.diagonal.value;
      return undefined;

    case "eraser":
      if (storeKey === "mode") return eraserSettings.mode.value;
      // Eraser also uses brush store for size/pixelPerfect
      return brushStore.activeBrush.value[storeKey as keyof typeof brushStore.activeBrush.value];

    case "shape":
      if (storeKey === "fill") return shapeSettings.fill.value;
      if (storeKey === "thickness") return shapeSettings.thickness.value;
      return undefined;

    case "fill":
      if (storeKey === "contiguous") return fillSettings.contiguous.value;
      return undefined;

    case "gradient":
      if (storeKey === "type") return gradientSettings.type.value;
      return undefined;

    case "toolSizes":
      if (storeKey === "pencil") return toolSizes.pencil.value;
      if (storeKey === "eraser") return toolSizes.eraser.value;
      return undefined;

    case "text":
      if (storeKey === "font") return textSettings.font.value;
      if (storeKey === "color") return textSettings.color.value;
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Set a value for a tool option in its store
 */
export function setOptionValue(store: StoreType, storeKey: string, value: unknown): void {
  switch (store) {
    case "brush":
      brushStore.updateActiveBrushSettings({ [storeKey]: value });
      break;

    case "magicWand":
      if (storeKey === "tolerance") magicWandSettings.tolerance.value = value as number;
      else if (storeKey === "contiguous") magicWandSettings.contiguous.value = value as boolean;
      else if (storeKey === "diagonal") magicWandSettings.diagonal.value = value as boolean;
      break;

    case "eraser":
      if (storeKey === "mode") {
        eraserSettings.mode.value = value as EraserMode;
      } else {
        // Eraser also uses brush store for size/pixelPerfect
        brushStore.updateActiveBrushSettings({ [storeKey]: value });
      }
      break;

    case "shape":
      if (storeKey === "fill") shapeSettings.fill.value = value as boolean;
      else if (storeKey === "thickness") shapeSettings.thickness.value = value as number;
      break;

    case "fill":
      if (storeKey === "contiguous") fillSettings.contiguous.value = value as boolean;
      break;

    case "gradient":
      if (storeKey === "type") gradientSettings.type.value = value as "linear" | "radial";
      break;

    case "toolSizes":
      if (storeKey === "pencil") toolSizes.pencil.value = value as number;
      else if (storeKey === "eraser") toolSizes.eraser.value = value as number;
      break;

    case "text":
      if (storeKey === "font") textSettings.font.value = value as string;
      else if (storeKey === "color") textSettings.color.value = value as string;
      break;
  }
}
