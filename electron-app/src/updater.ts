/**
 * Fluxentiq Desktop — auto-updater (production builds only) with IPC event forwarding.
 *
 * electron-updater reads its publish config from `build.publish` (a generic
 * provider fed by `FLUXENTIQ_UPDATE_URL`). It is a no-op in development
 * (`app.isPackaged === false`) and when no feed is configured, so it never
 * crashes a local run. All failures degrade silently to the current version.
 *
 * Epic B: forwards all updater events to renderer via IPC (onUpdateAvailable,
 * onUpdateDownloaded, onUpdateError, downloadProgress) so the System Settings
 * UI can show version, channel, manual check button, and progress bar.
 */

import { BrowserWindow, app, dialog, type MessageBoxOptions } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import { IPC } from "./contract";

let updateChecked = false;

function isBrowserWindow(value: unknown): value is BrowserWindow {
  return value instanceof BrowserWindow;
}

function toUpdaterInfo(info: UpdateInfo | undefined): { version: string; releaseNotes?: string | string[] | null; releaseName?: string | null; releaseDate?: string | null } {
  return {
    version: info?.version ?? "unknown",
    releaseNotes: (info?.releaseNotes as string | string[] | null) ?? null,
    releaseName: (info as { releaseName?: string | null })?.releaseName ?? null,
    releaseDate: info?.releaseDate ?? null,
  };
}

function sendToWindow(getWindow: () => BrowserWindow | null, channel: string, payload: unknown): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    // In dev, still allow manual check to be invoked (it will no-op), but don't auto-check
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error: Error) => {
    const message = error?.message ?? String(error);
    console.error("[updater] error:", message);
    sendToWindow(getWindow, IPC.updaterEventError, message);
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    const payload = toUpdaterInfo(info);
    console.info("[updater] update available:", payload.version);
    sendToWindow(getWindow, IPC.updaterEventAvailable, payload);
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    const payload = toUpdaterInfo(info);
    console.info("[updater] already up to date");
    sendToWindow(getWindow, IPC.updaterEventNotAvailable, payload);
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    const payload = {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    };
    sendToWindow(getWindow, IPC.updaterEventProgress, payload);
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    const payload = toUpdaterInfo(info);
    console.info("[updater] update downloaded:", payload.version);
    sendToWindow(getWindow, IPC.updaterEventDownloaded, payload);
    void promptAndInstall(getWindow, payload.version);
  });

  autoUpdater
    .checkForUpdatesAndNotify()
    .catch((error: Error) => {
      const message = error?.message ?? String(error);
      console.error("[updater] check failed:", message);
      sendToWindow(getWindow, IPC.updaterEventError, message);
    });

  updateChecked = true;
}

export async function checkForUpdatesManually(getWindow: () => BrowserWindow | null): Promise<{ checking: boolean; message?: string }> {
  if (!app.isPackaged) {
    return { checking: false, message: "Auto-updater is disabled in development (app.isPackaged=false)." };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version ?? "unknown";
    return { checking: true, message: `Checking for updates... current remote version: ${version}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[updater] manual check failed:", message);
    sendToWindow(getWindow, IPC.updaterEventError, message);
    return { checking: false, message };
  }
}

async function promptAndInstall(getWindow: () => BrowserWindow | null, version: string): Promise<void> {
  const win = getWindow();
  if (!isBrowserWindow(win)) {
    return;
  }

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

  try {
    const result = await dialog.showMessageBox(win, options);
    if (result.response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    }
  } catch (err) {
    console.error("[updater] dialog failed:", err instanceof Error ? err.message : String(err));
  }
}

export function isUpdateChecked(): boolean {
  return updateChecked;
}

export function getAppVersion(): string {
  return app.getVersion();
}

export function getUpdateChannel(): string {
  // Release channel derived from env, e.g., "latest", "beta", "alpha"
  // Defaults to "latest" for production
  return process.env.FLUXENTIQ_UPDATE_CHANNEL?.trim() || "latest";
}

