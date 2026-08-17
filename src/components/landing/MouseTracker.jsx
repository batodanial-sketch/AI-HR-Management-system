import React, { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * Global mouse-follow cursor blob + crosshair dot.
 * Sits fixed at z-[9999], pointer-events-none.
 */
export default function MouseTracker() {
  const rawX = useMotionValue(-200);
  const rawY = useMotionValue(-200);

  // Blob lags behind cursor for buttery feel
  const blobX = useSpring(rawX, { stiffness: 60, damping: 18 });
  const blobY = useSpring(rawY, { stiffness: 60, damping: 18 });

  // Dot follows tightly
  const dotX = useSpring(rawX, { stiffness: 400, damping: 28 });
  const dotY = useSpring(rawY, { stiffness: 400, damping: 28 });

  useEffect(() => {
    const move = (e) => {
      rawX.set(e.clientX);
      rawY.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <>
      {/* Soft ambient blob */}
      <motion.div
        className="fixed pointer-events-none z-[9998] rounded-full"
        style={{
          width: 320,
          height: 320,
          x: blobX,
          y: blobY,
          translateX: "-50%",
          translateY: "-50%",
          background: "radial-gradient(circle, rgba(93,63,211,0.07) 0%, transparent 70%)",
          filter: "blur(1px)",
        }}
      />
      {/* Precise dot */}
      <motion.div
        className="fixed pointer-events-none z-[9999] rounded-full mix-blend-difference"
        style={{
          width: 8,
          height: 8,
          x: dotX,
          y: dotY,
          translateX: "-50%",
          translateY: "-50%",
          backgroundColor: "hsl(var(--primary))",
        }}
      />
    </>
  );
}