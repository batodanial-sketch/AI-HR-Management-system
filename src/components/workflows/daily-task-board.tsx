"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DailyTaskBoardProps {
  className?: string;
}

export const DailyTaskBoard = ({ className }: DailyTaskBoardProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">Daily Task Board</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">Today's Tasks</span>
          <span className="text-sm font-semibold">8</span>
        </div>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">Completed</span>
          <span className="text-sm font-semibold">5</span>
        </div>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">In Progress</span>
          <span className="text-sm font-semibold">2</span>
        </div>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">Pending</span>
          <span className="text-sm font-semibold">1</span>
        </div>
      </div>
    </div>
  );
};

DailyTaskBoard.displayName = "DailyTaskBoard";