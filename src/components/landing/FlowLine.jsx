import React from "react";
import { motion } from "framer-motion";

export default function FlowLine() {
  return (
    <div className="fixed left-8 top-0 bottom-0 z-30 pointer-events-none hidden lg:block">
      <div className="relative w-px h-full bg-border/40">
        <motion.div
          className="absolute top-0 left-0 w-px bg-primary"
          initial={{ height: "0%" }}
          animate={{ height: "100%" }}
          transition={{ duration: 8, ease: "linear", repeat: Infinity }}
          style={{ opacity: 0.4 }}
        />
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary"
          animate={{ y: ["0vh", "100vh"] }}
          transition={{ duration: 8, ease: "linear", repeat: Infinity }}
          style={{ opacity: 0.6 }}
        />
      </div>
    </div>
  );
}