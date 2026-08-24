"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { updateProfile } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SessionUser } from "@/lib/auth";

export function ProfileForm({ user }: { user: SessionUser }) {
  const [fullName, setFullName] = React.useState(user.fullName);
  const [title, setTitle] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    await updateProfile({ fullName, title });
    setLoading(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Full name</Label>
        <Input
          id="profile-name"
          data-testid="settings-profile-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-title">Job title</Label>
        <Input
          id="profile-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="HR Administrator"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" data-testid="settings-profile-save" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save profile
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  );
}
