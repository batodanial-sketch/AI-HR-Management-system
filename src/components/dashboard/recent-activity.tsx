"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface RecentActivityProps {
  className?: string;
}

export const RecentActivity = ({ className }: RecentActivityProps) => {
  const activities = [
    { type: "leave", user: "Sarah Johnson", action: "Submitted leave request", time: "10 min ago" },
    { type: "attendance", user: "Mike Chen", action: "Checked in", time: "25 min ago" },
    { type: "survey", user: "John Doe", action: "Completed pulse survey", time: "1 hour ago" },
  ];

  return (
    <div className={cn("p-4", className)}>
      <h3 className="text-lg font-semibold mb-3">Recent Activity</h3>
      <div className="space-y-3">
        {activities.map((activity, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                {activity.type === "leave" && "L"}
                {activity.type === "attendance" && "A"}
                {activity.type === "survey" && "S"}
              </div>
              <div>
                <p className="text-sm font-medium">{activity.user}</p>
                <p className="text-xs text-muted-foreground">{activity.action}</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

RecentActivity.displayName = "RecentActivity";