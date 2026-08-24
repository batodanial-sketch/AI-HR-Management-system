/**
 * Fluxentiq Desktop — main process.
 *
 * Frameless, sandboxed, context-isolated window that loads the Next.js app
 * (local dev server or a deployed HTTPS origin). Navigation is locked to the
 * configured workspace URL + the Supabase origin; external links open in the
 * system browser. A system tray is created for quick show/hide/quit.
 *
 * SECURITY LAW: `nodeIntegration: false`, `contextIsolation: true`,
 * `sandbox: true`, `webSecurity: true`, and all permission requests are denied
 * by default. The renderer only sees the typed `DesktopApi` from preload.ts.
 */

import { BrowserWindow, Menu, Tray, app, session, shell } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipcHandlers";
import { initAutoUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const desktopUrl = process.env.FLUXENTIQ_DESKTOP_URL || "http://127.0.0.1:3000";
const allowedNavigationOrigins = [
  desktopUrl,
  "https://zeroaswkxyvcsoxtiyqs.supabase.co",
];

/** Resolves an asset path relative to the repo root (works from dist/). */
function repoPath(...segments: string[]): string {
  // main.ts compiles to dist/main.js → repo root is two levels up.
  return path.join(__dirname, "..", "..", ...segments);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: "#070A11",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = allowedNavigationOrigins.some((origin) => url.startsWith(origin));
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(desktopUrl);
}

function createTray(): void {
  const icon = repoPath("public", "brand", "fluxentiq-transparent-mark.png");
  tray = new Tray(icon);
  tray.setToolTip("Fluxentiq AI HR");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Fluxentiq",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "Hide",
        click: () => mainWindow?.hide(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit(),
      },
    ]),
  );
  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  registerIpcHandlers(() => mainWindow);
  createWindow();
  createTray();
  initAutoUpdater(() => mainWindow);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
