"use client";

import React from "react";

export function LicenseWidget({ headcount }: { headcount: number }) {
  return (
    <div className="p-4 border rounded-lg">
      <p>License information placeholder.</p>
      <p>Headcount: {headcount}</p>
    </div>
  );
}

export default LicenseWidget;