import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
        <Compass className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="text-4xl font-extrabold tracking-tight">404</h1>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">
          <Home className="h-4 w-4" /> Back to dashboard
        </Link>
      </Button>
    </div>
  );
}
