"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface StatusChipProps {
  variant?: "default" | "secondary" | "destructive" | "outline";
  value?: string | number;
  className?: string;
  children?: React.ReactNode;
}

export const StatusChip = ({
  variant = "default",
  value,
  className,
  children,
}: StatusChipProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variant === "default" &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" &&
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        variant === "destructive" &&
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        variant === "outline" &&
          "border border-input hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {children || value}
    </span>
  );
};

StatusChip.displayName = "StatusChip";