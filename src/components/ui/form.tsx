"use client";
import * as React from "react";
import { FormProvider } from "react-hook-form";

export const Form = FormProvider;
export const FormField = ({ render, ...props }: any) => render(props);
export const FormItem = ({ children, className }: any) => <div className={className}>{children}</div>;
export const FormLabel = ({ children, className }: any) => <label className={className}>{children}</label>;
export const FormControl = ({ children }: any) => <>{children}</>;
export const FormDescription = ({ children, className }: any) => <p className={className}>{children}</p>;
export const FormMessage = ({ children }: any) => <span className="text-red-500 text-xs">{children}</span>;
export const useFormField = () => ({ id: "field-id" });
