"use client";

import * as React from "react";
import { KeyRound, Palette, Database, Users, Brush, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { AppearanceSettings } from "./appearance-settings";
import { ApiKeysSettings } from "./api-keys-settings";
import { MemorySettings } from "./memory-settings";
import { BrandingSettings } from "./branding-settings";
import { LicenseWidget } from "./license-widget";
import { MembersTable } from "./members-table";
import { WorkspaceSettingsForm } from "./workspace-settings-form";
import { DeleteAccount } from "./delete-account";
import { Badge } from "@/components/ui/badge";
import type { SessionUser } from "@/lib/auth";
import type { Organization, OrgMember } from "@/lib/types";

export function SettingsShell({
  user,
  organization,
  members,
  headcount,
}: {
  user: SessionUser;
  organization: Organization | null;
  members: OrgMember[];
  headcount: number;
}) {
  return (
    <Tabs defaultValue="general" className="space-y-4">
      <TabsList className="flex-wrap">
        <TabsTrigger value="general">
          <Palette className="mr-2 h-4 w-4" /> General
        </TabsTrigger>
        <TabsTrigger value="ai">
          <KeyRound className="mr-2 h-4 w-4" /> AI Provider
        </TabsTrigger>
        <TabsTrigger value="branding">
          <Brush className="mr-2 h-4 w-4" /> Branding
        </TabsTrigger>
        <TabsTrigger value="memory">
          <Database className="mr-2 h-4 w-4" /> Memory
        </TabsTrigger>
        <TabsTrigger value="team">
          <Users className="mr-2 h-4 w-4" /> Team
        </TabsTrigger>
        <TabsTrigger value="license">
          <ShieldCheck className="mr-2 h-4 w-4" /> License
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Account</CardTitle>
              <CardDescription>Your name and title across the workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm user={user} />
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Appearance</CardTitle>
              <CardDescription>Theme and brand accent color.</CardDescription>
            </CardHeader>
            <CardContent>
              <AppearanceSettings />
            </CardContent>
          </Card>
        </div>

        <Card className="glass border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently erase your account, profile and personal data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Deleting your account removes your login and anonymizes your
              linked employee record. This cannot be undone.
            </p>
            <DeleteAccount />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ai">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">AI Provider</CardTitle>
            <CardDescription>
              Bring your own key — OpenAI, Claude, Gemini, Groq, or a custom /
              local endpoint (Ollama, vLLM, LM Studio). The bridge uses this
              provider for all AI features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeysSettings />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="branding">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">White-label branding</CardTitle>
            <CardDescription>
              Customize the application name, vendor name, accent color and
              logo/favicon. Applied globally across titles, headers and buttons.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BrandingSettings />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="memory">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Memory</CardTitle>
            <CardDescription>
              Choose where your data lives. Supabase is the default; you can
              switch to PostgreSQL, Xata, SQLite, a custom endpoint, or a local
              store on this device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemorySettings />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="team" className="space-y-4">
        {organization && (
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Workspace</CardTitle>
                <CardDescription>Workspace details and URL slug.</CardDescription>
              </div>
              <Badge variant="accent" className="capitalize">
                {organization.plan}
              </Badge>
            </CardHeader>
            <CardContent>
              <WorkspaceSettingsForm organization={organization} />
            </CardContent>
          </Card>
        )}

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Team members</CardTitle>
            <CardDescription>Invite teammates and manage their roles.</CardDescription>
          </CardHeader>
          <CardContent>
            <MembersTable
              members={members}
              currentUserId={user.id}
              currentRole={user.role}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="license">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Instance & License</CardTitle>
            <CardDescription>
              The active license for this instance — tier, licensed organization,
              expiry and seat usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LicenseWidget headcount={headcount} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
