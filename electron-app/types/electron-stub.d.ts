/**
 * Minimal type stub for `electron` + `electron-updater`, used ONLY to typecheck
 * src/*.ts in CI/local without downloading the Electron binary. It declares the
 * exact API surface the desktop shell uses. At build time the real `electron`
 * package (and its bundled types) is resolved instead.
 *
 * Epic B: extended with updater IPC event forwarding, version/channel, progress.
 */

declare module "electron" {
  export interface OpenDialogOptions {
    properties?: Array<"openFile" | "openDirectory" | "multiSelections" | string>;
    filters?: Array<{ name: string; extensions: string[] }>;
  }
  export interface OpenDialogReturnValue {
    canceled: boolean;
    filePaths: string[];
  }
  export interface MessageBoxOptions {
    type?: "info" | "warning" | "error" | "question";
    buttons: string[];
    defaultId?: number;
    cancelId?: number;
    title?: string;
    message?: string;
  }
  export interface MessageBoxReturnValue {
    response: number;
  }

  export class BrowserWindow {
    constructor(options: BrowserWindowConstructorOptions);
    minimize(): void;
    maximize(): void;
    unmaximize(): void;
    isMaximized(): boolean;
    close(): void;
    show(): void;
    hide(): void;
    focus(): void;
    isVisible(): boolean;
    isDestroyed(): boolean;
    once(event: "ready-to-show", listener: () => void): void;
    on(event: "closed", listener: () => void): void;
    loadURL(url: string): Promise<void>;
    webContents: WebContents;
    static getAllWindows(): BrowserWindow[];
  }
  export interface BrowserWindowConstructorOptions {
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
    frame?: boolean;
    show?: boolean;
    backgroundColor?: string;
    webPreferences?: WebPreferences;
  }
  export interface WebPreferences {
    preload: string;
    contextIsolation: boolean;
    sandbox: boolean;
    nodeIntegration: boolean;
    webSecurity: boolean;
  }
  export interface WebContents {
    setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" | "allow" }): void;
    on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
    send(channel: string, ...args: unknown[]): void;
  }

  export class Tray {
    constructor(iconPath: string);
    setToolTip(toolTip: string): void;
    setContextMenu(menu: Menu): void;
    on(event: "click", listener: () => void): void;
  }
  export class Menu {
    static buildFromTemplate(template: MenuItemConstructorOptions[]): Menu;
  }
  export interface MenuItemConstructorOptions {
    label?: string;
    type?: "separator";
    click?: () => void;
  }

  export class Notification {
    constructor(options: { title: string; body?: string });
    show(): void;
    static isSupported(): boolean;
  }

  export const app: {
    isPackaged: boolean;
    whenReady(): Promise<void>;
    quit(): void;
    getVersion(): string;
    on(event: "activate" | "window-all-closed", listener: () => void): void;
  };
  export const dialog: {
    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
    showOpenDialog(window: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
    showMessageBox(window: BrowserWindow, options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
  };
  export const ipcMain: {
    handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  };
  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  };
  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };
  export const session: {
    defaultSession: {
      setPermissionRequestHandler(
        handler: (
          webContents: unknown,
          permission: string,
          callback: (allowed: boolean) => void,
        ) => void,
      ): void;
    };
  };
  export const shell: {
    openExternal(url: string): Promise<void>;
  };
}

declare module "electron-updater" {
  export interface UpdateInfo {
    version: string;
    releaseNotes?: string | string[] | null;
    releaseName?: string | null;
    releaseDate?: string | null;
  }

  export interface ProgressInfo {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
  }

  export const autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "update-available", listener: (info: UpdateInfo) => void): void;
    on(event: "update-not-available", listener: (info: UpdateInfo) => void): void;
    on(event: "update-downloaded", listener: (info: UpdateInfo) => void): void;
    on(event: "download-progress", listener: (progress: ProgressInfo) => void): void;
    checkForUpdatesAndNotify(): Promise<unknown>;
    checkForUpdates(): Promise<{ updateInfo: UpdateInfo } | null>;
    quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
  };
}
