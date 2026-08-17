import React from "react";

/**
 * Seamless infinite marquee using the `.animate-marquee` keyframe.
 * The container holds two identical copies; translating -50% loops cleanly.
 */
export default function Marquee({ children, reverse = false, speed = 30, className = "" }) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        className="flex w-max animate-marquee"
        style={{ animationDuration: `${speed}s`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden>{children}</div>
      </div>
    </div>
  );
}