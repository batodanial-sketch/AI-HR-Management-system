import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create Account",
};

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-96 w-full max-w-sm animate-pulse rounded-2xl bg-card/40" />
    </div>
  );
}
