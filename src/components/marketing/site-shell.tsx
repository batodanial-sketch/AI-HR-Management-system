"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SiteShellProps {
  className?: string;
  children: React.ReactNode;
}

export const SiteShell = ({ className, children }: SiteShellProps) => {
  return (
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      {children}
    </div>
  );
};

SiteShell.displayName = "SiteShell";