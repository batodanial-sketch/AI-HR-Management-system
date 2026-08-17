import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { TrendingUp, Clock, Zap, BarChart3 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const iconMap = [TrendingUp, Clock, Zap, BarChart3];

export default function ResultsSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const headerY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  const { data: caseStudies = [] } = useQuery({
    queryKey: ["CaseStudy"],
    queryFn: () => base44.entities.CaseStudy.list("order", 50),
  });

  return (
    <section id="results" ref={ref} className="py-32 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          style={{ y: headerY }}
          className="mb-16"
        >
          <motion.span
            className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary block mb-2"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            The Intelligence Ledger
          </motion.span>
          <motion.h2
            className="font-heading font-black text-4xl md:text-6xl text-foreground tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="flux-skew">Proven Results</span>
          </motion.h2>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[200px]">
          {caseStudies.map((study, i) => {
            const Icon = iconMap[i % iconMap.length];
            const isLarge = study.size === "large";
            return (
              <motion.div
                key={study.id || i}
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{
                  y: -6,
                  boxShadow: "0 20px 60px rgba(93,63,211,0.15)",
                  borderColor: "rgba(93,63,211,0.4)",
                }}
                className={`group relative rounded-3xl overflow-hidden border border-border transition-colors duration-300 cursor-pointer ${
                  isLarge ? "lg:col-span-2 row-span-2" : "col-span-1 row-span-1"
                }`}
              >

                {/* Hover glow overlay */}
                <motion.div
                  className="absolute inset-0 bg-primary/[0.04] pointer-events-none"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                />

                <div className={`relative h-full flex flex-col justify-between ${isLarge ? "p-8" : "p-6"} bg-card/80 backdrop-blur-sm`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                        {study.company}
                      </div>
                      {study.industry && (
                        <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                          {study.industry}
                        </div>
                      )}
                    </div>
                    <motion.div
                      className="p-2 rounded-xl bg-primary/5"
                      whileHover={{ scale: 1.15, rotate: 8, backgroundColor: "rgba(93,63,211,0.12)" }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Icon size={16} className="text-primary" />
                    </motion.div>
                  </div>

                  <div>
                    <motion.div
                      className={`font-heading font-black text-foreground ${isLarge ? "text-5xl md:text-6xl" : "text-3xl"}`}
                      whileHover={{ scale: 1.04, color: "hsl(var(--primary))" }}
                      transition={{ duration: 0.2 }}
                    >
                      {study.metric}
                    </motion.div>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary mt-2">
                      {study.metricLabel}
                    </div>
                    {isLarge && (
                      <p className="text-sm font-heading text-muted-foreground mt-3 max-w-md leading-relaxed">
                        {study.description}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}