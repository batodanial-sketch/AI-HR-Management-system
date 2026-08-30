import {
  Bot,
  LayoutDashboard,
  Users,
  UserPlus,
  KanbanSquare,
  CalendarClock,
  Wallet,
  Workflow,
  BarChart3,
  Target,
  Settings,
  Activity,
  Gauge,
  Clock,
  GraduationCap,
  HeartPulse,
  TrendingUp,
  Receipt,
  MessageSquare,
  Route,
  Briefcase,
  LogOut,
  Network,
  Package,
  FolderOpen,
  DollarSign,
  ScrollText,
  ScanSearch,
  Bell,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "AI Copilot", href: "/copilot", icon: Bot },
  { label: "Employees", href: "/employees", icon: Users },
  { label: "Recruitment", href: "/recruitment", icon: KanbanSquare },
  { label: "Lead Intelligence", href: "/leads", icon: Target },
  { label: "Attendance & Leave", href: "/leave", icon: CalendarClock },
  { label: "Payroll", href: "/payroll", icon: Wallet },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Workflows", href: "/workflows/builder", icon: Workflow },
];

/** Extended HR modules merged from the enterprise codebase. */
export const moduleNav: NavItem[] = [
  { label: "Performance", href: "/performance", icon: Gauge },
  { label: "Attendance", href: "/attendance", icon: Clock },
  { label: "Screening", href: "/screening", icon: ScanSearch },
  { label: "Learning", href: "/learning", icon: GraduationCap },
  { label: "Benefits", href: "/benefits", icon: HeartPulse },
  { label: "Equity", href: "/equity", icon: TrendingUp },
  { label: "Expenses", href: "/expenses", icon: Receipt },
  { label: "Surveys", href: "/surveys", icon: MessageSquare },
  { label: "Planning", href: "/planning", icon: Route },
  { label: "Contractors", href: "/contractors", icon: Briefcase },
  { label: "Offboarding", href: "/offboarding", icon: LogOut },
  { label: "Org Chart", href: "/workforce", icon: Network },
  { label: "Assets", href: "/assets", icon: Package },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Compensation", href: "/compensation", icon: DollarSign },
  { label: "Audit Logs", href: "/audit-logs", icon: ScrollText },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Automations", href: "/automations", icon: Zap },
];

export const secondaryNav: NavItem[] = [
  { label: "Copilot", href: "/copilot", icon: Bot },
  { label: "Add Employee", href: "/employees/new", icon: UserPlus },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "System Health", href: "/settings/system", icon: Activity },
];

export interface Workspace {
  id: string;
  name: string;
  plan: string;
}

export const workspaces: Workspace[] = [
  { id: "ws-1", name: "Fluxentiq HQ", plan: "Enterprise" },
  { id: "ws-2", name: "Fluxentiq EMEA", plan: "Enterprise" },
  { id: "ws-3", name: "Fluxentiq APAC", plan: "Growth" },
];
