import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import FluxentraLogo from "./FluxentraLogo";

export default function Footer() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const marqueeSpeed = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <footer ref={ref} className="relative overflow-hidden border-t border-border">
      {/* Marquee */}
      <div className="py-12 overflow-hidden">
        <div className="animate-marquee whitespace-nowrap flex">
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.span
              key={i}
              whileHover={{ color: "hsl(var(--primary))", scale: 1.02 }}
              className="font-heading font-black text-7xl md:text-9xl text-border/60 mx-8 select-none cursor-default transition-colors"
            >
              <span className="flux-skew">FLUXENTIQ</span>
            </motion.span>
          ))}
        </div>
      </div>

      {/* Footer content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <FluxentraLogo size={36} animated={true} />
              <span className="font-heading font-bold text-lg tracking-tight text-foreground">
                FLUX<span className="text-primary">ENTIQ</span>
              </span>
            </div>
            <p className="text-sm font-heading text-muted-foreground leading-relaxed">
              Engineering the future of enterprise AI automation. Based in the cloud, deployed worldwide.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Navigation
            </div>
            <div className="space-y-3">
              {["Services", "Results", "Process", "Contact"].map((item, i) => (
                <motion.button
                  key={item}
                  onClick={() => document.querySelector(`#${item.toLowerCase()}`)?.scrollIntoView({ behavior: "smooth" })}
                  whileHover={{ x: 6, color: "hsl(var(--foreground))" }}
                  transition={{ duration: 0.2 }}
                  className="block text-sm font-heading text-muted-foreground"
                >
                  {item}
                </motion.button>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-4">
              Connect
            </div>
            <div className="space-y-3">
              <motion.p
                whileHover={{ x: 4, color: "hsl(var(--foreground))" }}
                className="text-sm font-heading text-muted-foreground cursor-pointer transition-colors"
              >
                hello@fluxentra.ai
              </motion.p>
              <motion.p
                whileHover={{ x: 4, color: "hsl(var(--foreground))" }}
                className="text-sm font-heading text-muted-foreground cursor-pointer transition-colors"
              >
                LinkedIn · Twitter · GitHub
              </motion.p>
            </div>
          </motion.div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between mt-12 pt-8 border-t border-border gap-4">
          <p className="text-xs font-mono text-muted-foreground">
            © 2026 FLUXENTIQ. ALL RIGHTS RESERVED.
          </p>
          <div className="flex gap-6">
            {["Privacy", "Terms"].map((item) => (
              <motion.span
                key={item}
                whileHover={{ color: "hsl(var(--foreground))", y: -2 }}
                className="text-xs font-mono text-muted-foreground cursor-pointer transition-colors"
              >
                {item}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}