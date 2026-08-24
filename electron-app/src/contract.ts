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
}

/** IPC channel names — shared so main/preload never drift. */
export const IPC = {
  windowMinimize: "desktop:window:minimize",
  windowMaximize: "desktop:window:maximize",
  windowClose: "desktop:window:close",
  notificationShow: "desktop:notification:show",
  fileSelectText: "desktop:file:select-text",
  fileReadSelectedText: "desktop:file:read-selected-text",
} as const;
