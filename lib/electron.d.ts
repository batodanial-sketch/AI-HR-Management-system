/**
 * Typed contract for the Electron desktop bridge.
 *
 * Mirrors the strict `contextBridge` API exposed by
 * `electron-app/preload.js`. The renderer NEVER receives raw Node primitives
 * or `ipcRenderer` — only this narrow, typed surface (Development Law #2). In
 * the browser `window.electron` is simply undefined, so all consumers must
 * feature-detect via `window.electron?.isDesktop`.
 */

export {};

interface FluxentiqDesktopFileSelection {
  filePath: string;
  name: string;
}

interface FluxentiqDesktopNotificationPayload {
  title?: string;
  body?: string;
}

interface FluxentiqDesktopAPI {
  isDesktop: boolean;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<boolean>;
    close: () => Promise<void>;
  };
  notifications: {
    show: (payload: FluxentiqDesktopNotificationPayload) => Promise<boolean>;
  };
  files: {
    selectTextFile: () => Promise<FluxentiqDesktopFileSelection | null>;
    readSelectedTextFile: (filePath: string) => Promise<string>;
  };
}

declare global {
  interface Window {
    electron?: FluxentiqDesktopAPI;
  }
}
