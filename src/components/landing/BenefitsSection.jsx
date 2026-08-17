import React, { useEffect, useRef, useState } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";

const metrics = [
  { value: 95, suffix: "%", label: "Operational Efficiency" },
  { value: 24, suffix: "/7", label: "AI Assistance Availability" },
  { value: 500, suffix: "+", label: "Data Insights Monthly" },
  { value: 10, suffix: "x", label: "Business Scalability" },
];

function CountUp({ target, suffix, duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let startTime = null;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      setCount(Math.round(easeOut(progress) * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, duration]);

  return <span ref={ref} className="tabular-nums">{count}{suffix}</span>;
}

export default function BenefitsSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.12, 1.0]);

  return (
    <section id="benefits" ref={ref} className="py-32 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
            Powerful Benefits
          </span>
          <h2 className="font-heading font-black text-4xl md:text-6xl text-foreground mt-3 tracking-tight">
            <span className="flux-skew">Experience the Impact of<br />
            <span className="text-primary">Intelligent Automation</span></span>
          </h2>
          <p className="mt-4 text-base font-heading text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Custom AI-powered systems that automate, optimize, and scale your business operations.
          </p>
        </motion.div>

        {/* Animated metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {metrics.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -8, boxShadow: "0 20px 60px rgba(93,63,211,0.12)", borderColor: "rgba(93,63,211,0.3)" }}
              className="text-center p-8 rounded-3xl border border-border bg-card cursor-default transition-colors duration-200"
            >
              <motion.div
                className="text-4xl md:text-5xl font-heading font-black text-primary"
                whileHover={{ scale: 1.06 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <CountUp target={m.value} suffix={m.suffix} />
              </motion.div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-muted-foreground mt-3">
                {m.label}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom feature block */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="grid lg:grid-cols-2 gap-0 items-stretch rounded-3xl border border-border bg-card overflow-hidden"
        >
          <div className="p-10 lg:p-14">
            <motion.h3
              className="font-heading font-black text-3xl text-foreground mb-4"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              Smarter Systems.<br />
              <span className="text-primary">Stronger Results.</span>
            </motion.h3>
            <motion.p
              className="text-base font-heading text-muted-foreground leading-relaxed mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              Every feature, automation, and analytic tool we create is built to simplify your workflow,
              improve accuracy, and deliver measurable results for your business.
            </motion.p>
            <motion.button
              onClick={() => document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" })}
              whileHover={{ scale: 1.04, boxShadow: "0 0 28px rgba(93,63,211,0.35)" }}
              whileTap={{ scale: 0.97 }}
              className="group relative inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-heading font-semibold rounded-xl overflow-hidden"
            >
              <motion.span
                className="absolute inset-0 bg-white/10"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.5 }}
              />
              <span className="relative z-10">View Our Services</span>
              <motion.div
                className="relative z-10"
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowRight size={16} />
              </motion.div>
            </motion.button>
          </div>

          <div className="relative h-72 lg:h-auto min-h-[320px] overflow-hidden">
            <motion.img
              src="https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80"
              alt="AI benefits"
              style={{ scale: imgScale }}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-l from-transparent to-card/20" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}