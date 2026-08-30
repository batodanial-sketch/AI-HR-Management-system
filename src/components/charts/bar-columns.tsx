"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface BarColumnsProps {
  data: { name: string; value: number }[];
  className?: string;
  height?: number;
}

export const BarColumns = ({ data, className, height = 200 }: BarColumnsProps) => {
  if (!data.length) return null;

  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = 40;
  const gap = 10;
  const totalWidth = data.length * barWidth + (data.length - 1) * gap;
  const startX = (100 - (totalWidth / 20)) / 2; // Centering approximation

  return (
    <div className={cn("relative w-full h-[200px]", className)} style={{ height }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {data.map((d, index) => {
          const barHeight = (d.value / maxValue) * 80; // Scale to 80% of container height
          const x = startX + index * (barWidth + gap);
          const y = 100 - barHeight - 10; // Bottom padding

          return (
            <React.Fragment key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                className="fill-blue-500 hover:fill-blue-600 transition-fill"
                rx={2}
              />
              <text
                x={x + barWidth / 2}
                y={95}
                textAnchor="middle"
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

BarColumns.displayName = "BarColumns";