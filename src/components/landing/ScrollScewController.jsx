import React, { useEffect } from "react";

/**
 * Nothin-style scroll-velocity skew: any element with the `flux-skew` class
 * tilts skewX based on how fast the page is scrolling, then springs back.
 * Applied only to tagged text spans, so framer-motion entrance animations
 * on parent headings are never disturbed.
 */
export default function ScrollSkewController({ selector = ".flux-skew", max = 7 }) {
  useEffect(() => {
    let velocity = 0;
    let current = 0;
    let lastY = window.scrollY;
    let raf;

    const onScroll = () => {
      velocity = window.scrollY - lastY;
      lastY = window.scrollY;
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const target = Math.max(-max, Math.min(max, velocity * 0.12));
      current += (target - current) * 0.12;
      velocity *= 0.84;
      const els = document.querySelectorAll(selector);
      els.forEach((el) => {
        el.style.transform = `skewX(${current.toFixed(2)}deg)`;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [selector, max]);

  return null;
}