"use client";

import React from "react";

interface SettingsShellProps {
  user: any;
  organization: any;
  members: any;
  headcount: number;
}

export function SettingsShell({ user, organization, members, headcount }: SettingsShellProps) {
  return (
    <div className="p-4 border rounded-lg">
      <p>Settings Shell</p>
      <p>Headcount: {headcount}</p>
    </div>
  );
}

export default SettingsShell;