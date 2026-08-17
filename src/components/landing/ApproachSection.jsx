import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Users, BarChart2, Handshake, RefreshCw, ArrowRight } from "lucide-react";

const pillars = [
  {
    icon: Users,
    title: "Human-Centered Approach",
    desc: "We design AI systems that enhance, not replace, human creativity. Every solution starts with understanding people first.",
  },
  {
    icon: BarChart2,
    title: "Data-Driven Decisions",
    desc: "Our actions are powered by insights. We leverage data analytics to make informed decisions that drive measurable outcomes.",
  },
  {
    icon: Handshake,
    title: "Seamless Collaboration",
    desc: "We work side by side with your team, ensuring transparency, clear communication, and agile execution from concept to completion.",
  },
  {
    icon: RefreshCw,
    title: "Continuous Innovation",
    desc: "Technology evolves fast — and so do we. We constantly refine, adapt, and innovate to keep your systems ahead of the curve.",
  },
];

const featureCards = [
  {
    title: "Smart. Scalable. Strategic.",
    desc: "We design AI solutions that evolve with your goals, delivering automation that grows as your business does.",
  },
  {
    title: "Innovation in Action",
    desc: "Turning ideas into intelligent systems — built for performance, precision, and real-world impact.",
  },
];

export default function ApproachSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], [50, -50]);

  return (
    <section id="approach" ref={ref} className="py-32 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">

        {/* ── AI Vision section ── */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-28">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
              Our Approach
            </span>
            <h2 className="font-heading font-black text-4xl md:text-5xl text-foreground mt-3 tracking-tight leading-tight">
              <span className="flux-skew">Turning{" "}
              <span className="text-primary">AI Vision</span>{" "}
              Into Real‑World Impact</span>
            </h2>
            <p className="mt-5 text-base font-heading text-muted-foreground leading-relaxed max-w-lg">
              Our approach combines innovation, precision, and data-driven execution. We craft automated
              ecosystems that enhance efficiency, scalability, and customer experience.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <motion.button
                onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })}
                whileHover={{ scale: 1.04, boxShadow: "0 0 28px rgba(93,63,211,0.4)" }}
                whileTap={{ scale: 0.97 }}
                className="group relative inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-heading font-semibold rounded-xl overflow-hidden"
              >
                <motion.span
                  className="absolute inset-0 bg-white/10"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.5 }}
                />
                <span className="relative z-10">Start Your AI Journey</span>
                <motion.div
                  className="relative z-10"
                  animate={{ x: [0, 3, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight size={16} />
                </motion.div>
              </motion.button>
              <motion.button
                onClick={() => document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" })}
                whileHover={{ scale: 1.03, borderColor: "hsl(var(--primary))" }}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 font-heading font-medium text-foreground rounded-xl border border-border transition-colors"
              >
                Explore More
              </motion.button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {featureCards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.1 }}
                whileHover={{ y: -5, boxShadow: "0 12px 40px rgba(93,63,211,0.1)" }}
                className="p-6 rounded-2xl border border-border bg-card cursor-default"
              >
                <motion.div
                  className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center mb-4"
                  whileHover={{ scale: 1.12, backgroundColor: "rgba(93,63,211,0.12)" }}
                >
                  <span className="text-lg font-heading font-black text-primary">0{i + 1}</span>
                </motion.div>
                <h3 className="font-heading font-bold text-foreground mb-2">{card.title}</h3>
                <p className="text-sm font-heading text-muted-foreground leading-relaxed">{card.desc}</p>
              </motion.div>
            ))}
            <motion.div
              style={{ y: bgY }}
              className="sm:col-span-2 rounded-2xl overflow-hidden h-40 relative"
            >
              <img
                src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80"
                alt="AI approach"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-primary/30 to-transparent" />
              <div className="absolute bottom-4 left-4">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/90">
                  Intelligent by Design
                </span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ── How We Work pillars ── */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-14"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
            How We Work
          </span>
          <h2 className="font-heading font-black text-4xl md:text-5xl text-foreground mt-3 tracking-tight max-w-3xl mx-auto">
            <span className="flux-skew">Every solution is guided by strategy, powered by AI, designed with purpose.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -6, boxShadow: "0 16px 48px rgba(93,63,211,0.1)" }}
                className="group p-6 rounded-2xl border border-border bg-card cursor-default"
              >
                <motion.div
                  className="p-3 rounded-xl bg-primary/5 inline-flex mb-5"
                  whileHover={{ scale: 1.15, backgroundColor: "rgba(93,63,211,0.12)", rotate: [0, -6, 6, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <Icon size={22} className="text-primary" />
                </motion.div>
                <h3 className="font-heading font-bold text-foreground mb-2">{p.title}</h3>
                <p className="text-sm font-heading text-muted-foreground leading-relaxed">{p.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}