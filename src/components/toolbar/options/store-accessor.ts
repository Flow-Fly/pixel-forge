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
} from "../../../stores/tool-settings";
import type { ToolOption } from "../../../types/tool-meta";

export type StoreType = ToolOption["store"];

/**
 * Options backed by a plain signal, keyed by store and option key.
 * The brush and eraser stores need special handling and are not listed here.
 */
const signalOptions: Partial<Record<StoreType, Record<string, { value: unknown }>>> = {
  magicWand: {
    tolerance: magicWandSettings.tolerance,
    contiguous: magicWandSettings.contiguous,
    diagonal: magicWandSettings.diagonal,
  },
  shape: {
    fill: shapeSettings.fill,
    thickness: shapeSettings.thickness,
  },
  fill: {
    contiguous: fillSettings.contiguous,
  },
  gradient: {
    type: gradientSettings.type,
  },
  toolSizes: {
    pencil: toolSizes.pencil,
    eraser: toolSizes.eraser,
  },
  text: {
    font: textSettings.font,
    color: textSettings.color,
  },
};

/** Eraser mode lives in eraserSettings; everything else brush-backed. */
function isBrushBacked(store: StoreType): store is "brush" | "eraser" {
  return store === "brush" || store === "eraser";
}

function readActiveBrushValue(storeKey: string): unknown {
  return brushStore.activeBrush.value[storeKey as keyof typeof brushStore.activeBrush.value];
}

function getBrushBackedValue(store: "brush" | "eraser", storeKey: string): unknown {
  return store === "eraser"
    ? getEraserBackedValue(storeKey)
    : getBrushOptionValue(storeKey);
}

function getEraserBackedValue(storeKey: string): unknown {
  // Eraser mode has its own signal; size/pixelPerfect are brush-backed
  return storeKey === "mode" ? eraserSettings.mode.value : readActiveBrushValue(storeKey);
}

function getBrushOptionValue(storeKey: string): unknown {
  if (storeKey === "spacing") {
    // Convert BrushSpacing to string for select component
    const spacing = brushStore.activeBrush.value.spacing;
    return spacing === "match" ? "match" : String(spacing);
  }
  return readActiveBrushValue(storeKey);
}

function setBrushBackedValue(store: "brush" | "eraser", storeKey: string, value: unknown): void {
  if (store === "eraser") {
    setEraserBackedValue(storeKey, value);
    return;
  }
  setBrushOptionValue(storeKey, value);
}

function setEraserBackedValue(storeKey: string, value: unknown): void {
  if (storeKey === "mode") {
    eraserSettings.mode.value = value as typeof eraserSettings.mode.value;
    return;
  }
  brushStore.updateActiveBrushSettings({ [storeKey]: value });
}

function setBrushOptionValue(storeKey: string, value: unknown): void {
  if (storeKey === "spacing") {
    // Convert string to BrushSpacing
    const spacing = value === "match" ? "match" : parseInt(value as string, 10);
    brushStore.updateActiveBrushSettings({ spacing });
    return;
  }
  brushStore.updateActiveBrushSettings({ [storeKey]: value });
}

/**
 * Get the current value for a tool option from its store
 */
export function getOptionValue(store: StoreType, storeKey: string): unknown {
  if (isBrushBacked(store)) {
    return getBrushBackedValue(store, storeKey);
  }
  return signalOptions[store]?.[storeKey]?.value;
}

/**
 * Set a value for a tool option in its store
 */
export function setOptionValue(store: StoreType, storeKey: string, value: unknown): void {
  if (isBrushBacked(store)) {
    setBrushBackedValue(store, storeKey, value);
    return;
  }
  const option = signalOptions[store]?.[storeKey];
  if (option) {
    option.value = value;
  }
}
