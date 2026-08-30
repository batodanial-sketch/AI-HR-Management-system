"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProfileViewProps {
  employee: any;
  className?: string;
}

export const ProfileView = ({ employee, className }: ProfileViewProps) => {
  return (
    <div className={cn("p-4 bg-white rounded-lg shadow-sm", className)}>
      <div className="flex items-center gap-4">
        <img
          src={employee.profileImage || "https://ui-avatars.com/api/?name=John+Doe&background=random"}
          alt="Profile"
          className="w-16 h-16 rounded-full"
        />
        <div>
          <h2 className="text-xl font-bold">{employee.firstName} {employee.lastName}</h2>
          <p className="text-sm text-muted-foreground">{employee.title}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium">Contact Information</p>
        <p className="text-sm">{employee.email}</p>
        {employee.phone && <p className="text-sm">{employee.phone}</p>}
      </div>
    </div>
  );
};

ProfileView.displayName = "ProfileView";