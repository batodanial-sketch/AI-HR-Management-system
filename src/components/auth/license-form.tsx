"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const LicenseForm = () => {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">License Key</label>
        <Input placeholder="Enter license key" />
      </div>
      <Button className="w-full">Activate License</Button>
    </div>
  );
};

LicenseForm.displayName = "LicenseForm";