"use client";

import * as React from "react";
import Image from "next/image";
import { Check, ImageIcon, Loader2, Save } from "lucide-react";
import { applyBrandAccent } from "@/lib/branding";
import { useFeatureAccess } from "@/components/providers";
import { ProLockOverlay } from "@/components/ui/pro-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandingSettings } from "@/lib/settings/config";

/**
 * Branding — white-label controls. The app name replaces "Fluxentiq" across
 * titles and headers; the accent color drives the CSS variables; logo/favicon
 * URLs override the default mark. Persisted to data/settings.json.
 * Gated behind Pro/Enterprise.
 */
export function BrandingSettings() {
  const canBrand = useFeatureAccess("branding");
  const [form, setForm] = React.useState<BrandingSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { branding?: BrandingSettings }) => {
        if (data.branding) {
          setForm(data.branding);
        }
      });
  }, []);

  if (!form) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-10 w-full" />
        ))}
      </div>
    );
  }

  const setField = <K extends keyof BrandingSettings>(
    key: K,
    value: BrandingSettings[K],
  ) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branding: form }),
    });
    if (form.accent) {
      applyBrandAccent(form.accent);
    }
    setSaving(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="relative space-y-5">
      {!canBrand && <ProLockOverlay label="White-labeling is a Pro feature" />}

      <div className={!canBrand ? "pointer-events-none opacity-60" : ""}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brand-app-name">Application name</Label>
            <Input
              id="brand-app-name"
              data-testid="brand-app-name-input"
              value={form.appName}
              onChange={(event) => setField("appName", event.target.value)}
              placeholder="Fluxentiq"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-vendor-name">Company / vendor name</Label>
            <Input
              id="brand-vendor-name"
              data-testid="brand-vendor-name-input"
              value={form.vendorName}
              onChange={(event) => setField("vendorName", event.target.value)}
              placeholder="Fluxentiq"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-accent">Primary accent color</Label>
          <div className="flex items-center gap-2">
            <input
              id="brand-accent"
              type="color"
              data-testid="brand-accent-input"
              value={/^#[0-9a-fA-F]{6}$/.test(form.accent) ? form.accent : "#6366f1"}
              onChange={(event) => {
                setField("accent", event.target.value);
                applyBrandAccent(event.target.value);
              }}
              className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent p-1"
            />
            <Input
              value={form.accent}
              onChange={(event) => setField("accent", event.target.value)}
              placeholder="#6366f1"
              className="font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Applied to buttons, active navigation and borders. Leave blank for the
            default indigo.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-logo">Logo URL</Label>
          <Input
            id="brand-logo"
            data-testid="brand-logo-input"
            value={form.logoUrl}
            onChange={(event) => setField("logoUrl", event.target.value)}
            placeholder="https://…/logo.png"
          />
          {form.logoUrl && (
            <Image
              src={form.logoUrl}
              alt="Logo preview"
              width={160}
              height={40}
              className="h-10 w-auto rounded-md border border-border bg-card p-1 object-contain"
              unoptimized
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-favicon">Favicon URL</Label>
          <Input
            id="brand-favicon"
            data-testid="brand-favicon-input"
            value={form.faviconUrl}
            onChange={(event) => setField("faviconUrl", event.target.value)}
            placeholder="https://…/favicon.ico"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" data-testid="brand-save-button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save branding
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
