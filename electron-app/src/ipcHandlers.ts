/**
 * Fluxentiq Desktop — IPC handlers (main process).
 *
 * Every handler is registered against an explicit channel name from
 * `contract.ts` and validates its inputs defensively (no trust in renderer
 * arguments). File reads are restricted to paths previously selected through
 * the native dialog, with an extension allow-list.
 */

import {
  BrowserWindow,
  Notification,
  dialog,
  ipcMain,
  type OpenDialogOptions,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { IPC } from "./contract";

const selectedPaths = new Set<string>();
const allowedExtensions = new Set<string>([".txt", ".md", ".csv", ".json"]);

const TEXT_MAX_LENGTH = 2_000_000;
const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 500;

function coerceString(value: unknown, maxLength: number, fallback: string): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.windowMinimize, () => {
    getWindow()?.minimize();
  });

  ipcMain.handle(IPC.windowMaximize, () => {
    const win = getWindow();
    if (!win) {
      return false;
    }
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle(IPC.windowClose, () => {
    getWindow()?.close();
  });

  ipcMain.handle(IPC.notificationShow, (_event, payload: unknown) => {
    const record = isRecord(payload) ? payload : {};
    if (Notification.isSupported()) {
      new Notification({
        title: coerceString(record.title, TITLE_MAX_LENGTH, "Fluxentiq"),
        body: coerceString(record.body, BODY_MAX_LENGTH, ""),
      }).show();
    }
    return true;
  });

  ipcMain.handle(IPC.fileSelectText, async () => {
    const win = getWindow();
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Text data",
          extensions: [...allowedExtensions].map((ext) => ext.slice(1)),
        },
      ],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0 || !result.filePaths[0]) {
      return null;
    }
    const filePath = result.filePaths[0];
    selectedPaths.add(filePath);
    return { filePath, name: path.basename(filePath) };
  });

  ipcMain.handle(IPC.fileReadSelectedText, async (_event, filePath: unknown) => {
    if (typeof filePath !== "string" || !selectedPaths.has(filePath)) {
      throw new Error("File path was not selected through the desktop dialog.");
    }
    if (!allowedExtensions.has(path.extname(filePath).toLowerCase())) {
      throw new Error("File type is not allowed.");
    }
    const text = await fs.readFile(filePath, "utf8");
    return text.slice(0, TEXT_MAX_LENGTH);
  });
}
