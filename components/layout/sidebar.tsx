"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { primaryNav, moduleNav, secondaryNav, workspaces } from "./nav-config";

/**
 * Responsive collapsible sidebar with workspace selector and active-route
 * highlighting. Collapsed state is persisted to localStorage.
 */
export function Sidebar({
  appName = "Fluxentiq",
  logoUrl,
}: {
  appName?: string;
  logoUrl?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [workspaceId, setWorkspaceId] = React.useState(workspaces[0]?.id ?? "");

  React.useEffect(() => {
    const stored = window.localStorage.getItem("fluxentiq.sidebar.collapsed");
    setCollapsed(stored === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      window.localStorage.setItem("fluxentiq.sidebar.collapsed", String(!prev));
      return !prev;
    });
  };

  const workspace = workspaces.find((item) => item.id === workspaceId) ?? workspaces[0];

  return (
    <motion.aside
      data-testid="app-sidebar"
      className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border/70 bg-background/70 backdrop-blur-xl md:flex"
      animate={{ width: collapsed ? "4.5rem" : "17rem" }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
    >
      {/* Brand */}
      <div className="flex h-[var(--header-height)] items-center gap-2.5 border-b border-border/70 px-3.5">
        <BrandLogo
          size={32}
          logoUrl={logoUrl}
          alt={`${appName} logo`}
          className="rounded-lg"
        />
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="truncate text-sm font-bold tracking-tight"
          >
            {appName}
          </motion.span>
        )}
      </div>

      {/* Workspace selector */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              data-testid="workspace-selector"
              className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card/50 px-2.5 py-2 text-left transition-colors hover:bg-secondary"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground text-xs font-bold">
                {workspace?.name.charAt(0)}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold leading-tight">
                      {workspace?.name}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {workspace?.plan}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {workspaces.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => setWorkspaceId(item.id)}
                className="flex items-center justify-between"
              >
                <span>{item.name}</span>
                {item.id === workspaceId && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        <NavSection items={primaryNav} pathname={pathname} collapsed={collapsed} />
        <div>
          <NavLabel collapsed={collapsed}>HR modules</NavLabel>
          <NavSection items={moduleNav} pathname={pathname} collapsed={collapsed} />
        </div>
        <div>
          <NavLabel collapsed={collapsed}>Quick access</NavLabel>
          <NavSection items={secondaryNav} pathname={pathname} collapsed={collapsed} />
        </div>
      </nav>

      {/* Collapse control */}
      <div className="border-t border-border/70 p-3">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </motion.aside>
  );
}

function NavLabel({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  if (collapsed) {
    return null;
  }
  return (
    <p className="label-xs px-2.5 pb-2 pt-3">{children}</p>
  );
}

function NavSection({
  items,
  pathname,
  collapsed,
}: {
  items: typeof primaryNav;
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                collapsed && "justify-center",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-accent/80"
                  transition={{ type: "spring", damping: 30, stiffness: 350 }}
                />
              )}
              <Icon
                className={cn(
                  "relative z-10 h-4 w-4 shrink-0",
                  active ? "text-accent-foreground" : "",
                )}
              />
              {!collapsed && (
                <span className="relative z-10 truncate">{item.label}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
