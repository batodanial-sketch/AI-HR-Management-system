"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { createWorkspace } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkspaceForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Workspace name is required.");
      return;
    }
    setLoading(true);
    try {
      await createWorkspace({ name, slug });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          data-testid="workspace-name-input"
          placeholder="Acme Inc."
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="workspace-slug">URL slug (optional)</Label>
        <Input
          id="workspace-slug"
          placeholder="acme-inc"
          value={slug}
          onChange={(event) =>
            setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
          }
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        data-testid="workspace-create-button"
        className="w-full"
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Create workspace <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}

export function WorkspaceFormHeader() {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-card shadow-lg">
        <BrandLogo size={36} alt="Fluxentiq logo" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Set up your workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a workspace to start managing your team and pipeline.
      </p>
    </div>
  );
}

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {children}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="glass-strong rounded-2xl p-6"
        >
          <WorkspaceForm />
        </motion.div>
      </div>
    </div>
  );
}
