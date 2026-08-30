"use client";

import * as React from "react";

export type ToastProps = {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "default" | "destructive";
};

export type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

export function useToast() {
  return {
    toast: (props: ToastProps) => {
      console.log("Toast:", props);
    },
    dismiss: (toastId?: string) => {},
    toasts: [] as ToasterToast[],
  };
}

export const toast = (props: ToastProps) => {
  console.log("Toast:", props);
};