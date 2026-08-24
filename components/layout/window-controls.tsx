"use client";

import * as React from "react";
import { Minus, Square, X } from "lucide-react";

/**
 * Frameless window controls (minimize / maximize / close) for the Electron
 * desktop shell.
 *
 * Renders only when the desktop bridge is present (`window.electron.isDesktop`),
 * so it is a complete no-op in the browser and in the Next.js preview. Every
 * action goes through the narrow `contextBridge` contract — the renderer never
 * touches `ipcRenderer` directly.
 */
export function WindowControls() {
  const [available, setAvailable] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);

  React.useEffect(() => {
    setAvailable(
      typeof window !== "undefined" && window.electron?.isDesktop === true,
    );
  }, []);

  if (!available) {
    return null;
  }

  const minimize = () => {
    void window.electron?.window.minimize();
  };

  const toggleMaximize = async () => {
    const next = await window.electron?.window.maximize();
    setMaximized(Boolean(next));
  };

  const close = () => {
    void window.electron?.window.close();
  };

  const base =
    "flex h-7 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors electron-no-drag";

  return (
    <div
      data-testid="window-controls"
      className="mr-2 flex items-center gap-0.5 border-r border-border/60 pr-2"
    >
      <button
        type="button"
        aria-label="Minimize window"
        onClick={minimize}
        className={`${base} hover:bg-secondary hover:text-foreground`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => void toggleMaximize()}
        className={`${base} hover:bg-secondary hover:text-foreground`}
      >
        <Square className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label="Close window"
        onClick={close}
        className={`${base} hover:bg-destructive hover:text-destructive-foreground`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
