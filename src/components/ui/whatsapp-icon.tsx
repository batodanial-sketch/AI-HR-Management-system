"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface WhatsAppIconProps {
  className?: string;
  size?: number;
}

export const WhatsAppIcon = ({ className, size = 24 }: WhatsAppIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4 text-green-500 hover:text-green-600", className)}
    >
      <path d="M22 12.89c-.67 5.64-5.43 10.2-11.76 11-.63.08-1.3.09-1.94.09-1.63 0-3.17-.41-4.43-1.13-1.26-.72-2.17-1.86-2.44-3.22l-.09-.18c-.2-1.14-.33-2.32-.14-3.5.19-1.17.73-2.13 1.54-2.82a4.49 4.49 0 0 1-.6-2.8c0-1.56.63-2.86 1.69-3.78 1.06-.92 2.39-.87 3.56-.34.96.46 1.79 1.22 2.3 2.22a11.69 11.69 0 0 0 2.34.7c2.27.1 4.53-.23 6.45-1.26 2.08-1.11 3.39-2.89 3.47-5.02.07-1.88-.5-3.75-1.46-5.17z" />
    </svg>
  );
};

WhatsAppIcon.displayName = "WhatsAppIcon";