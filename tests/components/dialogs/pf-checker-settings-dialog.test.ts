import { beforeEach, describe, expect, it } from "vitest";
import "../../../src/components/dialogs/pf-checker-settings-dialog";
import {
  DEFAULT_CHECKER_SETTINGS,
  settingsStore,
} from "../../../src/stores/settings";
import type { PFCheckerSettingsDialog } from "../../../src/components/dialogs/pf-checker-settings-dialog";

function createDialog() {
  const dialog = document.createElement(
    "pf-checker-settings-dialog"
  ) as PFCheckerSettingsDialog;
  document.body.append(dialog);
  return dialog;
}

function getInput(dialog: PFCheckerSettingsDialog, name: string) {
  const input = dialog.shadowRoot?.querySelector<HTMLInputElement>(
    `input[name="${name}"]`
  );
  expect(input).toBeTruthy();
  return input as HTMLInputElement;
}

function updateInput(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
}

describe("pf-checker-settings-dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    settingsStore.setCheckerSettings(DEFAULT_CHECKER_SETTINGS);
  });

  it("opens from the View menu event with current checker settings", async () => {
    settingsStore.setCheckerSettings({
      lightColor: "#abcdef",
      darkColor: "#123456",
      tileSize: 14,
    });
    const dialog = createDialog();

    window.dispatchEvent(new CustomEvent("show-checker-settings-dialog"));
    await dialog.updateComplete;

    expect(dialog.open).toBe(true);
    expect(getInput(dialog, "checker-light-color").value).toBe("#abcdef");
    expect(getInput(dialog, "checker-dark-color").value).toBe("#123456");
    expect(getInput(dialog, "checker-tile-size").value).toBe("14");
  });

  it("applies checker settings from native form controls", async () => {
    const dialog = createDialog();

    window.dispatchEvent(new CustomEvent("show-checker-settings-dialog"));
    await dialog.updateComplete;

    updateInput(getInput(dialog, "checker-light-color"), "#334455");
    updateInput(getInput(dialog, "checker-dark-color"), "#050607");
    updateInput(getInput(dialog, "checker-tile-size"), "18");
    await dialog.updateComplete;

    const form = dialog.shadowRoot?.querySelector<HTMLFormElement>("form");
    expect(form).toBeTruthy();
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await dialog.updateComplete;

    expect(dialog.open).toBe(false);
    expect(settingsStore.checkerLightColor.value).toBe("#334455");
    expect(settingsStore.checkerDarkColor.value).toBe("#050607");
    expect(settingsStore.checkerTileSize.value).toBe(18);
  });
});
