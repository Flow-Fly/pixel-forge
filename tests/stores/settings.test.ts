import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "pf-settings";

async function loadSettingsModule() {
  vi.resetModules();
  return import("../../src/stores/settings");
}

describe("settingsStore checker settings", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  it("loads valid saved checker settings and applies CSS custom properties", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accentTheme: "ocean",
        checkerLightColor: "#ABCDEF",
        checkerDarkColor: "#112233",
        checkerTileSize: 12,
      })
    );

    const { settingsStore } = await loadSettingsModule();

    expect(settingsStore.accentTheme.value).toBe("ocean");
    expect(settingsStore.checkerLightColor.value).toBe("#abcdef");
    expect(settingsStore.checkerDarkColor.value).toBe("#112233");
    expect(settingsStore.checkerTileSize.value).toBe(12);
    expect(
      document.documentElement.style.getPropertyValue("--pf-checker-light-color")
    ).toBe("#abcdef");
    expect(
      document.documentElement.style.getPropertyValue("--pf-checker-dark-color")
    ).toBe("#112233");
    expect(
      document.documentElement.style.getPropertyValue("--pf-checker-tile-size")
    ).toBe("12px");
  });

  it("persists valid checker settings to local storage", async () => {
    const { settingsStore } = await loadSettingsModule();

    settingsStore.setCheckerSettings({
      lightColor: "#445566",
      darkColor: "#010203",
      tileSize: 20,
    });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");

    expect(saved).toMatchObject({
      checkerLightColor: "#445566",
      checkerDarkColor: "#010203",
      checkerTileSize: 20,
    });
    expect(
      document.documentElement.style.getPropertyValue("--pf-checker-light-color")
    ).toBe("#445566");
    expect(
      document.documentElement.style.getPropertyValue("--pf-checker-tile-size")
    ).toBe("20px");
  });

  it("falls back to defaults for invalid saved checker settings", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accentTheme: "forest",
        checkerLightColor: "white",
        checkerDarkColor: "#12345g",
        checkerTileSize: 999,
      })
    );

    const { DEFAULT_CHECKER_SETTINGS, settingsStore } = await loadSettingsModule();

    expect(settingsStore.accentTheme.value).toBe("forest");
    expect(settingsStore.checkerLightColor.value).toBe(
      DEFAULT_CHECKER_SETTINGS.lightColor
    );
    expect(settingsStore.checkerDarkColor.value).toBe(
      DEFAULT_CHECKER_SETTINGS.darkColor
    );
    expect(settingsStore.checkerTileSize.value).toBe(
      DEFAULT_CHECKER_SETTINGS.tileSize
    );
    expect(
      document.documentElement.style.getPropertyValue("--pf-checker-light-color")
    ).toBe(DEFAULT_CHECKER_SETTINGS.lightColor);
    expect(
      document.documentElement.style.getPropertyValue("--pf-checker-tile-size")
    ).toBe(`${DEFAULT_CHECKER_SETTINGS.tileSize}px`);
  });
});
