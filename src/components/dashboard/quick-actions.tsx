"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus, User, FileText } from "lucide-react";

export const QuickActions = () => {
  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      <Button variant="outline" size="sm">
        <Plus className="h-4 w-4 mr-2" />
        Add Employee
      </Button>
      <Button variant="outline" size="sm">
        <User className="h-4 w-4 mr-2" />
        View Profile
      </Button>
      <Button variant="outline" size="sm">
        <FileText className="h-4 w-4 mr-2" />
        Generate Report
      </Button>
    </div>
  );
};

QuickActions.displayName = "QuickActions";