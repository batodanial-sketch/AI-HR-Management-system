"use client";

import * as React from "react";
import { UserPlus, X } from "lucide-react";
import { addMemberByEmail, removeMember, updateMemberRole } from "@/lib/actions";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgMember, OrgRole } from "@/lib/types";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
};

function canManage(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function MembersTable({
  members,
  currentUserId,
  currentRole,
}: {
  members: OrgMember[];
  currentUserId: string;
  currentRole: OrgRole | null;
}) {
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrgRole>("member");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const manager = canManage(currentRole);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await addMemberByEmail({ email: inviteEmail, role: inviteRole });
      setInviteEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (userId: string, role: OrgRole) => {
    await updateMemberRole(userId, role);
  };

  const handleRemove = async (userId: string) => {
    await removeMember(userId);
  };

  return (
    <div className="space-y-4">
      {manager && (
        <form onSubmit={handleInvite} className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            placeholder="teammate@company.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="flex-1"
            required
          />
          <div className="flex gap-2">
            <Select
              value={inviteRole}
              onValueChange={(value) => setInviteRole(value as OrgRole)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={busy}>
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const isOwner = member.role === "owner";
          const canModify = manager && !isSelf && !isOwner;
          return (
            <div
              key={member.id}
              className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <NameAvatar name={member.fullName} className="h-8 w-8" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {member.fullName}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {manager && canModify ? (
                  <>
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        void handleRoleChange(member.userId, value as OrgRole)
                      }
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void handleRemove(member.userId)}
                      aria-label={`Remove ${member.fullName}`}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                ) : (
                  <Badge variant={isOwner ? "accent" : "secondary"}>
                    {ROLE_LABEL[member.role]}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
