"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;

  title: string;
  description?: string;
  className?: string;
}

export const PageHeader = ({
  title,
  actions,
  description,
  actions,
  className,
  actions,
}: PageHeaderProps) => {
  return (
    <div className={cn("mb-6", className)}>
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
      {description && (
        <p className="mt-2 text-sm text-gray-600">{description}</p>
      )}
    </div>
  );
};

PageHeader.displayName = "PageHeader";