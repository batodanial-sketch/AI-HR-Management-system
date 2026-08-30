"use client";

import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { Box, MeshStandardMaterial } from "@react-three/drei";
import { cn } from "@/lib/utils";

interface HeroVisualProps {
  className?: string;
}

export const HeroVisual = ({ className }: HeroVisualProps) => {
  return (
    <div className={cn("w-full h-96 relative", className)}>
      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Box position={[0, 0, 0]}>
          <MeshStandardMaterial color={"#3b82f6"} roughness={0.2} metalness={0.8} />
        </Box>
      </Canvas>
    </div>
  );
};

HeroVisual.displayName = "HeroVisual";