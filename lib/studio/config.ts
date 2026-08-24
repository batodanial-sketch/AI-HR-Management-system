/**
 * Enterprise Studio — default configurations and types (client-safe, no server-only).
 * Separated from `app/actions/studioActions.ts` because "use server" files can only export async functions.
 */

export interface DashboardWidget {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  category?: string;
  config?: Record<string, unknown>;
}

export const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "assets", label: "Assets Overview", enabled: true, order: 0, category: "operations" },
  { id: "attendance", label: "Attendance", enabled: true, order: 1, category: "operations" },
  { id: "payroll", label: "Payroll Summary", enabled: true, order: 2, category: "finance" },
  { id: "ai_copilot", label: "AI Copilot", enabled: true, order: 3, category: "ai" },
  { id: "turnover", label: "Turnover Risk", enabled: true, order: 4, category: "analytics" },
  { id: "recruitment", label: "Recruitment Pipeline", enabled: true, order: 5, category: "hiring" },
  { id: "leave", label: "Leave Requests", enabled: true, order: 6, category: "operations" },
  { id: "performance", label: "Performance Reviews", enabled: true, order: 7, category: "people" },
  { id: "expenses", label: "Expenses", enabled: false, order: 8, category: "finance" },
  { id: "learning", label: "Learning & Compliance", enabled: false, order: 9, category: "people" },
];

export type DashboardWidgetId = (typeof DEFAULT_WIDGETS)[number]["id"];

export interface DynamicField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "date";
  required: boolean;
  description?: string;
  options?: string[];
}

export const DEFAULT_DYNAMIC_FIELDS: DynamicField[] = [
  {
    key: "cost_center",
    label: "Cost Center",
    type: "text",
    required: false,
    description: "Financial cost center code",
    options: [],
  },
  {
    key: "security_clearance",
    label: "Security Clearance",
    type: "select",
    required: false,
    description: "Security clearance level for enterprise compliance",
    options: ["None", "Confidential", "Secret", "Top Secret"],
  },
];

export interface OrganizationConfig {
  organizationId: string;
  dashboardLayout: {
    widgets: DashboardWidget[];
  };
  dynamicSchema: {
    fields: DynamicField[];
  };
  copilotRules: {
    rules: Array<{
      id?: string;
      trigger: string;
      action: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
    }>;
  };
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

export function defaultConfig(organizationId: string): OrganizationConfig {
  return {
    organizationId,
    dashboardLayout: {
      widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })),
    },
    dynamicSchema: {
      fields: DEFAULT_DYNAMIC_FIELDS.map((f) => ({ ...f, options: f.options ? [...f.options] : [] })),
    },
    copilotRules: {
      rules: [],
    },
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
  };
}
