/**
 * Fluxentiq Desktop — typed IPC contract (single source of truth).
 *
 * This is the exact shape exposed to the renderer via
 * `contextBridge.exposeInMainWorld('electron', api)` in preload.ts. It mirrors
 * `lib/electron.d.ts` on the Next.js side (the renderer's typed view of
 * `window.electron`). Keep both in sync.
 *
 * SECURITY: the renderer only ever receives these narrow, typed functions —
 * never `ipcRenderer`, `remote`, or any Node primitive.
 */

export interface DesktopFileSelection {
  filePath: string;
  name: string;
}

export interface DesktopNotificationPayload {
  title?: string;
  body?: string;
}

export interface DesktopWindowApi {
  minimize: () => Promise<void>;
  /** Returns true when the window is maximized after the call. */
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
}

export interface DesktopUpdaterInfo {
  version: string;
  releaseNotes?: string | string[] | null;
  releaseName?: string | null;
  releaseDate?: string | null;
}

export interface DesktopDownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface DesktopUpdaterApi {
  /** Returns current app version (e.g., "1.0.0") */
  getVersion: () => Promise<string>;
  /** Returns release channel (e.g., "latest", "beta") derived from FLUXENTIQ_UPDATE_CHANNEL env */
  getUpdateChannel: () => Promise<string>;
  /** Triggers manual check for updates (no-op in dev) */
  checkForUpdates: () => Promise<{ checking: boolean; message?: string }>;
  /** Quits and installs downloaded update */
  quitAndInstall: () => Promise<void>;
  /** Listeners — typed event forwarders from main → renderer */
  onUpdateAvailable: (callback: (info: DesktopUpdaterInfo) => void) => () => void;
  onUpdateNotAvailable: (callback: (info: DesktopUpdaterInfo) => void) => () => void;
  onUpdateDownloaded: (callback: (info: DesktopUpdaterInfo) => void) => () => void;
  onUpdateError: (callback: (error: string) => void) => () => void;
  onDownloadProgress: (callback: (progress: DesktopDownloadProgress) => void) => () => void;
}

export interface DesktopApi {
  isDesktop: boolean;
  window: DesktopWindowApi;
  notifications: {
    show: (payload: DesktopNotificationPayload) => Promise<boolean>;
  };
  files: {
    selectTextFile: () => Promise<DesktopFileSelection | null>;
    readSelectedTextFile: (filePath: string) => Promise<string>;
  };
  updater: DesktopUpdaterApi;
}

/** IPC channel names — shared so main/preload never drift. */
export const IPC = {
  windowMinimize: "desktop:window:minimize",
  windowMaximize: "desktop:window:maximize",
  windowClose: "desktop:window:close",
  notificationShow: "desktop:notification:show",
  fileSelectText: "desktop:file:select-text",
  fileReadSelectedText: "desktop:file:read-selected-text",
  updaterGetVersion: "desktop:updater:get-version",
  updaterGetChannel: "desktop:updater:get-channel",
  updaterCheck: "desktop:updater:check",
  updaterQuitAndInstall: "desktop:updater:quit-and-install",
  updaterEventAvailable: "desktop:updater:event:available",
  updaterEventNotAvailable: "desktop:updater:event:not-available",
  updaterEventDownloaded: "desktop:updater:event:downloaded",
  updaterEventError: "desktop:updater:event:error",
  updaterEventProgress: "desktop:updater:event:progress",
} as const;
