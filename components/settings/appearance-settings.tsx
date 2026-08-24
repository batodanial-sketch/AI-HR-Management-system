"use client";

import * as React from "react";
import { Check, Loader2, Monitor, Moon, Save, Sun } from "lucide-react";
import { ACCENT_PRESETS, findAccent } from "@/lib/appearance";
import { useSettings } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Appearance controls — theme (light/dark) and brand accent color. Persisted
 * to localStorage and applied to CSS variables immediately.
 */
export function AppearanceSettings() {
  const { theme, setTheme, accent, setAccent } = useSettings();
  const currentAccent = findAccent(accent);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="label-xs">Theme</p>
        <div className="grid grid-cols-3 gap-2">
          <ThemeOption
            active={theme === "light"}
            label="Light"
            icon={<Sun className="h-4 w-4" />}
            onClick={() => setTheme("light")}
          />
          <ThemeOption
            active={theme === "dark"}
            label="Dark"
            icon={<Moon className="h-4 w-4" />}
            onClick={() => setTheme("dark")}
          />
          <ThemeOption
            active={false}
            label="System"
            icon={<Monitor className="h-4 w-4" />}
            onClick={() => setTheme("dark")}
            disabled
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="label-xs">Accent color</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setAccent(preset.id)}
              aria-label={`${preset.name} accent`}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
                accent === preset.id
                  ? "border-foreground"
                  : "border-transparent",
              )}
              style={{
                backgroundColor: `hsl(${preset.hue} ${preset.saturation} ${preset.lightness})`,
              }}
            >
              {accent === preset.id && (
                <Check className="h-4 w-4 text-white drop-shadow" />
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Current: {currentAccent.name}
        </p>
      </div>
    </div>
  );
}

function ThemeOption({
  active,
  label,
  icon,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card/40 text-muted-foreground hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
