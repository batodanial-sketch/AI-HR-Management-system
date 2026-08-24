"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, Save, Play, Power, PowerOff, Edit2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  listWorkflowTemplatesAction,
  createWorkflowTemplateAction,
  updateWorkflowTemplateAction,
  toggleWorkflowTemplateAction,
  deleteWorkflowTemplateAction,
  generateDailyWorkflowsAction,
  type WorkflowTemplateView,
} from "@/app/actions/workflowActions";
import type { WorkflowStep, WorkflowStepType } from "@/lib/workflow-engine";

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass =
  "flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const STEP_TYPES: Array<{ value: WorkflowStepType; label: string; desc: string }> = [
  { value: "attendance_auto_log", label: "Attendance Auto-Log", desc: "Auto-log attendance for employee" },
  { value: "performance_pulse_generation", label: "Performance Pulse", desc: "Generate daily performance pulse" },
  { value: "notification_dispatch", label: "Notification Dispatch", desc: "Send in-app/email notification" },
  { value: "ai_task_digest", label: "AI Task Digest", desc: "AI summarization of daily tasks" },
  { value: "performance_scoring", label: "Performance Scoring", desc: "Automated performance scoring" },
  { value: "anomaly_detection", label: "Anomaly Detection", desc: "Detect attendance/payroll anomalies" },
  { value: "custom", label: "Custom", desc: "Custom step" },
];

const ROLE_OPTIONS = [
  { value: "all", label: "All Employees" },
  { value: "employee", label: "Employees" },
  { value: "manager", label: "Managers" },
  { value: "admin", label: "Admins" },
  { value: "hr_admin", label: "HR Admins" },
  { value: "recruiter", label: "Recruiters" },
  { value: "finance_admin", label: "Finance Admins" },
];

type NewTemplate = {
  title: string;
  description: string;
  triggerType: "daily" | "cron" | "event" | "manual";
  scheduleTime: string;
  scheduleCron: string;
  targetRoles: string[];
  isActive: boolean;
  steps: WorkflowStep[];
};

function emptyStep(order: number): WorkflowStep {
  return {
    id: `step-${Date.now()}-${order}`,
    type: "attendance_auto_log",
    title: "New Step",
    order,
    enabled: true,
    config: {},
  };
}

export function TemplateBuilder() {
  const [templates, setTemplates] = React.useState<WorkflowTemplateView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [newTemplate, setNewTemplate] = React.useState<NewTemplate>({
    title: "",
    description: "",
    triggerType: "daily",
    scheduleTime: "09:00",
    scheduleCron: "0 9 * * 1-5",
    targetRoles: ["all"],
    isActive: true,
    steps: [emptyStep(0)],
  });
  const [generateDate, setGenerateDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listWorkflowTemplatesAction();
      if (res.success) setTemplates(res.data);
      else setError(res.error);
    } catch {
      setError("Failed to load workflow templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setNewTemplate({
      title: "",
      description: "",
      triggerType: "daily",
      scheduleTime: "09:00",
      scheduleCron: "0 9 * * 1-5",
      targetRoles: ["all"],
      isActive: true,
      steps: [emptyStep(0)],
    });
    setEditingId(null);
  };

  const handleCreateOrUpdate = async () => {
    if (!newTemplate.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (newTemplate.steps.length === 0) {
      setError("At least one step is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingId) {
        const res = await updateWorkflowTemplateAction({
          templateId: editingId,
          title: newTemplate.title,
          description: newTemplate.description || null,
          steps: newTemplate.steps,
          triggerType: newTemplate.triggerType,
          scheduleTime: newTemplate.scheduleTime || null,
          scheduleCron: newTemplate.scheduleCron || null,
          targetRoles: newTemplate.targetRoles,
          isActive: newTemplate.isActive,
        });
        if (res.success) {
          setSuccess(`Updated template: ${res.data.title}`);
          resetForm();
          void load();
        } else {
          setError(res.error);
        }
      } else {
        const res = await createWorkflowTemplateAction({
          title: newTemplate.title,
          description: newTemplate.description || null,
          steps: newTemplate.steps,
          triggerType: newTemplate.triggerType,
          scheduleTime: newTemplate.scheduleTime || null,
          scheduleCron: newTemplate.scheduleCron || null,
          targetRoles: newTemplate.targetRoles,
          isActive: newTemplate.isActive,
        });
        if (res.success) {
          setSuccess(`Created template: ${res.data.title}`);
          resetForm();
          void load();
        } else {
          setError(res.error);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tpl: WorkflowTemplateView) => {
    setEditingId(tpl.id);
    setNewTemplate({
      title: tpl.title,
      description: tpl.description ?? "",
      triggerType: tpl.triggerType as NewTemplate["triggerType"],
      scheduleTime: tpl.scheduleTime ?? "09:00",
      scheduleCron: tpl.scheduleCron ?? "0 9 * * 1-5",
      targetRoles: tpl.targetRoles,
      isActive: tpl.isActive,
      steps: tpl.steps.length ? tpl.steps.map((s, idx) => ({ ...s, order: idx })) : [emptyStep(0)],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    setError(null);
    try {
      const res = await toggleWorkflowTemplateAction({ templateId: id, isActive });
      if (res.success) {
        setSuccess(`${isActive ? "Activated" : "Deactivated"} ${res.data.title}`);
        void load();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workflow template? This cannot be undone.")) return;
    setError(null);
    try {
      const res = await deleteWorkflowTemplateAction({ templateId: id });
      if (res.success) {
        setSuccess("Template deleted.");
        void load();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await generateDailyWorkflowsAction({ taskDate: generateDate });
      if (res.success) {
        setSuccess(
          `Generated ${res.data.tasksGenerated} tasks for ${res.data.taskDate} — ${res.data.employeesScanned} employees, ${res.data.templatesEvaluated} templates`,
        );
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const addStep = () => {
    setNewTemplate((prev) => ({
      ...prev,
      steps: [...prev.steps, emptyStep(prev.steps.length)],
    }));
  };

  const updateStep = (idx: number, patch: Partial<WorkflowStep>) => {
    setNewTemplate((prev) => {
      const steps = [...prev.steps];
      steps[idx] = { ...steps[idx], ...patch };
      return { ...prev, steps };
    });
  };

  const removeStep = (idx: number) => {
    setNewTemplate((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })),
    }));
  };

  const toggleRole = (role: string) => {
    setNewTemplate((prev) => {
      const has = prev.targetRoles.includes(role);
      if (role === "all") {
        return { ...prev, targetRoles: has ? [] : ["all"] };
      }
      let next = has ? prev.targetRoles.filter((r) => r !== role) : [...prev.targetRoles.filter((r) => r !== "all"), role];
      if (next.length === 0) next = ["all"];
      return { ...prev, targetRoles: next };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading workflow templates...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {success && <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{success}</p>}

      {/* Manual trigger */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="h-4 w-4" /> Manual Trigger — Instant Testing
          </CardTitle>
          <CardDescription>Calls generateDailyWorkflowsAction for specified date. Idempotent via unique constraint.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="generate-date">Task Date</Label>
            <input id="generate-date" type="date" className={inputClass} value={generateDate} onChange={(e) => setGenerateDate(e.target.value)} />
          </div>
          <Button onClick={() => void handleGenerate()} disabled={generating} size="sm">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Generate Daily Workflows for {generateDate}
          </Button>
          <span className="text-xs text-muted-foreground">Also available via cron: GET /api/cron/daily-workflows with x-cron-secret header</span>
        </CardContent>
      </Card>

      {/* Template form */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Edit Workflow Template" : "Create Workflow Template"}</CardTitle>
          <CardDescription>Define recurring steps, schedule (daily/cron), and target roles. Stored in workflow_templates with RLS is_organization_member.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <input
                className={inputClass}
                placeholder="Daily Attendance Check-in"
                value={newTemplate.title}
                onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trigger Type</Label>
              <select
                className={inputClass}
                value={newTemplate.triggerType}
                onChange={(e) => setNewTemplate({ ...newTemplate, triggerType: e.target.value as NewTemplate["triggerType"] })}
              >
                <option value="daily">daily</option>
                <option value="cron">cron</option>
                <option value="event">event</option>
                <option value="manual">manual</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Schedule Time (HH:MM)</Label>
              <input
                className={inputClass}
                type="time"
                value={newTemplate.scheduleTime}
                onChange={(e) => setNewTemplate({ ...newTemplate, scheduleTime: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Schedule Cron (if cron trigger)</Label>
              <input
                className={inputClass}
                placeholder="0 9 * * 1-5"
                value={newTemplate.scheduleCron}
                onChange={(e) => setNewTemplate({ ...newTemplate, scheduleCron: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <textarea
                className={textareaClass}
                placeholder="What does this workflow do?"
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target Roles (who gets tasks)</Label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <label key={role.value} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={newTemplate.targetRoles.includes(role.value)}
                    onChange={() => toggleRole(role.value)}
                    className="rounded"
                  />
                  {role.label} <span className="font-mono text-[10px] text-muted-foreground">({role.value})</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Empty or &quot;all&quot; = all active employees. Stored as JSONB target_roles.</p>
          </div>

          <div className="space-y-2">
            <Label>Active</Label>
            <div className="flex items-center gap-2">
              <Switch checked={newTemplate.isActive} onCheckedChange={(v: boolean) => setNewTemplate({ ...newTemplate, isActive: v })} />
              <span className="text-xs text-muted-foreground">{newTemplate.isActive ? "Active — will generate daily" : "Inactive"}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Steps (auto-log attendance, performance pulses, notifications, AI digests)</Label>
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-4 w-4" /> Add Step
              </Button>
            </div>

            {newTemplate.steps.map((step, idx) => (
              <div key={step.id} className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Step ID</Label>
                    <input
                      className={`${inputClass} font-mono text-xs`}
                      value={step.id}
                      onChange={(e) => updateStep(idx, { id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select
                      className={inputClass}
                      value={step.type}
                      onChange={(e) => updateStep(idx, { type: e.target.value as WorkflowStepType })}
                    >
                      {STEP_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <input
                      className={inputClass}
                      value={step.title}
                      onChange={(e) => updateStep(idx, { title: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Config (JSON)</Label>
                    <textarea
                      className={textareaClass}
                      placeholder='{"grace_minutes": 15, "channel": "in_app"}'
                      value={JSON.stringify(step.config ?? {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value) as Record<string, unknown>;
                          updateStep(idx, { config: parsed });
                        } catch {
                          // Allow invalid JSON while typing, but don't save
                        }
                      }}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Enabled & Order</Label>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={step.enabled !== false}
                        onCheckedChange={(v: boolean) => updateStep(idx, { enabled: v })}
                      />
                      <span className="text-xs">Order: {step.order}</span>
                      <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => removeStep(idx)}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {STEP_TYPES.find((t) => t.value === step.type)?.desc ?? ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void handleCreateOrUpdate()} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "Update Template" : "Create Template"}
            </Button>
            {editingId && (
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel Edit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Templates list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing Workflow Templates ({templates.length})</CardTitle>
          <CardDescription>CRUD for recurring workflow templates — org-isolated RLS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.map((tpl) => (
            <div key={tpl.id} className="flex flex-col gap-2 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{tpl.title}</p>
                  <Badge variant={tpl.isActive ? "success" : "secondary"}>{tpl.isActive ? "Active" : "Inactive"}</Badge>
                  <Badge variant="outline" className="text-xs">
                    {tpl.triggerType}
                  </Badge>
                  {tpl.scheduleTime && (
                    <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                      <Clock className="h-3 w-3" /> {tpl.scheduleTime}
                    </Badge>
                  )}
                  {tpl.scheduleCron && <span className="font-mono text-xs text-muted-foreground">{tpl.scheduleCron}</span>}
                </div>
                {tpl.description && <p className="text-xs text-muted-foreground">{tpl.description}</p>}
                <div className="flex flex-wrap gap-1">
                  {tpl.steps.map((s) => (
                    <Badge key={s.id} variant="outline" className="text-[10px]">
                      {s.type}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {tpl.targetRoles.map((r) => (
                    <Badge key={r} variant="secondary" className="text-[10px]">
                      {r}
                    </Badge>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{tpl.id.slice(0, 8)} · updated {new Date(tpl.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleEdit(tpl)}>
                  <Edit2 className="h-3 w-3" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void handleToggle(tpl.id, !tpl.isActive)}
                >
                  {tpl.isActive ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                  {tpl.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void handleDelete(tpl.id)}>
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </div>
          ))}
          {templates.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No workflow templates. Create one above.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
