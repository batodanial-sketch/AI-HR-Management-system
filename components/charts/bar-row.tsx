"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AnalyticsSeries } from "@/lib/types";

/**
 * Horizontal animated bar rows for distribution charts, with a legend and
 * hover feedback. Colors cycle through accessible accent tones so the series
 * is distinguishable beyond color alone (each row also carries its label).
 */

const ROW_TONES = [
  "bg-primary",
  "bg-accent",
  "bg-success",
  "bg-warning",
  "bg-destructive",
  "bg-secondary",
];

export function BarRow({
  label,
  value,
  max,
  index,
  colorClassName,
}: {
  label: string;
  value: number;
  max: number;
  index: number;
  colorClassName?: string;
}) {
  const [hovered, setHovered] = React.useState(false);
  const percent = max > 0 ? (value / max) * 100 : 0;

  return (
    <div
      className="flex items-center gap-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
        {label}
      </span>
      <div
        className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/70"
        role="img"
        aria-label={`${label}: ${value}%`}
      >
        <motion.div
          className={cn(
            "h-full rounded-md transition-opacity",
            colorClassName ?? ROW_TONES[index % ROW_TONES.length],
            hovered ? "opacity-100" : "opacity-80",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.7, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">
        {value}%
      </span>
    </div>
  );
}

export function DistributionChart({ data }: { data: AnalyticsSeries[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((item, index) => (
        <BarRow key={item.label} label={item.label} value={item.value} max={max} index={index} />
      ))}
    </div>
  );
}
