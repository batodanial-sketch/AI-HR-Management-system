"use client";

import * as React from "react";
import dynamic from "next/dynamic";

/**
 * Lazy-loaded, error-tolerant wrapper around the dashboard status orb. Keeps
 * the WebGL canvas out of the shared bundle (First Load JS stays under budget)
 * and degrades to a token-driven gradient if WebGL is unavailable.
 */

const StatusOrb = dynamic(() => import("./status-orb"), {
  ssr: false,
  loading: () => <OrbFallback />,
});

interface OrbBoundaryProps {
  children: React.ReactNode;
}

interface OrbBoundaryState {
  failed: boolean;
}

class OrbBoundary extends React.Component<OrbBoundaryProps, OrbBoundaryState> {
  override state: OrbBoundaryState = { failed: false };

  static getDerivedStateFromError(): OrbBoundaryState {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return <OrbFallback />;
    }
    return this.props.children;
  }
}

function OrbFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-full w-full rounded-full"
      style={{
        background:
          "radial-gradient(circle at 35% 30%, hsl(var(--primary) / 0.5), hsl(var(--primary) / 0.12) 60%, transparent 75%)",
      }}
    />
  );
}

export function StatusOrbClient({ size = 96 }: { size?: number }) {
  return (
    <div
      aria-label="Live system status"
      className="relative shrink-0 rounded-full border border-border/60"
      style={{ width: size, height: size }}
    >
      <OrbFallback />
      <OrbBoundary>
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <StatusOrb />
        </div>
      </OrbBoundary>
    </div>
  );
}
