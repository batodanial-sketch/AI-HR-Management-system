import type { Metadata } from "next";
import { LicenseForm } from "@/components/auth/license-form";

export const metadata: Metadata = {
  title: "Activate License",
};

export default function LicensePage() {
  return <LicenseForm />;
}
