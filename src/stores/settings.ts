/**
 * Settings Store
 *
 * User preferences and UI customization settings.
 */
import { signal } from "../core/signal";

// Predefined accent color themes
export const ACCENT_THEMES = {
  ember: {
    name: "Ember",
    rest: "#f59e0b",
    hover: "#fbbf24",
    active: "#ea580c",
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

interface SettingsData {
  accentTheme: AccentTheme;
}

class SettingsStore {
  accentTheme = signal<AccentTheme>("ember");

  constructor() {
    this.load();
    this.applyAccentTheme(this.accentTheme.value);
  }

  private load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as SettingsData;
        if (data.accentTheme && ACCENT_THEMES[data.accentTheme]) {
          this.accentTheme.value = data.accentTheme;
        }
      }
    } catch (e) {
      console.warn("Failed to load settings:", e);
    }
  }

  private save() {
    try {
      const data: SettingsData = {
        accentTheme: this.accentTheme.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save settings:", e);
    }
  }

  setAccentTheme(theme: AccentTheme) {
    if (ACCENT_THEMES[theme]) {
      this.accentTheme.value = theme;
      this.applyAccentTheme(theme);
      this.save();
    }
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
    const restRgb = this.hexToRgb(colors.rest);
    const activeRgb = this.hexToRgb(colors.active);
    if (restRgb) {
      root.style.setProperty("--pf-color-primary-transparent", `rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.15)`);
      root.style.setProperty("--pf-color-border-warm", `rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.3)`);
      root.style.setProperty("--pf-shadow-glow", `0 0 8px rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.3)`);
      root.style.setProperty("--pf-shadow-glow-hover", `0 0 12px rgba(${restRgb.r}, ${restRgb.g}, ${restRgb.b}, 0.4)`);
    }
    if (activeRgb) {
      root.style.setProperty("--pf-color-bg-selected", `rgba(${activeRgb.r}, ${activeRgb.g}, ${activeRgb.b}, 0.2)`);
      root.style.setProperty("--pf-shadow-glow-active", `0 0 10px rgba(${activeRgb.r}, ${activeRgb.g}, ${activeRgb.b}, 0.5)`);
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }
}

export const settingsStore = new SettingsStore();
