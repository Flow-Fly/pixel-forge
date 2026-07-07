/**
 * Settings Store
 *
 * User preferences and UI customization settings.
 */
import { signal } from "../core/signal";
import { hexToRgb } from "./palette/color-utils";
import { log } from "../utils/log";

// Predefined accent color themes
export const ACCENT_THEMES = {
  ember: {
    name: "Ember",
    rest: "#c8ad7f",
    hover: "#f0d5a1",
    active: "#927047",
  },
  ocean: {
    name: "Ocean",
    rest: "#0ea5e9",
    hover: "#38bdf8",
    active: "#0284c7",
  },
  forest: {
    name: "Forest",
    rest: "#22c55e",
    hover: "#4ade80",
    active: "#16a34a",
  },
  violet: {
    name: "Violet",
    rest: "#a855f7",
    hover: "#c084fc",
    active: "#9333ea",
  },
  rose: {
    name: "Rose",
    rest: "#f43f5e",
    hover: "#fb7185",
    active: "#e11d48",
  },
  slate: {
    name: "Slate",
    rest: "#64748b",
    hover: "#94a3b8",
    active: "#475569",
  },
} as const;

export type AccentTheme = keyof typeof ACCENT_THEMES;

const STORAGE_KEY = "pf-settings";
export const CHECKER_TILE_SIZE_MIN = 2;
export const CHECKER_TILE_SIZE_MAX = 64;
export const DEFAULT_CHECKER_SETTINGS = {
  lightColor: "#2a3340",
  darkColor: "#151a21",
  tileSize: 8,
} as const;

interface CheckerSettings {
  lightColor: string;
  darkColor: string;
  tileSize: number;
}

interface SavedSettingsData {
  accentTheme?: AccentTheme;
  checkerLightColor?: string;
  checkerDarkColor?: string;
  checkerTileSize?: number;
}

class SettingsStore {
  accentTheme = signal<AccentTheme>("ember");
  checkerLightColor = signal<string>(DEFAULT_CHECKER_SETTINGS.lightColor);
  checkerDarkColor = signal<string>(DEFAULT_CHECKER_SETTINGS.darkColor);
  checkerTileSize = signal<number>(DEFAULT_CHECKER_SETTINGS.tileSize);

  constructor() {
    this.load();
    this.applyAccentTheme(this.accentTheme.value);
    this.applyCheckerSettings();
  }

  private load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as SavedSettingsData | null;
        if (!data || typeof data !== "object") {
          return;
        }

        if (data.accentTheme && ACCENT_THEMES[data.accentTheme]) {
          this.accentTheme.value = data.accentTheme;
        }
        if (this.isHexColor(data.checkerLightColor)) {
          this.checkerLightColor.value = data.checkerLightColor.toLowerCase();
        }
        if (this.isHexColor(data.checkerDarkColor)) {
          this.checkerDarkColor.value = data.checkerDarkColor.toLowerCase();
        }
        if (this.isCheckerTileSize(data.checkerTileSize)) {
          this.checkerTileSize.value = data.checkerTileSize;
        }
      }
    } catch (e) {
      log.warn("Failed to load settings:", e);
    }
  }

  private save() {
    try {
      const data: SavedSettingsData = {
        accentTheme: this.accentTheme.value,
        checkerLightColor: this.checkerLightColor.value,
        checkerDarkColor: this.checkerDarkColor.value,
        checkerTileSize: this.checkerTileSize.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      log.warn("Failed to save settings:", e);
    }
  }

  setAccentTheme(theme: AccentTheme) {
    if (ACCENT_THEMES[theme]) {
      this.accentTheme.value = theme;
      this.applyAccentTheme(theme);
      this.save();
    }
  }

  setCheckerSettings(settings: CheckerSettings) {
    if (
      !this.isHexColor(settings.lightColor) ||
      !this.isHexColor(settings.darkColor) ||
      !this.isCheckerTileSize(settings.tileSize)
    ) {
      return;
    }

    this.checkerLightColor.value = settings.lightColor.toLowerCase();
    this.checkerDarkColor.value = settings.darkColor.toLowerCase();
    this.checkerTileSize.value = settings.tileSize;
    this.applyCheckerSettings();
    this.save();
  }

  private applyCheckerSettings() {
    const root = document.documentElement;

    root.style.setProperty("--pf-checker-light-color", this.checkerLightColor.value);
    root.style.setProperty("--pf-checker-dark-color", this.checkerDarkColor.value);
    root.style.setProperty("--pf-checker-tile-size", `${this.checkerTileSize.value}px`);
  }

  /**
   * Apply accent theme to CSS custom properties
   */
  private applyAccentTheme(theme: AccentTheme) {
    const colors = ACCENT_THEMES[theme];
    const root = document.documentElement;

    // Update ember color variables
    root.style.setProperty("--pf-color-ember-rest", colors.rest);
    root.style.setProperty("--pf-color-ember-hover", colors.hover);
    root.style.setProperty("--pf-color-ember-active", colors.active);

    // Update accent color
    root.style.setProperty("--pf-color-accent", colors.rest);
    root.style.setProperty("--pf-color-accent-hover", colors.hover);
    root.style.setProperty("--pf-color-accent-active", colors.active);

    // Update primary colors
    root.style.setProperty("--pf-color-primary", colors.rest);
    root.style.setProperty("--pf-color-primary-hover", colors.hover);
    root.style.setProperty("--pf-color-primary-active", colors.active);

    // Update transparent versions
    const restRgb = hexToRgb(colors.rest);
    const activeRgb = hexToRgb(colors.active);
    if (restRgb) {
      root.style.setProperty("--pf-color-primary-transparent", `rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.14)`);
      root.style.setProperty("--pf-color-primary-muted", `rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.18)`);
      root.style.setProperty("--pf-color-border-warm", `rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.3)`);
      root.style.setProperty("--pf-shadow-glow", `0 0 0 1px rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.22), 0 0 16px rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.14)`);
      root.style.setProperty("--pf-shadow-glow-hover", `0 0 0 1px rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.3), 0 0 18px rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.18)`);
    }
    if (activeRgb) {
      root.style.setProperty("--pf-color-bg-selected", `rgba(${activeRgb.r}, ${activeRgb.g}, ${activeRgb.b}, 0.2)`);
      root.style.setProperty("--pf-shadow-glow-active", `0 0 10px rgba(${activeRgb.r}, ${activeRgb.g}, ${activeRgb.b}, 0.5)`);
    }
  }


  private isHexColor(value: unknown): value is string {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  }

  private isCheckerTileSize(value: unknown): value is number {
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= CHECKER_TILE_SIZE_MIN &&
      value <= CHECKER_TILE_SIZE_MAX
    );
  }
}

export const settingsStore = new SettingsStore();
