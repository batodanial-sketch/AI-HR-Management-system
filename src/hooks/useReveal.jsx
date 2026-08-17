import { useInView } from "framer-motion";
import { useRef } from "react";

/**
 * Returns { ref, isInView } to wire into motion components.
 * Use once=true for entrance animations that don't repeat.
 */
export function useReveal(options = {}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px 0px", ...options });
  return { ref, isInView };
}