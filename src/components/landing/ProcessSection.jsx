import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Lightbulb, Rocket, RefreshCw } from "lucide-react";

const steps = [
  {
    icon: Search,
    number: "01",
    title: "Discovery & Audit",
    description: "We map your entire operational landscape to identify the highest-ROI automation opportunities. Deep-dive analysis, stakeholder interviews, and data archaeology.",
    detail: "Deliverables: AI readiness report, ROI projection matrix, quick-win roadmap.",
  },
  {
    icon: Lightbulb,
    number: "02",
    title: "Architecture Design",
    description: "Custom AI system architecture designed for your specific workflows, compliance requirements, and scale. We blueprint before we build.",
    detail: "Deliverables: System architecture diagram, tech stack selection, integration blueprint.",
  },
  {
    icon: Rocket,
    number: "03",
    title: "Build & Deploy",
    description: "Agile implementation with continuous testing. From prototype to production in weeks, not months. Zero disruption to your live systems.",
    detail: "Deliverables: Production-grade system, CI/CD pipeline, staging environment, QA report.",
  },
  {
    icon: RefreshCw,
    number: "04",
    title: "Optimize & Scale",
    description: "Ongoing monitoring, model retraining, and system expansion as your business evolves. We never stop improving.",
    detail: "Deliverables: Monthly performance reports, model drift alerts, scaling playbook.",
  },
];

export default function ProcessSection() {
  const [active, setActive] = useState(null);

  return (
    <section id="process" className="py-32 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-20"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
            How We Work
          </span>
          <h2 className="font-heading font-black text-4xl md:text-6xl text-foreground mt-3 tracking-tight">
            <span className="flux-skew">The Process</span>
          </h2>
        </motion.div>

        {/* Progress line */}
        <div className="relative hidden lg:block mb-4">
          <div className="absolute top-10 left-[12.5%] right-[12.5%] h-px bg-border" />
          <motion.div
            className="absolute top-10 left-[12.5%] h-px bg-primary"
            initial={{ width: 0 }}
            whileInView={{ width: "75%" }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = active === i;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: i * 0.14, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setActive(isActive ? null : i)}
                whileHover={{ y: -6 }}
                className="group relative p-8 rounded-3xl border bg-card cursor-pointer transition-colors duration-300"
                style={{
                  borderColor: isActive ? "hsl(var(--primary) / 0.5)" : undefined,
                  boxShadow: isActive ? "0 8px 40px rgba(93,63,211,0.12)" : undefined,
                }}
              >
                {/* Active glow bg */}
                <motion.div
                  className="absolute inset-0 rounded-3xl bg-primary/[0.04] pointer-events-none"
                  animate={{ opacity: isActive ? 1 : 0 }}
                />

                <div className="flex items-center justify-between mb-8 relative z-10">
                  <motion.div
                    className="p-3 rounded-2xl bg-primary/5"
                    animate={{
                      backgroundColor: isActive ? "rgba(93,63,211,0.15)" : "rgba(93,63,211,0.05)",
                      rotate: isActive ? [0, -8, 8, 0] : 0,
                    }}
                    transition={{ duration: 0.5 }}
                  >
                    <Icon size={24} className="text-primary" />
                  </motion.div>
                  <motion.span
                    className="text-5xl font-heading font-black"
                    animate={{ color: isActive ? "rgba(93,63,211,0.2)" : "hsl(var(--border))" }}
                    transition={{ duration: 0.3 }}
                  >
                    {step.number}
                  </motion.span>
                </div>

                <h3 className="font-heading font-bold text-xl text-foreground mb-3 relative z-10">
                  {step.title}
                </h3>
                <p className="text-sm font-heading text-muted-foreground leading-relaxed relative z-10">
                  {step.description}
                </p>

                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden relative z-10"
                    >
                      <div className="pt-3 border-t border-primary/20">
                        <p className="text-xs font-mono text-primary leading-relaxed">{step.detail}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}