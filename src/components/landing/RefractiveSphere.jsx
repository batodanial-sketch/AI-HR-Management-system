import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * RefractiveSphere — scroll-linked 3D glass sphere
 * Phases:
 *   0%   → idle: slow auto-rotation, cool violet tint
 *   0-40% scroll → "awakening": sphere rotates faster, scale pulses, emissive ramps up
 *   40%+ → "flux mode": full glow, fast spin, chromatic hue shift toward cobalt
 */
export default function RefractiveSphere({ scrollProgress = 0 }) {
  const mountRef = useRef(null);
  const stateRef = useRef({
    scrollProgress: 0,
    mouse: { x: 0, y: 0 },
  });
  const threeRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // ── Scene ──────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const width = el.clientWidth;
    const height = el.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    el.appendChild(renderer.domElement);

    // ── Geometry ──────────────────────────────────────────────
    const geometry = new THREE.IcosahedronGeometry(1, 12);

    // Outer refractive shell — MeshPhysicalMaterial for glass effect
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#c5b8ff"),
      metalness: 0.05,
      roughness: 0.0,
      transmission: 0.95,   // glass transparency
      thickness: 1.2,
      ior: 1.8,              // index of refraction
      reflectivity: 0.9,
      iridescence: 0.6,
      iridescenceIOR: 1.4,
      envMapIntensity: 1.2,
      transparent: true,
      opacity: 0.92,
      emissive: new THREE.Color("#5D3FD3"),
      emissiveIntensity: 0.08,
    });

    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Inner glow core
    const coreGeo = new THREE.SphereGeometry(0.55, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#5D3FD3"),
      transparent: true,
      opacity: 0.18,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // Outer halo ring
    const ringGeo = new THREE.TorusGeometry(1.32, 0.012, 8, 120);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#5D3FD3"),
      transparent: true,
      opacity: 0.25,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.2;
    scene.add(ring);

    // Second tilt ring
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.007, 8, 100),
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#8B65FF"), transparent: true, opacity: 0.15 })
    );
    ring2.rotation.x = Math.PI / 5;
    ring2.rotation.y = Math.PI / 4;
    scene.add(ring2);

    // Wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#5D3FD3"),
      wireframe: true,
      transparent: true,
      opacity: 0.04,
    });
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.01, 4), wireMat);
    scene.add(wire);

    // ── Lights ────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const violet = new THREE.PointLight(0x5D3FD3, 4, 8);
    violet.position.set(-2, 2, 2);
    scene.add(violet);

    const cobalt = new THREE.PointLight(0x1a4fff, 3, 8);
    cobalt.position.set(2, -1, 1);
    scene.add(cobalt);

    const silver = new THREE.PointLight(0xe8eaed, 2, 6);
    silver.position.set(0, 3, -2);
    scene.add(silver);

    // environment map via a simple gradient cube render
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envTexture = pmrem.fromScene(new THREE.Scene()).texture;
    scene.environment = envTexture;
    pmrem.dispose();

    threeRef.current = { renderer, scene, camera, sphere, core, ring, ring2, wire, material, coreMat, ringMat, wireMat };

    // ── Mouse tracking ─────────────────────────────────────────
    const onMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      stateRef.current.mouse.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      stateRef.current.mouse.y = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouseMove);

    // ── Resize ────────────────────────────────────────────────
    const onResize = () => {
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ────────────────────────────────────────
    let rafId;
    let time = 0;
    // lerp helpers
    let rotSpeedX = 0.0015;
    let rotSpeedY = 0.002;
    let currentScale = 1;
    let currentEmissive = 0.08;
    let currentCoreOpacity = 0.18;
    let currentRingOpacity = 0.25;
    let hue = 0.72; // violet in HSL

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      time += 0.01;

      const scroll = stateRef.current.scrollProgress; // 0..1
      const mx = stateRef.current.mouse.x;
      const my = stateRef.current.mouse.y;

      // ── Target values based on scroll phase ──────────────────
      let targetRotSpeedX, targetRotSpeedY, targetScale, targetEmissive, targetCoreOpacity, targetHue;

      if (scroll < 0.01) {
        // Idle
        targetRotSpeedX = 0.0015;
        targetRotSpeedY = 0.002;
        targetScale = 1.0;
        targetEmissive = 0.08;
        targetCoreOpacity = 0.18;
        targetHue = 0.72;
      } else if (scroll < 0.5) {
        // Awakening phase — interpolate
        const t = scroll / 0.5;
        targetRotSpeedX = 0.0015 + t * 0.018;
        targetRotSpeedY = 0.002 + t * 0.024;
        targetScale = 1.0 + Math.sin(time * 3) * 0.025 * t;
        targetEmissive = 0.08 + t * 0.55;
        targetCoreOpacity = 0.18 + t * 0.55;
        targetHue = 0.72 - t * 0.1; // shift toward cobalt
      } else {
        // Flux mode
        const t = Math.min((scroll - 0.5) / 0.5, 1);
        targetRotSpeedX = 0.0195 + t * 0.008;
        targetRotSpeedY = 0.026 + t * 0.01;
        targetScale = 1.0 + Math.sin(time * 4) * 0.04;
        targetEmissive = 0.63 + Math.sin(time * 2) * 0.12;
        targetCoreOpacity = 0.73 + Math.sin(time * 3) * 0.1;
        targetHue = 0.62 - t * 0.05; // deeper cobalt
      }

      // ── Lerp toward targets ───────────────────────────────────
      const lerp = (a, b, t) => a + (b - a) * t;
      rotSpeedX = lerp(rotSpeedX, targetRotSpeedX, 0.04);
      rotSpeedY = lerp(rotSpeedY, targetRotSpeedY, 0.04);
      currentScale = lerp(currentScale, targetScale, 0.06);
      currentEmissive = lerp(currentEmissive, targetEmissive, 0.04);
      currentCoreOpacity = lerp(currentCoreOpacity, targetCoreOpacity, 0.04);
      currentRingOpacity = lerp(currentRingOpacity, Math.min(targetCoreOpacity * 0.45, 0.9), 0.04);
      hue = lerp(hue, targetHue, 0.02);

      // ── Apply to Three.js objects ─────────────────────────────
      sphere.rotation.x += rotSpeedX + my * 0.001;
      sphere.rotation.y += rotSpeedY + mx * 0.001;
      sphere.scale.setScalar(currentScale);

      wire.rotation.x = sphere.rotation.x * 0.6;
      wire.rotation.y = sphere.rotation.y * 0.6;

      ring.rotation.z += 0.003 + scroll * 0.012;
      ring2.rotation.y += 0.004 + scroll * 0.015;
      ring2.rotation.z += 0.002;

      // emissive color in HSL
      material.emissive.setHSL(hue, 0.8, 0.5);
      material.emissiveIntensity = currentEmissive;

      const coreColor = new THREE.Color();
      coreColor.setHSL(hue, 0.75, 0.55);
      coreMat.color = coreColor;
      coreMat.opacity = Math.min(currentCoreOpacity, 0.85);

      ringMat.color.setHSL(hue, 0.78, 0.52);
      ringMat.opacity = Math.min(currentRingOpacity, 0.7);

      // violet light follows mouse softly
      violet.position.x = lerp(violet.position.x, mx * 2.5, 0.05);
      violet.position.y = lerp(violet.position.y, my * 2.5, 0.05);
      violet.intensity = 4 + currentEmissive * 3;

      cobalt.intensity = 3 + currentEmissive * 2;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // ── Sync scrollProgress into ref without re-mounting ─────────
  useEffect(() => {
    stateRef.current.scrollProgress = scrollProgress;
  }, [scrollProgress]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={{ minHeight: 420 }}
    />
  );
}