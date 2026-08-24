"use client";

import { cn } from "@/lib/utils";

/**
 * Dependency-free SVG sparkline. Renders a smooth line from a numeric series
 * with an optional area gradient fill.
 */
export function Sparkline({
  data,
  className,
  strokeClassName = "stroke-primary",
  fillClassName = "fill-primary/15",
  width = 120,
  height = 40,
}: {
  data: number[];
  className?: string;
  strokeClassName?: string;
  fillClassName?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return null;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data.map((value, index) => {
    const x = pad + (index / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return { x, y };
  });

  const linePath = points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
    )
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1]?.x} ${height} L ${
    points[0]?.x
  } ${height} Z`;

  const gradientId = `spark-${strokeClassName.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-10 w-full", className)}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={fillClassName} stopOpacity="1" />
          <stop offset="100%" className={fillClassName} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        className={strokeClassName}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
