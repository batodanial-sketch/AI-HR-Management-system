"use client";

import * as React from "react";
import { motion } from "framer-motion";
import type { AnalyticsSeries } from "@/lib/types";

/**
 * Vertical column chart with animated bars, value labels, a baseline, and
 * hover tooltips (Pro Max #10: charts need tooltips + labels, never color
 * alone).
 */
export function ColumnChart({
  data,
  unit = "",
  valueFormatter = (value: number) => String(value),
}: {
  data: AnalyticsSeries[];
  unit?: string;
  valueFormatter?: (value: number) => string;
}) {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div role="img" aria-label="Bar chart" className="flex h-48 items-end gap-2 sm:gap-3">
      {data.map((item, index) => {
        const height = (item.value / max) * 100;
        const active = hovered === index;
        return (
          <div
            key={item.label}
            className="group relative flex flex-1 flex-col items-center justify-end gap-1.5"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
            tabIndex={0}
            aria-label={`${item.label}: ${valueFormatter(item.value)}${unit}`}
          >
            {/* Tooltip */}
            {active && (
              <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <span className="font-semibold">{valueFormatter(item.value)}</span>
                {unit && <span className="text-muted-foreground"> {unit}</span>}
              </div>
            )}
            <span
              className={`text-[10px] font-semibold tabular-nums transition-colors ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {valueFormatter(item.value)}
            </span>
            <motion.div
              className={`w-full rounded-t-md bg-gradient-to-t from-primary/70 to-primary transition-opacity ${
                active ? "opacity-100" : "opacity-90"
              }`}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ duration: 0.6, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className={`text-[10px] ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
