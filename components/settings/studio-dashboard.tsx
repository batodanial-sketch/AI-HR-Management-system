"use client";

import * as React from "react";
import { Loader2, Lock, Unlock, ArrowUp, ArrowDown, Plus, Trash2, Save, RotateCcw, Settings, Database, Bot, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  getOrganizationConfigAction,
  updateOrganizationConfigAction,
  resetOrganizationConfigAction,
  getStudioEntitlementAction,
} from "@/app/actions/studioActions";
import { type OrganizationConfig, DEFAULT_WIDGETS } from "@/lib/studio/config";

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass =
  "flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type NewField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "date";
  required: boolean;
  description: string;
  options: string;
};

export function StudioDashboard() {
  const [config, setConfig] = React.useState<OrganizationConfig | null>(null);
  const [entitlement, setEntitlement] = React.useState<{ tier: string | null; isEnterprise: boolean; isPro: boolean } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [licenseKey, setLicenseKey] = React.useState("");
  const [activating, setActivating] = React.useState(false);
  const [newField, setNewField] = React.useState<NewField>({
    key: "",
    label: "",
    type: "text",
    required: false,
    description: "",
    options: "",
  });
  const [copilotInput, setCopilotInput] = React.useState("");
  const [copilotLoading, setCopilotLoading] = React.useState(false);
  const [copilotResult, setCopilotResult] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entRes, cfgRes] = await Promise.all([getStudioEntitlementAction(), getOrganizationConfigAction()]);
      if (entRes.success) setEntitlement(entRes.data);
      else setError(entRes.error);

      if (cfgRes.success) setConfig(cfgRes.data);
      else setError(cfgRes.error);
    } catch {
      setError("Failed to load studio configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleToggleWidget = (id: string, enabled: boolean) => {
    if (!config) return;
    const widgets = config.dashboardLayout.widgets.map((w) => (w.id === id ? { ...w, enabled } : w));
    setConfig({ ...config, dashboardLayout: { widgets } });
  };

  const handleMoveWidget = (id: string, direction: "up" | "down") => {
    if (!config) return;
    const widgets = [...config.dashboardLayout.widgets].sort((a, b) => a.order - b.order);
    const idx = widgets.findIndex((w) => w.id === id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= widgets.length) return;
    // Swap order
    const tmp = widgets[idx].order;
    widgets[idx].order = widgets[newIdx].order;
    widgets[newIdx].order = tmp;
    // Re-sort
    widgets.sort((a, b) => a.order - b.order);
    setConfig({ ...config, dashboardLayout: { widgets } });
  };

  const handleAddField = () => {
    if (!config) return;
    if (!newField.key || !newField.label) {
      setError("Field key and label are required.");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(newField.key)) {
      setError("Field key must be lowercase alphanumeric + underscore.");
      return;
    }
    if (config.dynamicSchema.fields.find((f) => f.key === newField.key)) {
      setError(`Field key already exists: ${newField.key}`);
      return;
    }

    const field = {
      key: newField.key.trim(),
      label: newField.label.trim(),
      type: newField.type,
      required: newField.required,
      description: newField.description.trim() || undefined,
      options: newField.type === "select" ? newField.options.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    };

    setConfig({
      ...config,
      dynamicSchema: {
        fields: [...config.dynamicSchema.fields, field],
      },
    });
    setNewField({ key: "", label: "", type: "text", required: false, description: "", options: "" });
    setError(null);
    setSuccess(`Added field: ${field.label}`);
  };

  const handleRemoveField = (key: string) => {
    if (!config) return;
    setConfig({
      ...config,
      dynamicSchema: {
        fields: config.dynamicSchema.fields.filter((f) => f.key !== key),
      },
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await updateOrganizationConfigAction({
        dashboardLayout: config.dashboardLayout,
        dynamicSchema: config.dynamicSchema,
        copilotRules: config.copilotRules,
      });
      if (res.success) {
        setConfig(res.data);
        setSuccess("Configuration saved successfully.");
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset to platform defaults? This will remove all customizations.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await resetOrganizationConfigAction();
      if (res.success) {
        setConfig(res.data);
        setSuccess("Reset to defaults.");
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      setError("Enter a FLUX-ENT license key.");
      return;
    }
    setActivating(true);
    setError(null);
    try {
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (json.ok) {
        setSuccess("Enterprise license activated. Reloading...");
        setLicenseKey("");
        setTimeout(() => void load(), 1000);
      } else {
        setError(json.message ?? "Activation failed.");
      }
    } catch {
      setError("Activation request failed.");
    } finally {
      setActivating(false);
    }
  };

  const handleAdminCopilot = async () => {
    if (!copilotInput.trim()) {
      setError("Enter an admin command for the copilot.");
      return;
    }
    setCopilotLoading(true);
    setCopilotResult(null);
    setError(null);
    try {
      const res = await fetch("/api/ai/admin-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: copilotInput.trim() }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        patch?: unknown;
        applied?: boolean;
        message?: string;
        config?: OrganizationConfig;
      };
      if (json.ok) {
        setCopilotResult(json.message ?? "Command applied successfully.");
        if (json.config) {
          setConfig(json.config as OrganizationConfig);
        } else {
          // Reload config after copilot applied patch
          void load();
        }
        setCopilotInput("");
      } else {
        setError(json.message ?? "Copilot failed to apply command.");
      }
    } catch {
      setError("Admin Copilot request failed.");
    } finally {
      setCopilotLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading Enterprise Studio...</span>
      </div>
    );
  }

  const isEnterprise = entitlement?.isEnterprise ?? false;

  return (
    <div className="relative space-y-6">
      {/* Entitlement banner */}
      <Card className={isEnterprise ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${isEnterprise ? "bg-success/10" : "bg-warning/10"}`}>
              {isEnterprise ? <Unlock className="h-5 w-5 text-success" /> : <Lock className="h-5 w-5 text-warning" />}
            </div>
            <div>
              <CardTitle className="text-base">
                {isEnterprise ? "Enterprise Licensed — Studio Unlocked" : "Enterprise License Required"}
              </CardTitle>
              <CardDescription>
                Current tier: {entitlement?.tier ?? "None"} · Studio requires <code>FLUX-ENT</code> cryptographic key (Ed25519 offline verification)
              </CardDescription>
            </div>
          </div>
          <Badge variant={isEnterprise ? "success" : "warning"}>{isEnterprise ? "ENTERPRISE" : entitlement?.tier ?? "UNLICENSED"}</Badge>
        </CardHeader>
        {!isEnterprise && (
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              The Dynamic Enterprise Studio allows admins to customize dashboard layouts, define dynamic metadata schemas (e.g., Security Clearance, Cost Center), and use the Admin Infrastructure Copilot. This is strictly gated behind a verified <code>FLUX-ENT-…</code> key. Your current tier cannot access studio config updates — you will receive <code>403 ENTITLEMENT_REQUIRED</code> if you try.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={`${inputClass} font-mono text-xs`}
                placeholder="FLUX-ENT-... (paste enterprise key)"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
              />
              <Button onClick={() => void handleActivateLicense()} disabled={activating} size="sm" className="shrink-0">
                {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Activate Enterprise
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{success}</p>
      )}

      {/* Locked overlay if not enterprise */}
      <div className={isEnterprise ? "" : "pointer-events-none opacity-40 blur-[0.5px]"}>
        {/* Widget controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" /> Dashboard Widget Studio
            </CardTitle>
            <CardDescription>Toggle visibility and reorder widgets. Changes apply per-organization via organization_configs.dashboard_layout_json</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(config?.dashboardLayout.widgets ?? [])
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((widget) => (
                <div
                  key={widget.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={widget.enabled}
                      onCheckedChange={(v: boolean) => handleToggleWidget(widget.id, v)}
                      disabled={!isEnterprise}
                    />
                    <div>
                      <p className="text-sm font-medium">{widget.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {widget.id} · {widget.category} · order {widget.order}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={widget.enabled ? "success" : "secondary"}>{widget.enabled ? "Enabled" : "Hidden"}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveWidget(widget.id, "up")} disabled={!isEnterprise}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveWidget(widget.id, "down")} disabled={!isEnterprise}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => void handleSave()} disabled={saving || !isEnterprise} size="sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Layout
              </Button>
              <Button variant="outline" onClick={() => void handleReset()} disabled={saving || !isEnterprise} size="sm">
                <RotateCcw className="h-4 w-4" />
                Reset to Defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic schema editor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" /> Dynamic Metadata Schema
            </CardTitle>
            <CardDescription>
              Add custom fields like Security Clearance, Cost Center, etc. Stored in organization_configs.dynamic_schema_json. RCE-safe — JSON only, no code execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {(config?.dynamicSchema.fields ?? []).map((field) => (
                <div key={field.key} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{field.label}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {field.key}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {field.type}
                      </Badge>
                      {field.required && <Badge variant="destructive" className="text-xs">required</Badge>}
                    </div>
                    {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                    {field.options && field.options.length > 0 && (
                      <p className="text-xs text-muted-foreground">Options: {field.options.join(", ")}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveField(field.key)} disabled={!isEnterprise}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {config?.dynamicSchema.fields.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No custom fields. Add one below.</p>
              )}
            </div>

            <div className="rounded-lg border border-dashed border-border p-4">
              <h4 className="mb-3 text-sm font-semibold">Add New Field</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Key (lowercase_underscore)</Label>
                  <input
                    className={`${inputClass} font-mono`}
                    placeholder="security_clearance"
                    value={newField.key}
                    onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Label</Label>
                  <input
                    className={inputClass}
                    placeholder="Security Clearance"
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <select
                    className={inputClass}
                    value={newField.type}
                    onChange={(e) => setNewField({ ...newField, type: e.target.value as NewField["type"] })}
                  >
                    <option value="text">text</option>
                    <option value="number">number</option>
                    <option value="select">select</option>
                    <option value="boolean">boolean</option>
                    <option value="date">date</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Required</Label>
                  <div className="flex h-9 items-center">
                    <Switch
                      checked={newField.required}
                      onCheckedChange={(v: boolean) => setNewField({ ...newField, required: v })}
                    />
                    <span className="ml-2 text-xs text-muted-foreground">{newField.required ? "Yes" : "No"}</span>
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Description</Label>
                  <input
                    className={inputClass}
                    placeholder="Optional description"
                    value={newField.description}
                    onChange={(e) => setNewField({ ...newField, description: e.target.value })}
                  />
                </div>
                {newField.type === "select" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Options (comma separated)</Label>
                    <input
                      className={inputClass}
                      placeholder="None, Confidential, Secret, Top Secret"
                      value={newField.options}
                      onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleAddField} disabled={!isEnterprise}>
                  <Plus className="h-4 w-4" /> Add Field
                </Button>
                <Button size="sm" variant="outline" onClick={() => void handleSave()} disabled={saving || !isEnterprise}>
                  <Save className="h-4 w-4" /> Save Schema
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Admin Copilot */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" /> Admin Infrastructure Copilot
            </CardTitle>
            <CardDescription>
              Natural language admin commands → safe JSON patches against organization_configs. Example: &quot;Hide the turnover card and add a clearance field&quot;. RCE-safe — no shell execution, only validated JSON patches via Python bridge.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="copilot-prompt">Admin Command</Label>
              <textarea
                id="copilot-prompt"
                className={textareaClass}
                placeholder="e.g., Hide the turnover card and add a security clearance field with options None, Secret, Top Secret"
                value={copilotInput}
                onChange={(e) => setCopilotInput(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void handleAdminCopilot()} disabled={copilotLoading || !isEnterprise} size="sm">
                {copilotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                Apply via Copilot
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCopilotInput("")}>
                Clear
              </Button>
            </div>
            {copilotResult && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{copilotResult}</div>
            )}
            <div className="rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
              <p className="font-semibold">How it works:</p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>Next.js route `/api/ai/admin-copilot` proxies to FastAPI bridge `/api/engine/admin-copilot/parse`</li>
                <li>Bridge LLM parses natural language into safe patch: {`{ widgets: [...], fields: [...] }`} with Zod validation</li>
                <li>Patch is applied via `updateOrganizationConfigAction` — requires FLUX-ENT + admin role, audited, no shell/RCE</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Raw JSON preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raw Configuration (JSON)</CardTitle>
            <CardDescription>Current organization_configs row — for debugging, RLS-protected</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[400px] overflow-auto rounded-md bg-secondary/50 p-4 text-xs">
              {JSON.stringify(config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* Locked overlay message */}
      {!isEnterprise && (
        <div className="absolute inset-0 z-10 flex items-start justify-center pt-20">
          <div className="glass rounded-xl border border-warning/30 bg-background/90 p-6 shadow-xl backdrop-blur-md">
            <div className="flex flex-col items-center gap-3 text-center">
              <Lock className="h-8 w-8 text-warning" />
              <h3 className="text-lg font-semibold">Enterprise Studio Locked</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                This studio requires a verified <code>FLUX-ENT</code> Enterprise license. Activate your key above to unlock widget customization, dynamic schema editing, and Admin Copilot.
              </p>
              <p className="text-xs text-muted-foreground">Attempting to save without ENT tier returns 403 ENTITLEMENT_REQUIRED</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
