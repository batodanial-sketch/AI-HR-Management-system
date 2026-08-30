"use client";

import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere } from "@react-three/drei";
import { cn } from "@/lib/utils";

interface StatusOrbProps {
  className?: string;
  status: "healthy" | "warning" | "error" | "unknown";
}

const StatusOrb = ({ status, className }: StatusOrbProps) => {
  const meshRef = React.useRef();

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      meshRef.current.rotation.y = time * 0.05;
    }
  });

  const getColor = () => {
    switch (status) {
      case "healthy":
        return "#10b981";
      case "warning":
        return "#f59e0b";
      case "error":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <div className={cn("w-full h-64", className)}>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <OrbitControls enableZoom={false} />
        <mesh ref={meshRef}>
          <Sphere args={[1, 32, 32]} />
          <meshStandardMaterial color={getColor()} roughness={0.3} metalness={0.7} />
        </mesh>
      </Canvas>
    </div>
  );
};

StatusOrb.displayName = "StatusOrb";

export default StatusOrb;