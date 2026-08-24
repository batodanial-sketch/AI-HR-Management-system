"use client";

import * as React from "react";
import dynamic from "next/dynamic";

/**
 * Marketing hero visual — the WebGL scene, lazy-loaded client-side and wrapped
 * in an error boundary so a WebGL-unavailable environment degrades gracefully
 * to a token-driven CSS gradient instead of crashing the page.
 */

const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => <HeroFallback />,
});

interface SceneErrorBoundaryProps {
  children: React.ReactNode;
}

interface SceneErrorBoundaryState {
  failed: boolean;
}

class SceneErrorBoundary extends React.Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  override state: SceneErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return <HeroFallback />;
    }
    return this.props.children;
  }
}

/** Token-driven gradient fallback (theme-reactive, zero WebGL). */
function HeroFallback() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(60rem 40rem at 50% 0%, hsl(var(--primary) / 0.18), transparent 60%), radial-gradient(40rem 30rem at 80% 100%, hsl(var(--primary) / 0.10), transparent 55%), hsl(var(--background))",
      }}
    />
  );
}

export function HeroVisual() {
  return (
    <div
      aria-label="Fluxentiq 3D hero visual"
      className="relative h-72 w-full overflow-hidden rounded-2xl border border-border/60 md:h-96"
    >
      <HeroFallback />
      <SceneErrorBoundary>
        <div className="absolute inset-0">
          <HeroScene />
        </div>
      </SceneErrorBoundary>
    </div>
  );
}
