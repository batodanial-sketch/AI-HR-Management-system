"use client";

import * as React from "react";
import { cn } from "@/lib/utils"; // or standard className joiner

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("relative overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScrollArea.displayName = "ScrollArea";
