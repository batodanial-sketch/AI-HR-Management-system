/**
 * Fluxentiq Desktop — auto-updater (production builds only).
 *
 * electron-updater reads its publish config from `build.publish` (a generic
 * provider fed by `FLUXENTIQ_UPDATE_URL`). It is a no-op in development
 * (`app.isPackaged === false`) and when no feed is configured, so it never
 * crashes a local run. All failures degrade silently to the current version.
 */

import { BrowserWindow, app, dialog, type MessageBoxOptions } from "electron";
import { autoUpdater } from "electron-updater";

let updateChecked = false;

function isBrowserWindow(value: unknown): value is BrowserWindow {
  return value instanceof BrowserWindow;
}

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error: Error) => {
    console.error("[updater] error:", error?.message ?? String(error));
  });

  autoUpdater.on("update-available", (info) => {
    console.info("[updater] update available:", info?.version ?? "unknown");
  });

  autoUpdater.on("update-not-available", () => {
    console.info("[updater] already up to date");
  });

  autoUpdater.on("update-downloaded", (info) => {
    void promptAndInstall(getWindow(), info?.version ?? "");
  });

  autoUpdater
    .checkForUpdatesAndNotify()
    .catch((error: Error) => {
      console.error("[updater] check failed:", error?.message ?? String(error));
    });

  updateChecked = true;
}

async function promptAndInstall(win: BrowserWindow | null, version: string): Promise<void> {
  const options: MessageBoxOptions = {
    type: "info",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Fluxentiq update ready",
    message: version
      ? `Version ${version} downloaded. Restart to install?`
      : "An update is ready. Restart to install?",
  };

  let choice = 0;
  if (isBrowserWindow(win)) {
    const result = await dialog.showMessageBox(win, options);
    choice = result.response;
  }

  if (choice === 0) {
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  }
}

export function isUpdateChecked(): boolean {
  return updateChecked;
}
