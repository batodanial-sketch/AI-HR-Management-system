"use client";

import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { easing } from "maath";
import { useSettings } from "@/components/providers";

/**
 * In-app 3D status orb — a light, single-draw-call glassmorphic accent for the
 * dashboard. Deliberately minimal (one sphere, two lights, no post-processing)
 * so it costs almost nothing on top of the existing dashboard, unlike the
 * marketing hero's full post-processing stack.
 *
 * Theme-reactive: the sphere's base color and the background both damp toward
 * the active Metropolis theme via maath, reading the same CSS-token semantics
 * as the DOM UI (`--accent-primary`, `--bg-*`). Pointer position adds a subtle
 * tilt.
 */

function Orb() {
  const { theme } = useSettings();
  const dark = theme === "dark";
  const group = React.useRef<THREE.Group>(null);
  const bg = React.useRef<THREE.Color>(null);
  const mat = React.useRef<THREE.MeshPhysicalMaterial>(null);
  const initialDark = React.useRef(dark).current;

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1);
    if (group.current) {
      easing.dampE(group.current.rotation, [state.pointer.y * 0.4, state.pointer.x * 0.55, 0], 0.5, d);
    }
    if (bg.current) {
      easing.dampC(bg.current, dark ? "#060816" : "#ffffff", 0.4, d);
    }
    if (mat.current) {
      easing.dampC(mat.current.color, dark ? "#8F73FF" : "#7C5CFF", 0.4, d);
      easing.damp(mat.current, "roughness", dark ? 0.15 : 0.3, 0.4, d);
    }
  });

  return (
    <>
      <color ref={bg} attach="background" args={[initialDark ? "#060816" : "#ffffff"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 3]} intensity={1.6} />
      <group ref={group}>
        <Float speed={1.6} rotationIntensity={0.3} floatIntensity={0.6}>
          <mesh>
            <sphereGeometry args={[1, 48, 48]} />
            <meshPhysicalMaterial
              ref={mat}
              color={initialDark ? "#8F73FF" : "#7C5CFF"}
              roughness={initialDark ? 0.15 : 0.3}
              metalness={0.1}
              clearcoat={0.9}
              clearcoatRoughness={0.2}
            />
          </mesh>
        </Float>
      </group>
    </>
  );
}

export default function StatusOrb() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 3.2], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Orb />
    </Canvas>
  );
}
