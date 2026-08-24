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

/**
 * Security hardening: replace hardcoded Supabase URLs with environment-driven checks.
 * - FLUXENTIQ_DESKTOP_URL is the primary workspace URL (Next.js app)
 * - NEXT_PUBLIC_SUPABASE_URL is the Supabase project URL (optional, for auth callbacks)
 * - Additional origins can be provided via FLUXENTIQ_ALLOWED_ORIGINS (comma-separated)
 *
 * This prevents the app from being locked to a single hardcoded Supabase project
 * and allows white-label deployments to configure their own Supabase origin.
 */
function getAllowedNavigationOrigins(): string[] {
  const origins = new Set<string>();

  // Primary desktop URL (Next.js app)
  origins.add(desktopUrl);

  // Supabase URL from env (for OAuth callbacks, etc.)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    origins.add(supabaseUrl);
  }

  // Legacy fallback: also allow Supabase URL without trailing path if env includes it
  // e.g., https://xyz.supabase.co
  // Already covered by NEXT_PUBLIC_SUPABASE_URL, but we keep logic for backward compatibility.

  // Additional allowed origins via comma-separated env var (for white-label)
  const extra = process.env.FLUXENTIQ_ALLOWED_ORIGINS?.trim();
  if (extra) {
    for (const origin of extra.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  // Always allow the desktop URL's origin (protocol + host) even if path differs
  try {
    const desktopOrigin = new URL(desktopUrl).origin;
    origins.add(desktopOrigin);
  } catch {
    // Invalid URL — ignore, desktopUrl itself is already added
  }

  // Always allow Supabase origin (if present) for auth
  if (supabaseUrl) {
    try {
      const supabaseOrigin = new URL(supabaseUrl).origin;
      origins.add(supabaseOrigin);
    } catch {
      // Invalid URL — ignore
    }
  }

  return Array.from(origins);
}

const allowedNavigationOrigins = getAllowedNavigationOrigins();

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
