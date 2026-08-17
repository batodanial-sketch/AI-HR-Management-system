import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Target, Eye, ArrowRight } from "lucide-react";

export default function AboutSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  // Parallax depths
  const imgY = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const textY = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <section id="about" ref={ref} className="py-32 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-4"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">About Us</span>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <motion.div style={{ y: textY }}>
            <motion.h2
              className="font-heading font-black text-4xl md:text-5xl text-foreground leading-tight tracking-tight mb-6"
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="flux-skew">Redefining the Future of Work Through{" "}
              <span className="text-primary">Smarter AI</span></span>
            </motion.h2>
            <motion.p
              className="text-base font-heading text-muted-foreground leading-relaxed mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15, duration: 0.7 }}
            >
              At Fluxentra, we're redefining how businesses operate by integrating AI-powered automation
              into everyday workflows. From automating customer interactions to optimizing pipelines —
              we design intelligent systems that work smarter, faster, and more efficiently.
            </motion.p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                {
                  icon: Target,
                  title: "Our Mission",
                  desc: "To empower businesses through intelligent automation and AI innovation, making complex technology simple, scalable, and impactful.",
                  delay: 0.2,
                },
                {
                  icon: Eye,
                  title: "Our Vision",
                  desc: "To shape a future where AI-driven solutions redefine how businesses operate — creating smarter, faster, more connected experiences.",
                  delay: 0.3,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: item.delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(93,63,211,0.1)" }}
                    className="p-5 rounded-2xl border border-border bg-card cursor-default transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <motion.div
                        className="p-2 rounded-xl bg-primary/5"
                        whileHover={{ scale: 1.15, backgroundColor: "rgba(93,63,211,0.12)" }}
                      >
                        <Icon size={18} className="text-primary" />
                      </motion.div>
                      <h3 className="font-heading font-bold text-foreground">{item.title}</h3>
                    </div>
                    <p className="text-sm font-heading text-muted-foreground leading-relaxed">{item.desc}</p>
                  </motion.div>
                );
              })}
            </div>

            <motion.button
              onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })}
              whileHover={{ scale: 1.04, boxShadow: "0 0 28px rgba(93,63,211,0.35)" }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="group inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-heading font-semibold rounded-xl overflow-hidden relative"
            >
              <motion.span
                className="absolute inset-0 bg-white/10"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.5 }}
              />
              <span className="relative z-10">More About Us</span>
              <motion.div
                className="relative z-10"
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowRight size={16} />
              </motion.div>
            </motion.button>
          </motion.div>

          {/* Right: parallax image */}
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <motion.div
              style={{ y: imgY }}
              className="relative rounded-3xl overflow-hidden aspect-[3/4] max-w-sm mx-auto"
            >
              <img
                src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&q=80"
                alt="Fluxentra team"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 to-transparent" />
            </motion.div>

            {/* Floating cards with entrance stagger */}
            {[
              { label: "Enterprise Clients", value: "50+", pos: "-bottom-6 -right-4" },
              { label: "Avg. Client Rating", value: "5★", pos: "-top-4 -left-4" },
            ].map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, scale: 0.7, y: i === 0 ? 20 : -20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.06, y: -4 }}
                className={`absolute ${card.pos} glass-surface rounded-2xl px-5 py-4 shadow-xl cursor-default`}
              >
                <div className="text-3xl font-heading font-black text-foreground">{card.value}</div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary mt-1">
                  {card.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}