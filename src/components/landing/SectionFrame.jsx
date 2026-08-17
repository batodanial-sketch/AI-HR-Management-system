import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

/**
 * Framing wrapper for any landing section.
 * Adds corner bracket SVG frames that draw in on scroll and a subtle
 * scan-line sweep on reveal.
 */
export default function SectionFrame({ children, className = "", id }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px 0px" });

  const bracketVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { pathLength: 1, opacity: 1 },
  };

  return (
    <div ref={ref} id={id} className={`relative ${className}`}>
      {/* Top-left corner bracket */}
      <motion.svg
        className="absolute top-4 left-4 pointer-events-none z-10"
        width="32" height="32" viewBox="0 0 32 32" fill="none"
        aria-hidden
      >
        <motion.path
          d="M32 4 L4 4 L4 32"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.4"
          variants={bracketVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />
      </motion.svg>

      {/* Top-right corner bracket */}
      <motion.svg
        className="absolute top-4 right-4 pointer-events-none z-10"
        width="32" height="32" viewBox="0 0 32 32" fill="none"
        aria-hidden
      >
        <motion.path
          d="M0 4 L28 4 L28 32"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.4"
          variants={bracketVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </motion.svg>

      {/* Bottom-left corner bracket */}
      <motion.svg
        className="absolute bottom-4 left-4 pointer-events-none z-10"
        width="32" height="32" viewBox="0 0 32 32" fill="none"
        aria-hidden
      >
        <motion.path
          d="M32 28 L4 28 L4 0"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.4"
          variants={bracketVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        />
      </motion.svg>

      {/* Bottom-right corner bracket */}
      <motion.svg
        className="absolute bottom-4 right-4 pointer-events-none z-10"
        width="32" height="32" viewBox="0 0 32 32" fill="none"
        aria-hidden
      >
        <motion.path
          d="M0 28 L28 28 L28 0"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.4"
          variants={bracketVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        />
      </motion.svg>

      {/* Scan-line sweep overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-inherit"
        aria-hidden
      >
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
          initial={{ top: "0%", opacity: 0 }}
          animate={inView ? { top: ["0%", "100%"], opacity: [0, 0.8, 0] } : {}}
          transition={{ duration: 1.1, ease: "easeInOut", delay: 0.15 }}
        />
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      >
        {children}
      </motion.div>
    </div>
  );
}