"use client";

import * as React from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Plug, Save, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeatureAccess } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import type { AiProviderSettings } from "@/lib/settings/config";

/** Provider definitions with their model presets. */
const PROVIDERS: Array<{
  value: AiProviderSettings["provider"];
  label: string;
  models: string[];
  needsBaseUrl: boolean;
}> = [
  {
    value: "groq",
    label: "Groq",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    needsBaseUrl: false,
  },
  {
    value: "openai",
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    needsBaseUrl: false,
  },
  {
    value: "anthropic",
    label: "Anthropic Claude",
    models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
    needsBaseUrl: false,
  },
  {
    value: "gemini",
    label: "Google Gemini",
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    needsBaseUrl: false,
  },
  {
    value: "custom",
    label: "Custom / Local (Ollama, vLLM, LM Studio, Azure)",
    models: [],
    needsBaseUrl: true,
  },
];

interface TestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  message?: string;
}

/**
 * AI Provider — the "bring any key" configuration. Admin selects the vendor,
 * enters a masked key, picks/enters a model, and tests the connection against
 * the Python bridge before saving.
 */
export function ApiKeysSettings() {
  const canCustomAi = useFeatureAccess("custom_ai");
  const { toast } = useToast();
  const [form, setForm] = React.useState<AiProviderSettings>({
    provider: "groq",
    apiKey: "",
    model: "",
    baseUrl: "",
  });
  const [showKey, setShowKey] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);

  React.useEffect(() => {
    void fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { ai?: AiProviderSettings }) => {
        if (data.ai) {
          setForm(data.ai);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const provider = PROVIDERS.find((item) => item.value === form.provider) ?? PROVIDERS[0];

  const setField = <K extends keyof AiProviderSettings>(
    key: K,
    value: AiProviderSettings[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "provider") {
      // Reset the model to the first preset when switching vendors.
      const nextProvider = PROVIDERS.find((item) => item.value === value);
      setForm((prev) => ({
        ...prev,
        model: nextProvider?.models[0] ?? "",
      }));
    }
    setTestResult(null);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai: form }),
    });
    setSaving(false);
    setSaved(true);
    toast({
      title: "AI provider saved",
      description: `${form.provider} is now the active provider. Restart the bridge to apply.`,
      variant: "success",
    });
    window.setTimeout(() => setSaved(false), 2500);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the bridge reads the latest credentials, then test.
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai: form }),
      });
      const response = await fetch("/api/ai/test-connection", { method: "POST" });
      const data = (await response.json()) as TestResult;
      setTestResult({ ...data, ok: response.ok && data.ok });
    } catch {
      setTestResult({ ok: false, message: "Could not reach the AI bridge." });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!canCustomAi && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The free trial uses the default Groq route. Custom AI provider
            configuration is a Pro feature —{" "}
            <a href="/settings/license" className="font-medium underline underline-offset-2">
              upgrade to unlock
            </a>
            .
          </span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="ai-provider">Provider</Label>
        <Select
          value={form.provider}
          onValueChange={(value) => setField("provider", value)}
          disabled={!canCustomAi}
        >
          <SelectTrigger id="ai-provider" data-testid="ai-provider-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={!canCustomAi && item.value !== "groq"}
              >
                {item.label}
                {!canCustomAi && item.value !== "groq" && " 🔒"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-key">API key</Label>
        <div className="relative">
          <Input
            id="ai-key"
            type={showKey ? "text" : "password"}
            data-testid="ai-api-key-input"
            value={form.apiKey}
            onChange={(event) => setField("apiKey", event.target.value)}
            placeholder={provider.needsBaseUrl ? "Endpoint key (optional)" : "sk-…"}
            autoComplete="off"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey((prev) => !prev)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showKey ? "Hide API key" : "Show API key"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-model">Model</Label>
        {provider.models.length > 0 ? (
          <Select value={form.model} onValueChange={(value) => setField("model", value)}>
            <SelectTrigger id="ai-model" data-testid="ai-model-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="ai-model"
            data-testid="ai-model-input"
            value={form.model}
            onChange={(event) => setField("model", event.target.value)}
            placeholder="llama3 / mistral / gpt-4o …"
          />
        )}
      </div>

      {provider.needsBaseUrl && (
        <div className="space-y-2">
          <Label htmlFor="ai-base-url">Base URL (required)</Label>
          <Input
            id="ai-base-url"
            data-testid="ai-base-url-input"
            value={form.baseUrl}
            onChange={(event) => setField("baseUrl", event.target.value)}
            placeholder="http://localhost:11434/v1"
          />
          <p className="text-xs text-muted-foreground">
            Ollama, vLLM, LM Studio, Azure OpenAI, or any OpenAI-compatible
            endpoint.
          </p>
        </div>
      )}

      {testResult && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            testResult.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {testResult.ok
              ? `${testResult.message ?? "Connected"} (${testResult.provider ?? ""} / ${testResult.model ?? ""})`
              : testResult.message ?? "Connection failed."}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" data-testid="ai-save-button" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="ai-test-button"
          onClick={() => void test()}
          disabled={testing}
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Test connection
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        Keys are stored in <code className="font-mono">data/settings.json</code>{" "}
        and read by the AI bridge. Restart the bridge after saving to apply
        changes.
      </p>
    </div>
  );
}
