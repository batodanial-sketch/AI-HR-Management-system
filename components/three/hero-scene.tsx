"use client";

import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  N8AO,
  SelectiveBloom,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import {
  Environment,
  Float,
  Lightformer,
  MeshTransmissionMaterial,
} from "@react-three/drei";
import { easing } from "maath";
import { useSettings } from "@/components/providers";

/**
 * Fluxentiq hero scene — a theme-reactive "liquid glass" torus knot with a
 * cinematic post-processing stack (selective violet bloom, N8AO ambient
 * occlusion, ACES tone mapping, vignette), pointer-tracked tilt and
 * scroll-driven scale/lift.
 *
 * Post-processing (verified against @react-three/postprocessing types):
 *   - SelectiveBloom  — violet glow limited to the knot (selection ref), tuned
 *                       to the brand accent so the glass "shimmers" violet.
 *   - N8AO            — GTAO-style ambient occlusion for contact depth (the
 *                       recommended successor to SSAO; cheaper + higher quality).
 *   - ToneMapping     — ACES filmic curve for a cinematic roll-off.
 *   - Vignette        — subtle edge darkening for frame weighting.
 *
 * Motion:
 *   - pointer tilt    — the knot group rotates toward `state.pointer` (R3F's
 *                       normalized cursor) via maath's framerate-independent
 *                       `easing.dampE`.
 *   - scroll          — `window.scrollY` drives a damped scale-down + upward
 *                       lift, so the hero gracefully recedes as the user scrolls.
 *   - theme           — `easing.dampC` on the scene background color and
 *                       exponential damping on the material's shader uniforms
 *                       (`_transmission`, `roughness`), both flipped by the
 *                       `--3d-*` design tokens on Light/Dark toggle.
 */

/** Framerate-independent exponential smoothing of a shader uniform (scalar). */
function dampUniform(
  uniform: THREE.IUniform,
  target: number,
  smoothTime: number,
  delta: number,
): void {
  const current =
    typeof uniform.value === "number" ? uniform.value : Number(uniform.value) || 0;
  uniform.value = current + (target - current) * (1 - Math.exp(-delta / smoothTime));
}

function readTransmissionUniforms(
  material: React.ElementRef<typeof MeshTransmissionMaterial> | null,
): THREE.ShaderMaterial["uniforms"] | null {
  if (!material) {
    return null;
  }
  // The transmission material is a ShaderMaterial at runtime; `_transmission`
  // and `roughness` live in its uniforms (drei maps the JSX props via accessors).
  return (material as unknown as THREE.ShaderMaterial).uniforms;
}

interface GlassKnotProps {
  knotRef: React.MutableRefObject<THREE.Mesh>;
}

function GlassKnot({ knotRef }: GlassKnotProps) {
  const { theme } = useSettings();
  const dark = theme === "dark";
  const groupRef = React.useRef<THREE.Group>(null);
  const matRef = React.useRef<React.ElementRef<typeof MeshTransmissionMaterial>>(null);
  // Shared scroll value (updated by a passive listener; read in the frame loop).
  const scrollRef = React.useRef(0);

  React.useEffect(() => {
    const onScroll = () => {
      scrollRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1);

    // Auto-rotate the knot itself.
    const mesh = knotRef.current;
    if (mesh) {
      mesh.rotation.x += d * 0.14;
      mesh.rotation.y += d * 0.22;
    }

    // Pointer tilt + scroll scale/lift on the outer group.
    const group = groupRef.current;
    if (group) {
      easing.dampE(group.rotation, [state.pointer.y * 0.35, state.pointer.x * 0.5, 0], 0.4, d);

      const t = THREE.MathUtils.clamp(scrollRef.current / 600, 0, 1);
      const targetScale = THREE.MathUtils.lerp(1.55, 1.0, t);
      easing.damp3(group.scale, [targetScale, targetScale, targetScale], 0.35, d);
      easing.damp(group.position, "y", t * 0.55, 0.35, d);
    }

    // Theme-reactive glass.
    const uniforms = readTransmissionUniforms(matRef.current);
    if (uniforms) {
      dampUniform(uniforms._transmission, dark ? 0.6 : 0.9, 0.35, d);
      dampUniform(uniforms.roughness, dark ? 0.1 : 0.2, 0.35, d);
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={1.4} rotationIntensity={0.4} floatIntensity={1.0}>
        <mesh ref={knotRef} scale={1.55}>
          <torusKnotGeometry args={[1, 0.3, 240, 36]} />
          <MeshTransmissionMaterial
            ref={matRef}
            transmission={0.9}
            thickness={1.4}
            roughness={0.2}
            ior={1.45}
            chromaticAberration={0.08}
            anisotropicBlur={0.4}
            distortion={0.25}
            distortionScale={0.5}
            temporalDistortion={0.12}
            attenuationColor="#7C5CFF"
            attenuationDistance={2.4}
            color="#cfc4ff"
          />
        </mesh>
      </Float>
    </group>
  );
}

function Effects({ knotRef }: { knotRef: React.MutableRefObject<THREE.Mesh> }) {
  return (
    <EffectComposer multisampling={4}>
      <SelectiveBloom
        selection={knotRef}
        intensity={1.25}
        luminanceThreshold={0.08}
        luminanceSmoothing={0.3}
        mipmapBlur
        radius={0.8}
      />
      <N8AO aoRadius={0.6} intensity={1.2} quality="medium" color="#7C5CFF" halfRes />
      <ToneMapping />
      <Vignette eskil={false} offset={0.2} darkness={0.72} />
    </EffectComposer>
  );
}

function ThemeBackground() {
  const { theme } = useSettings();
  const dark = theme === "dark";
  const colorRef = React.useRef<THREE.Color>(null);
  const initial = React.useRef(dark).current;

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    if (colorRef.current) {
      easing.dampC(colorRef.current, dark ? "#020510" : "#f8fafc", 0.35, d);
    }
  });

  return (
    <color
      ref={colorRef}
      attach="background"
      args={[initial ? "#020510" : "#f8fafc"]}
    />
  );
}

export default function HeroScene() {
  // Non-null assertion is intentional: this ref is bound to the `<mesh>` that
  // always renders, and the type (`MutableRefObject<Mesh>`) is what
  // SelectiveBloom's `selection` prop requires.
  const knotRef = React.useRef<THREE.Mesh>(null!);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5], fov: 45 }}
      gl={{ antialias: true }}
    >
      <ThemeBackground />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} />
      <GlassKnot knotRef={knotRef} />
      <Environment resolution={256}>
        <Lightformer
          intensity={4}
          position={[0, 4, -8]}
          scale={[12, 8, 1]}
          color="#7C5CFF"
        />
        <Lightformer
          intensity={1.8}
          position={[-6, 1, -2]}
          rotation-y={Math.PI / 2}
          scale={[40, 2, 1]}
          color="#ffffff"
        />
        <Lightformer
          intensity={1.8}
          position={[6, -1, -2]}
          rotation-y={-Math.PI / 2}
          scale={[40, 2, 1]}
          color="#e8e2ff"
        />
      </Environment>
      <Effects knotRef={knotRef} />
    </Canvas>
  );
}
