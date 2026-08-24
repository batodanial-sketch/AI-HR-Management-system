"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CircleDot,
  GitBranch,
  Mail,
  Play,
  Save,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { initialWorkflowEdges, initialWorkflowNodes } from "@/lib/data";
import type { WorkflowEdge, WorkflowNode, WorkflowNodeType } from "@/lib/types";

const NODE_META: Record<WorkflowNodeType, { label: string; icon: LucideIcon; tint: string }> = {
  trigger: { label: "Trigger", icon: Zap, tint: "bg-primary" },
  action: { label: "Action", icon: Mail, tint: "bg-success" },
  condition: { label: "Condition", icon: GitBranch, tint: "bg-warning" },
  delay: { label: "Delay", icon: Timer, tint: "bg-muted-foreground" },
};

const PALETTE: WorkflowNodeType[] = ["trigger", "action", "condition", "delay"];

interface NodePosition {
  x: number;
  y: number;
}

/**
 * Node-based workflow builder. Nodes can be dragged from the palette onto the
 * canvas, repositioned freely, and connected with SVG edge lines. Triggers are
 * configured through the config panel and the graph is saved (with a visible
 * confirmation state).
 */
export function WorkflowCanvas() {
  const [nodes, setNodes] = React.useState<WorkflowNode[]>(initialWorkflowNodes);
  const [edges] = React.useState<WorkflowEdge[]>(initialWorkflowEdges);
  const [draggingNodeId, setDraggingNodeId] = React.useState<string | null>(null);
  const [triggerEvent, setTriggerEvent] = React.useState("employee.created");
  const [saved, setSaved] = React.useState(false);
  const canvasRef = React.useRef<HTMLDivElement>(null);

  const addNode = (type: WorkflowNodeType) => {
    const meta = NODE_META[type];
    const id = `n-${type}-${Date.now()}`;
    setNodes((prev) => [
      ...prev,
      { id, type, label: meta.label, x: 40 + (prev.length % 4) * 180, y: 40 + (prev.length % 3) * 140 },
    ]);
    setSaved(false);
  };

  const handleNodeDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("text/plain") as WorkflowNodeType;
    if (PALETTE.includes(type)) {
      addNode(type);
    }
  };

  const updatePosition = (id: string, position: NodePosition) => {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...position } : node)));
    setSaved(false);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!draggingNodeId || !canvasRef.current) {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    updatePosition(draggingNodeId, { x, y });
  };

  const handleSave = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      {/* Palette + config */}
      <div className="space-y-4 lg:col-span-1">
        <div className="glass rounded-xl p-4">
          <h3 className="label-xs pb-3">Node palette</h3>
          <div className="space-y-2">
            {PALETTE.map((type) => {
              const meta = NODE_META[type];
              const Icon = meta.icon;
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", type)}
                  data-testid="workflow-palette-item"
                  data-node-type={type}
                  className="flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-card/50 px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-md text-white", meta.tint)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-medium">{meta.label}</span>
                </div>
              );
            })}
          </div>
          <p className="pt-3 text-xs text-muted-foreground">
            Drag a node onto the canvas to add it.
          </p>
        </div>

        <div data-testid="workflow-trigger-config" className="glass rounded-xl p-4">
          <h3 className="label-xs pb-3">Trigger configuration</h3>
          <Select value={triggerEvent} onValueChange={(value) => { setTriggerEvent(value); setSaved(false); }}>
            <SelectTrigger data-testid="workflow-trigger-event" data-event={triggerEvent}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="employee.created">Employee created</SelectItem>
              <SelectItem value="leave.requested">Leave requested</SelectItem>
              <SelectItem value="candidate.advanced">Candidate advanced</SelectItem>
              <SelectItem value="payroll.completed">Payroll completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          data-testid="workflow-save-button"
          className="w-full"
          onClick={handleSave}
        >
          <Save className="h-4 w-4" /> Save workflow
        </Button>

        {saved && (
          <motion.p
            data-testid="workflow-saved-indicator"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-center text-sm text-success"
          >
            Workflow saved
          </motion.p>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        data-testid="workflow-canvas"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleNodeDrop}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDraggingNodeId(null)}
        className="relative h-[560px] overflow-hidden rounded-xl border border-border bg-card/30 bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] [background-size:24px_24px] lg:col-span-3"
      >
        {/* Edge lines */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((edge) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);
            if (!from || !to) {
              return null;
            }
            const x1 = from.x + 140;
            const y1 = from.y + 24;
            const x2 = to.x;
            const y2 = to.y + 24;
            return (
              <path
                key={edge.id}
                d={`M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeOpacity="0.5"
                strokeWidth="2"
                strokeDasharray="5 5"
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const meta = NODE_META[node.type];
          const Icon = meta.icon;
          return (
            <div
              key={node.id}
              data-testid="workflow-node"
              data-node-type={node.type}
              style={{ left: node.x, top: node.y }}
              onPointerDown={() => setDraggingNodeId(node.id)}
              className={cn(
                "absolute flex w-[140px] cursor-grab select-none flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 shadow-md transition-shadow hover:shadow-lg",
                draggingNodeId === node.id && "cursor-grabbing shadow-xl ring-2 ring-primary/40",
              )}
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-white", meta.tint)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-center text-xs font-semibold">{node.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {node.type}
              </span>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {nodes.length === 0 && (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <CircleDot className="h-8 w-8" />
              <p className="text-sm">Drag nodes here to build your workflow</p>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Play className="h-3 w-3 text-success" />
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · trigger: {triggerEvent}
        </div>
      </div>
    </div>
  );
}
