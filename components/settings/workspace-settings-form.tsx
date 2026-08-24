"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { updateOrganization } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Organization } from "@/lib/types";

export function WorkspaceSettingsForm({
  organization,
}: {
  organization: Organization;
}) {
  const [name, setName] = React.useState(organization.name);
  const [slug, setSlug] = React.useState(organization.slug ?? "");
  const [loading, setLoading] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    await updateOrganization({ name, slug });
    setLoading(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="org-name">Workspace name</Label>
        <Input
          id="org-name"
          data-testid="settings-org-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-slug">URL slug</Label>
        <Input
          id="org-slug"
          value={slug}
          onChange={(event) =>
            setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
          }
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" data-testid="settings-org-save" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save workspace
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  );
}
