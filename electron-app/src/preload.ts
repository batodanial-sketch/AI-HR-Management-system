/**
 * Fluxentiq Desktop — preload bridge.
 *
 * The ONLY surface the renderer can touch. `contextIsolation` + `sandbox` are
 * on (set in main.ts), so this file runs in an isolated world; the narrow,
 * typed `DesktopApi` below is what `window.electron` becomes.
 *
 * SECURITY LAW: never expose `ipcRenderer` itself — only explicit functions.
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC, type DesktopApi } from "./contract";

const api: DesktopApi = {
  isDesktop: true,
  window: {
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize) as Promise<void>,
    maximize: () => ipcRenderer.invoke(IPC.windowMaximize) as Promise<boolean>,
    close: () => ipcRenderer.invoke(IPC.windowClose) as Promise<void>,
  },
  notifications: {
    show: (payload) =>
      ipcRenderer.invoke(IPC.notificationShow, payload) as Promise<boolean>,
  },
  files: {
    selectTextFile: () =>
      ipcRenderer.invoke(IPC.fileSelectText) as Promise<{
        filePath: string;
        name: string;
      } | null>,
    readSelectedTextFile: (filePath) =>
      ipcRenderer.invoke(IPC.fileReadSelectedText, filePath) as Promise<string>,
  },
};

contextBridge.exposeInMainWorld("electron", api);
