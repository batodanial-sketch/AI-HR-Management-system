"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface BarRowProps {
  data: { name: string; value: number }[];
  className?: string;
  height?: number;
}

export const BarRow = ({ data, className, height = 200 }: BarRowProps) => {
  if (!data.length) return null;

  const maxValue = Math.max(...data.map(d => d.value));
  const barHeight = 20;
  const gap = 10;
  const totalHeight = data.length * barHeight + (data.length - 1) * gap;
  const startY = (100 - (totalHeight / 20)) / 2; // Centering approximation

  return (
    <div className={cn("relative w-full h-[200px]", className)} style={{ height }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {data.map((d, index) => {
          const barWidth = (d.value / maxValue) * 80; // Scale to 80% of container width
          const x = 10; // Left padding
          const y = startY + index * (barHeight + gap);

          return (
            <React.Fragment key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                className="fill-emerald-500 hover:fill-emerald-600 transition-fill"
                rx={2}
              />
              <text
                x={8}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fontSize="10"
                fill="#333"
              >
                {d.name}
              </text>
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
};

BarRow.displayName = "BarRow";