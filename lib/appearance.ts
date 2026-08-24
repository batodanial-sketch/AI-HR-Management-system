/** Appearance presets — theme + brand accent (client-safe, no server deps). */

export interface AccentPreset {
  id: string;
  name: string;
  hue: number;
  saturation: string;
  lightness: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "indigo", name: "Indigo", hue: 243, saturation: "75%", lightness: "59%" },
  { id: "violet", name: "Violet", hue: 262, saturation: "80%", lightness: "62%" },
  { id: "emerald", name: "Emerald", hue: 158, saturation: "64%", lightness: "42%" },
  { id: "rose", name: "Rose", hue: 350, saturation: "80%", lightness: "62%" },
  { id: "amber", name: "Amber", hue: 38, saturation: "92%", lightness: "50%" },
  { id: "cyan", name: "Cyan", hue: 190, saturation: "85%", lightness: "45%" },
];

export function findAccent(id: string): AccentPreset {
  return ACCENT_PRESETS.find((accent) => accent.id === id) ?? ACCENT_PRESETS[0];
}

export function applyAccent(accent: AccentPreset): void {
  const root = document.documentElement;
  root.style.setProperty("--accent-h", String(accent.hue));
  root.style.setProperty("--accent-s", accent.saturation);
  root.style.setProperty("--accent-l", accent.lightness);
}
