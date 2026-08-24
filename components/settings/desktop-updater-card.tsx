"use client";

import * as React from "react";
import { Loader2, Download, RefreshCw, Monitor, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface UpdaterState {
  isDesktop: boolean;
  version: string;
  channel: string;
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  availableVersion?: string;
  error?: string;
  progress?: {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
  };
  releaseNotes?: string | string[] | null;
  lastChecked?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function DesktopUpdaterCard() {
  const [state, setState] = React.useState<UpdaterState>({
    isDesktop: false,
    version: "unknown",
    channel: "latest",
    status: "idle",
  });
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    const isDesktop = Boolean(window.electron?.isDesktop);
    setState((prev) => ({ ...prev, isDesktop }));

    if (!isDesktop) {
      // Browser mode — show placeholder
      setState((prev) => ({
        ...prev,
        version: "web",
        channel: "web",
        status: "idle",
      }));
      return;
    }

    // Fetch version and channel
    void Promise.all([
      window.electron?.updater.getVersion().then((v) => setState((prev) => ({ ...prev, version: v }))).catch(() => {}),
      window.electron?.updater.getUpdateChannel().then((c) => setState((prev) => ({ ...prev, channel: c }))).catch(() => {}),
    ]);

    // Wire listeners — typed, return unsubscribe
    const unsubscribes: Array<() => void> = [];

    try {
      const offAvailable = window.electron?.updater.onUpdateAvailable((info) => {
        setState((prev) => ({
          ...prev,
          status: "available",
          availableVersion: info.version,
          releaseNotes: info.releaseNotes,
          lastChecked: new Date().toISOString(),
        }));
      });
      if (offAvailable) unsubscribes.push(offAvailable);

      const offNotAvailable = window.electron?.updater.onUpdateNotAvailable((info) => {
        setState((prev) => ({
          ...prev,
          status: "not-available",
          availableVersion: undefined,
          lastChecked: new Date().toISOString(),
        }));
      });
      if (offNotAvailable) unsubscribes.push(offNotAvailable);

      const offDownloaded = window.electron?.updater.onUpdateDownloaded((info) => {
        setState((prev) => ({
          ...prev,
          status: "downloaded",
          availableVersion: info.version,
          releaseNotes: info.releaseNotes,
          progress: { bytesPerSecond: 0, percent: 100, transferred: prev.progress?.total ?? 0, total: prev.progress?.total ?? 0 },
        }));
      });
      if (offDownloaded) unsubscribes.push(offDownloaded);

      const offError = window.electron?.updater.onUpdateError((error) => {
        setState((prev) => ({
          ...prev,
          status: "error",
          error,
        }));
      });
      if (offError) unsubscribes.push(offError);

      const offProgress = window.electron?.updater.onDownloadProgress((progress) => {
        setState((prev) => ({
          ...prev,
          status: "downloading",
          progress,
        }));
      });
      if (offProgress) unsubscribes.push(offProgress);
    } catch {
      // Preload not available — ignore
    }

    return () => {
      for (const off of unsubscribes) {
        try {
          off();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  const handleCheck = async () => {
    if (!window.electron?.isDesktop) return;
    setChecking(true);
    setState((prev) => ({ ...prev, status: "checking", error: undefined }));
    try {
      const result = await window.electron.updater.checkForUpdates();
      if (!result.checking) {
        setState((prev) => ({
          ...prev,
          status: result.message?.includes("disabled") ? "idle" : "error",
          error: result.message,
        }));
      } else {
        setState((prev) => ({ ...prev, lastChecked: new Date().toISOString() }));
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setChecking(false);
    }
  };

  const handleQuitAndInstall = async () => {
    if (!window.electron?.isDesktop) return;
    try {
      await window.electron.updater.quitAndInstall();
    } catch {
      // Ignore
    }
  };

  const statusBadge = () => {
    switch (state.status) {
      case "checking":
        return <Badge variant="secondary">Checking...</Badge>;
      case "available":
        return <Badge variant="default">Update Available: {state.availableVersion}</Badge>;
      case "downloading":
        return <Badge variant="default">Downloading {state.progress?.percent.toFixed(0) ?? 0}%</Badge>;
      case "downloaded":
        return <Badge variant="success">Ready to Install: {state.availableVersion}</Badge>;
      case "not-available":
        return <Badge variant="success">Up to Date</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Idle</Badge>;
    }
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Monitor className="h-4 w-4" /> Desktop App — Auto-Updater
        </CardTitle>
        <CardDescription>
          Version, release channel, manual check, and download progress. Powered by electron-updater generic provider via FLUXENTIQ_UPDATE_URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!state.isDesktop ? (
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Running in Browser</p>
                <p className="text-xs text-muted-foreground">
                  Desktop updater is only available in Electron. Current build is web mode (version: {state.version}, channel: {state.channel}).
                  Build the desktop app via <code className="font-mono text-xs">cd electron-app && npm run make</code> and set <code>FLUXENTIQ_UPDATE_URL</code> + <code>FLUXENTIQ_UPDATE_CHANNEL</code> env vars for release feed.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Current Version</p>
                <p className="mt-1 font-mono text-sm font-medium">{state.version}</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Release Channel</p>
                <p className="mt-1 text-sm font-medium capitalize">{state.channel}</p>
                <p className="text-[10px] text-muted-foreground">from FLUXENTIQ_UPDATE_CHANNEL env</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
                <div className="mt-1 flex items-center gap-2">{statusBadge()}</div>
                {state.lastChecked && (
                  <p className="mt-1 text-[10px] text-muted-foreground">Last checked: {new Date(state.lastChecked).toLocaleTimeString()}</p>
                )}
              </div>
            </div>

            {state.progress && state.status === "downloading" && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Downloading {state.availableVersion ?? ""}</p>
                  <p className="text-xs text-muted-foreground">{state.progress.percent.toFixed(1)}%</p>
                </div>
                <Progress value={state.progress.percent} className="h-2" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {formatBytes(state.progress.transferred)} / {formatBytes(state.progress.total)}
                  </span>
                  <span>{formatSpeed(state.progress.bytesPerSecond)}</span>
                </div>
              </div>
            )}

            {state.status === "downloaded" && (
              <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Update Ready — {state.availableVersion}</p>
                    {state.releaseNotes && (
                      <p className="text-xs text-muted-foreground">
                        Release notes: {Array.isArray(state.releaseNotes) ? state.releaseNotes.join(", ") : String(state.releaseNotes).slice(0, 300)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Click Restart to install the update. The app will quit and install automatically on next launch if you choose Later.</p>
                  </div>
                </div>
              </div>
            )}

            {state.status === "error" && state.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-xs font-semibold text-destructive">Updater Error</p>
                    <p className="mt-1 text-xs text-destructive">{state.error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleCheck()} disabled={checking} size="sm" variant="outline">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Check for Updates
              </Button>
              {state.status === "downloaded" && (
                <Button onClick={() => void handleQuitAndInstall()} size="sm">
                  <Download className="h-4 w-4" /> Restart & Install {state.availableVersion}
                </Button>
              )}
              <span className="flex items-center text-xs text-muted-foreground">
                Auto-check runs on app start (production only, app.isPackaged). Manual check works in packaged builds. Feed: FLUXENTIQ_UPDATE_URL env.
              </span>
            </div>

            <div className="rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
              <p className="font-semibold">Security & Forge Alignment:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Navigation locked to env-driven origins: FLUXENTIQ_DESKTOP_URL + NEXT_PUBLIC_SUPABASE_URL + FLUXENTIQ_ALLOWED_ORIGINS (no hardcoded Supabase project)</li>
                <li>Publish config: build.publish.generic.url=${"{env.FLUXENTIQ_UPDATE_URL}"} in package.json + publisher-generic in forge.config.js</li>
                <li>Channel exposed via IPC getUpdateChannel() from FLUXENTIQ_UPDATE_CHANNEL env (latest/beta/alpha)</li>
                <li>Code signing placeholders via APPLE_ID / CSC_LINK env — no-op when unset</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
