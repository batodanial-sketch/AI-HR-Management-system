"use client";

import * as React from "react";
import { CheckCircle2, Database, Loader2, Save, XCircle } from "lucide-react";
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
import {
  MEMORY_PROVIDER_LABELS,
  type MemoryProvider,
  type MemorySettings,
} from "@/lib/memory/types";

interface TestResult {
  ok: boolean;
  message: string;
}

const PROVIDERS: MemoryProvider[] = [
  "supabase",
  "postgresql",
  "xata",
  "sqlite",
  "custom",
  "local",
];

/**
 * Memory — the pluggable storage backend. Supabase is the default; buyers can
 * switch to PostgreSQL, Xata, SQLite, a custom endpoint, or local on-device
 * storage. Persisted to `data/settings.json` and testable inline.
 */
export function MemorySettings() {
  const [form, setForm] = React.useState<MemorySettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);

  React.useEffect(() => {
    void fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { memory?: MemorySettings }) => {
        if (data.memory) {
          setForm(data.memory);
        }
      });
  }, []);

  if (!form) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-10 w-full" />
        ))}
      </div>
    );
  }

  const setProvider = (provider: MemoryProvider) =>
    setForm((prev) => (prev ? { ...prev, provider } : prev));

  const setConnection = <K extends keyof MemorySettings["connection"]>(
    key: K,
    value: MemorySettings["connection"][K],
  ) =>
    setForm((prev) =>
      prev ? { ...prev, connection: { ...prev.connection, [key]: value } } : prev,
    );

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory: form }),
    });
    setSaving(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const test = async () => {
    if (!form) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/settings/memory/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: form.provider, connection: form.connection }),
      });
      const data = (await response.json()) as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: "Could not run the test." });
    } finally {
      setTesting(false);
    }
  };

  const needsConnectionString =
    form.provider === "postgresql" || form.provider === "xata";
  const needsCustom =
    form.provider === "custom";
  const needsSqlite =
    form.provider === "sqlite" || form.provider === "local";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="memory-provider">Storage backend</Label>
        <Select
          value={form.provider}
          onValueChange={(value) => setProvider(value as MemoryProvider)}
        >
          <SelectTrigger id="memory-provider" data-testid="memory-provider-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {MEMORY_PROVIDER_LABELS[provider]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {form.provider === "supabase"
            ? "Supabase is the default. Credentials come from your environment variables."
            : form.provider === "local"
              ? "Local memory is stored as a SQLite file on this device."
              : "Configure the connection below."}
        </p>
      </div>

      {needsConnectionString && (
        <div className="space-y-2">
          <Label htmlFor="memory-conn-string">Connection string</Label>
          <Input
            id="memory-conn-string"
            data-testid="memory-conn-string-input"
            value={form.connection.connectionString}
            onChange={(event) => setConnection("connectionString", event.target.value)}
            placeholder={
              form.provider === "xata"
                ? "postgresql://…:…@….xata.sh/…"
                : "postgresql://user:pass@host:5432/db"
            }
          />
          <p className="text-xs text-muted-foreground">
            Or fill in the discrete fields below (they are used when the string
            is empty).
          </p>
        </div>
      )}

      {needsConnectionString && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Host">
            <Input
              value={form.connection.host}
              onChange={(event) => setConnection("host", event.target.value)}
              placeholder="localhost"
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={form.connection.port}
              onChange={(event) => setConnection("port", Number(event.target.value))}
              placeholder="5432"
            />
          </Field>
          <Field label="Database">
            <Input
              value={form.connection.database}
              onChange={(event) => setConnection("database", event.target.value)}
              placeholder="fluxentiq"
            />
          </Field>
          <Field label="User">
            <Input
              value={form.connection.user}
              onChange={(event) => setConnection("user", event.target.value)}
              placeholder="postgres"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={form.connection.password}
              onChange={(event) => setConnection("password", event.target.value)}
              placeholder="••••••"
              autoComplete="off"
            />
          </Field>
        </div>
      )}

      {needsSqlite && (
        <div className="space-y-2">
          <Label htmlFor="memory-sqlite-path">SQLite file path</Label>
          <Input
            id="memory-sqlite-path"
            data-testid="memory-sqlite-path-input"
            value={form.connection.sqlitePath}
            onChange={(event) => setConnection("sqlitePath", event.target.value)}
            placeholder="data/local-memory.sqlite"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to use the default path on this device.
          </p>
        </div>
      )}

      {needsCustom && (
        <>
          <div className="space-y-2">
            <Label htmlFor="memory-custom-url">Base URL</Label>
            <Input
              id="memory-custom-url"
              data-testid="memory-custom-url-input"
              value={form.connection.customBaseUrl}
              onChange={(event) => setConnection("customBaseUrl", event.target.value)}
              placeholder="https://your-postgrest.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="memory-custom-key">API key</Label>
            <Input
              id="memory-custom-key"
              type="password"
              value={form.connection.customApiKey}
              onChange={(event) => setConnection("customApiKey", event.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </div>
        </>
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
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" data-testid="memory-save-button" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="memory-test-button"
          onClick={() => void test()}
          disabled={testing}
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          Test connection
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
