/**
 * Fluxentiq Desktop — preload bridge.
 *
 * The ONLY surface the renderer can touch. `contextIsolation` + `sandbox` are
 * on (set in main.ts), so this file runs in an isolated world; the narrow,
 * typed `DesktopApi` below is what `window.electron` becomes.
 *
 * SECURITY LAW: never expose `ipcRenderer` itself — only explicit functions.
 * Updater listeners are typed and return an unsubscribe function.
 */

import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type DesktopApi,
  type DesktopUpdaterInfo,
  type DesktopDownloadProgress,
} from "./contract";

function onIpcEvent<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler as never);
  return () => {
    ipcRenderer.removeListener(channel, handler as never);
  };
}

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
  updater: {
    getVersion: () => ipcRenderer.invoke(IPC.updaterGetVersion) as Promise<string>,
    getUpdateChannel: () => ipcRenderer.invoke(IPC.updaterGetChannel) as Promise<string>,
    checkForUpdates: () =>
      ipcRenderer.invoke(IPC.updaterCheck) as Promise<{ checking: boolean; message?: string }>,
    quitAndInstall: () => ipcRenderer.invoke(IPC.updaterQuitAndInstall) as Promise<void>,
    onUpdateAvailable: (callback: (info: DesktopUpdaterInfo) => void) =>
      onIpcEvent<DesktopUpdaterInfo>(IPC.updaterEventAvailable, callback),
    onUpdateNotAvailable: (callback: (info: DesktopUpdaterInfo) => void) =>
      onIpcEvent<DesktopUpdaterInfo>(IPC.updaterEventNotAvailable, callback),
    onUpdateDownloaded: (callback: (info: DesktopUpdaterInfo) => void) =>
      onIpcEvent<DesktopUpdaterInfo>(IPC.updaterEventDownloaded, callback),
    onUpdateError: (callback: (error: string) => void) =>
      onIpcEvent<string>(IPC.updaterEventError, callback),
    onDownloadProgress: (callback: (progress: DesktopDownloadProgress) => void) =>
      onIpcEvent<DesktopDownloadProgress>(IPC.updaterEventProgress, callback),
  },
};

contextBridge.exposeInMainWorld("electron", api);
