"use client";

import * as React from "react";
import { Loader2, CheckCircle2, Clock, Play, AlertCircle, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  listDailyTasksAction,
  updateTaskStatusAction,
  executeWorkflowStepAction,
  type DailyTaskView,
} from "@/app/actions/workflowActions";
import { formatDate } from "@/lib/utils";

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type TaskFilter = {
  status: string;
};

const STATUS_VARIANTS: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive"; icon: React.ReactNode }> = {
  pending: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: "In Progress", variant: "default", icon: <Play className="h-3 w-3" /> },
  completed: { label: "Completed", variant: "success", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: "Failed", variant: "destructive", icon: <AlertCircle className="h-3 w-3" /> },
  skipped: { label: "Skipped", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
};

export function DailyTaskBoard() {
  const [selectedDate, setSelectedDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = React.useState<TaskFilter>({ status: "" });
  const [tasks, setTasks] = React.useState<DailyTaskView[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDailyTasksAction({
        taskDate: selectedDate,
        status: filter.status || undefined,
        page: 1,
        pageSize: 100,
      });
      if (res.success) {
        setTasks(res.data.rows);
        setTotal(res.data.total);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to load daily tasks.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filter.status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleStatusUpdate = async (taskId: string, status: DailyTaskView["status"]) => {
    setActionLoading(taskId);
    setError(null);
    setSuccess(null);
    try {
      const res = await updateTaskStatusAction({ taskId, status: status as never });
      if (res.success) {
        setSuccess(`Task ${taskId.slice(0, 8)} marked as ${status}`);
        void load();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status update failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecuteStep = async (taskId: string, stepId: string, stepType: string, config?: Record<string, unknown>) => {
    setActionLoading(`${taskId}:${stepId}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await executeWorkflowStepAction({
        taskId,
        stepId,
        stepType: stepType as never,
        config,
      });
      if (res.success) {
        setSuccess(`Executed step ${stepId} for task ${taskId.slice(0, 8)}`);
        void load();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Step execution failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const grouped = React.useMemo(() => {
    const groups: Record<string, DailyTaskView[]> = {
      pending: [],
      in_progress: [],
      completed: [],
      failed: [],
      skipped: [],
      cancelled: [],
    };
    for (const t of tasks) {
      const key = t.status in groups ? t.status : "pending";
      groups[key].push(t);
    }
    return groups;
  }, [tasks]);

  const changeDate = (offset: number) => {
    const d = new Date(`${selectedDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-6">
      {/* Date picker & filters */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" /> Daily Task Board — {selectedDate}
          </CardTitle>
          <CardDescription>Checklist for active date showing pending, in-progress, completed. Navigate history and future schedules.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="task-date">Task Date</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
                  ← Yesterday
                </Button>
                <input
                  id="task-date"
                  type="date"
                  className={inputClass}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={() => changeDate(1)}>
                  Tomorrow →
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}>
                  Today
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-status">Status Filter</Label>
              <select
                id="task-status"
                className={inputClass}
                value={filter.status}
                onChange={(e) => setFilter({ status: e.target.value })}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>

            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{total} tasks for {selectedDate}</span>
            <span>·</span>
            <span>Pending: {grouped.pending.length}</span>
            <span>In Progress: {grouped.in_progress.length}</span>
            <span>Completed: {grouped.completed.length}</span>
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {success && <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{success}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">Loading tasks for {selectedDate}...</span>
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No tasks for {selectedDate}. Generate via Admin → Workflow Templates → Manual Trigger or Cron.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Pending */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" /> Pending ({grouped.pending.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {grouped.pending.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  actionLoading={actionLoading}
                  onStatusUpdate={handleStatusUpdate}
                  onExecuteStep={handleExecuteStep}
                />
              ))}
              {grouped.pending.length === 0 && <p className="text-xs text-muted-foreground">No pending tasks</p>}
            </CardContent>
          </Card>

          {/* In Progress */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Play className="h-4 w-4" /> In Progress ({grouped.in_progress.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {grouped.in_progress.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  actionLoading={actionLoading}
                  onStatusUpdate={handleStatusUpdate}
                  onExecuteStep={handleExecuteStep}
                />
              ))}
              {grouped.in_progress.length === 0 && <p className="text-xs text-muted-foreground">No in-progress tasks</p>}
            </CardContent>
          </Card>

          {/* Completed / Failed */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4" /> Completed ({grouped.completed.length}) + Failed ({grouped.failed.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...grouped.completed, ...grouped.failed].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  actionLoading={actionLoading}
                  onStatusUpdate={handleStatusUpdate}
                  onExecuteStep={handleExecuteStep}
                />
              ))}
              {grouped.completed.length + grouped.failed.length === 0 && (
                <p className="text-xs text-muted-foreground">No completed/failed tasks</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  actionLoading,
  onStatusUpdate,
  onExecuteStep,
}: {
  task: DailyTaskView;
  actionLoading: string | null;
  onStatusUpdate: (id: string, status: string) => void;
  onExecuteStep: (taskId: string, stepId: string, stepType: string, config?: Record<string, unknown>) => void;
}) {
  const statusInfo = STATUS_VARIANTS[task.status] ?? STATUS_VARIANTS.pending;
  const payload = task.payload as {
    template_title?: string;
    steps?: Array<{ id: string; type: string; title: string; config?: Record<string, unknown> }>;
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={statusInfo.variant as never} className="flex items-center gap-1 text-xs">
              {statusInfo.icon} {statusInfo.label}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">{task.id.slice(0, 8)}</span>
          </div>
          <p className="text-sm font-medium">{payload.template_title ?? task.workflowTemplateId?.slice(0, 8) ?? "Daily Task"}</p>
          <p className="text-xs text-muted-foreground">
            Employee: <span className="font-mono">{task.employeeId.slice(0, 8)}</span> · Due: {task.dueTime ?? "—"} · {formatDate(task.createdAt)}
          </p>
        </div>
      </div>

      {payload.steps && payload.steps.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Steps</p>
          {payload.steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between rounded-md bg-secondary/40 px-2 py-1.5">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">{step.title}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{step.type} · {step.id}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onExecuteStep(task.id, step.id, step.type, step.config)}
                disabled={!!actionLoading}
              >
                {actionLoading === `${task.id}:${step.id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Run
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {task.status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onStatusUpdate(task.id, "in_progress")}
            disabled={!!actionLoading}
          >
            {actionLoading === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Start
          </Button>
        )}
        {task.status !== "completed" && (
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => onStatusUpdate(task.id, "completed")}
            disabled={!!actionLoading}
          >
            <CheckCircle2 className="h-3 w-3" /> Complete
          </Button>
        )}
        {task.status !== "failed" && task.status !== "completed" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => onStatusUpdate(task.id, "failed")}
            disabled={!!actionLoading}
          >
            <AlertCircle className="h-3 w-3" /> Fail
          </Button>
        )}
      </div>
    </div>
  );
}
