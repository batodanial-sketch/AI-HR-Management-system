import React, { useState, useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { ArrowRight, Sparkles, Zap, Globe, Cpu, Activity, Shield, Database } from "lucide-react";
import RefractiveSphere from "./RefractiveSphere";
import FluxentraLogo from "./FluxentraLogo";

const WORDS = ["Automate.", "Orchestrate.", "Dominate.", "Evolve."];

export default function HeroSection() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);
  const [clicked, setClicked] = useState(false);
  const sectionRef = useRef(null);

  // Rotating tagline words
  useEffect(() => {
    const t = setInterval(() => setWordIdx((i) => (i + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const progress = Math.min(window.scrollY / window.innerHeight, 1);
      setScrollProgress(progress);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Parallax mouse tilt on sphere container
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const springX = useSpring(mx, { stiffness: 80, damping: 20 });
  const springY = useSpring(my, { stiffness: 80, damping: 20 });
  const rotateY = useTransform(springX, [-1, 1], [-12, 12]);
  const rotateX = useTransform(springY, [-1, 1], [8, -8]);

  const handleMouseMove = (e) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set(((e.clientX - rect.left) / rect.width - 0.5) * 2);
    my.set(((e.clientY - rect.top) / rect.height - 0.5) * 2);
  };

  const textOpacity = Math.max(1 - scrollProgress * 2.2, 0);
  const textY = scrollProgress * 60;

  const statusLabel =
    scrollProgress < 0.01
      ? "AI Automation Agency"
      : scrollProgress < 0.5
      ? "Systems Awakening..."
      : "FLUXENTIQ ACTIVE";

  const handleCTAClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 700);
    document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-24 pb-16"
    >
      {/* Animated grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Scroll-linked radial glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-300"
        style={{
          background: `radial-gradient(ellipse 60% 60% at 70% 50%, rgba(93,63,211,${0.04 + scrollProgress * 0.14}) 0%, transparent 70%)`,
        }}
      />

      {/* Floating particles */}
      {[...Array(18)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-primary pointer-events-none"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            opacity: 0.15 + Math.random() * 0.2,
          }}
          animate={{
            y: [0, -30 - Math.random() * 40, 0],
            x: [0, (Math.random() - 0.5) * 30, 0],
            opacity: [0.1, 0.4, 0.1],
          }}
          transition={{
            duration: 4 + Math.random() * 6,
            repeat: Infinity,
            delay: Math.random() * 4,
            ease: "easeInOut",
          }}
        />
      ))}

      <div className="relative z-10 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          {/* ── Left content ── */}
          <div style={{ opacity: textOpacity, transform: `translateY(${textY}px)` }}>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Logo badge row */}
              <div className="flex items-center gap-3 mb-6">
                <FluxentraLogo size={44} animated={true} />
                <div className="flex flex-col">
                  <motion.div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10"
                    whileHover={{ scale: 1.04, backgroundColor: "rgba(93,63,211,0.1)" }}
                  >
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkles size={12} className="text-primary" />
                    </motion.div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
                      {statusLabel}
                    </span>
                  </motion.div>
                  {/* Live system status */}
                  <div className="flex items-center gap-2 mt-1.5 px-1">
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-green-400"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    <span className="text-[9px] font-mono text-muted-foreground/70 uppercase tracking-widest">
                      SYS ONLINE · v2.4.1 · 99.97% UPTIME
                    </span>
                  </div>
                </div>
              </div>

              {/* Main headline with stagger */}
              <div className="overflow-hidden">
                <motion.h1
                  className="font-heading font-black text-foreground leading-[0.93] tracking-tight"
                  style={{ fontSize: "clamp(3.2rem, 7.5vw, 7.5rem)" }}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="flux-skew" style={{ display: "inline-block" }}>FLUX<span className="text-primary">ENTIQ</span></span>
                </motion.h1>
              </div>

              {/* Animated rotating word */}
              <div className="mt-3 h-12 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={wordIdx}
                    initial={{ y: 48, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -48, opacity: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="font-heading font-black text-3xl md:text-4xl text-primary"
                    style={{ fontSize: "clamp(1.6rem, 3.5vw, 3rem)" }}
                  >
                    <span className="flux-skew">{WORDS[wordIdx]}</span>
                  </motion.div>
                </AnimatePresence>
              </div>

              <motion.p
                className="mt-6 text-lg text-muted-foreground font-heading font-light leading-relaxed max-w-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                We engineer intelligent automation systems that transform how enterprises operate.
                From LLM integration to end-to-end workflow orchestration.
              </motion.p>
            </motion.div>

            {/* Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.65 }}
              className="flex flex-wrap items-center gap-4 mt-8"
            >
              <motion.button
                onClick={handleCTAClick}
                whileHover={{ scale: 1.04, boxShadow: "0 0 32px rgba(93,63,211,0.4)" }}
                whileTap={{ scale: 0.96 }}
                animate={clicked ? { scale: [1, 1.08, 0.95, 1] } : {}}
                className="group relative flex items-center gap-3 px-7 py-4 bg-primary text-primary-foreground font-heading font-semibold rounded-2xl overflow-hidden"
              >
                {/* Ripple shimmer */}
                <motion.span
                  className="absolute inset-0 bg-white/10 rounded-2xl"
                  initial={{ scaleX: 0, originX: 0 }}
                  whileHover={{ scaleX: 1 }}
                  transition={{ duration: 0.4 }}
                />
                <span className="relative z-10">Start Automation Audit</span>
                <motion.div
                  className="relative z-10"
                  animate={{ x: [0, 3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight size={18} />
                </motion.div>
              </motion.button>

              <motion.button
                onClick={() => document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" })}
                whileHover={{ scale: 1.03, borderColor: "hsl(var(--primary))" }}
                whileTap={{ scale: 0.97 }}
                className="px-7 py-4 font-heading font-medium text-foreground rounded-2xl border border-border transition-all"
              >
                Explore Services
              </motion.button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.9 }}
              className="flex gap-10 pt-8"
            >
              {[
                { value: "400%", label: "AVG EFFICIENCY GAIN" },
                { value: "12K+", label: "HOURS SAVED" },
                { value: "98%", label: "CLIENT RETENTION" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  whileHover={{ scale: 1.06, y: -2 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="cursor-default"
                >
                  <div className="text-2xl font-heading font-black text-foreground">{stat.value}</div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mt-1">
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Floating tech badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="flex gap-2 mt-6 flex-wrap"
            >
              {[
                { IconComp: Cpu, label: "LLM" },
                { IconComp: Globe, label: "Agents" },
                { IconComp: Zap, label: "Automation" },
                { IconComp: Shield, label: "SOC2" },
                { IconComp: Database, label: "RAG" },
                { IconComp: Activity, label: "Real-Time" },
              ].map((item) => (
                <motion.span
                  key={item.label}
                  whileHover={{ scale: 1.08, backgroundColor: "rgba(93,63,211,0.12)" }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10 text-[10px] font-mono font-bold uppercase tracking-widest text-primary cursor-default"
                >
                  <item.IconComp size={11} />
                  {item.label}
                </motion.span>
              ))}
            </motion.div>
          </div>

          {/* ── Right: 3D Sphere with parallax tilt ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.3, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ rotateY, rotateX, transformPerspective: 900 }}
            className="relative flex items-center justify-center"
          >
            <div className="relative w-full max-w-lg mx-auto aspect-square">
              <div
                className="absolute inset-0 rounded-full blur-3xl transition-all duration-500"
                style={{
                  background: `radial-gradient(circle, rgba(93,63,211,${0.07 + scrollProgress * 0.25}) 0%, transparent 70%)`,
                  transform: `scale(${1 + scrollProgress * 0.3})`,
                }}
              />

              <div className="relative w-full h-full">
                <RefractiveSphere scrollProgress={scrollProgress} />
              </div>

              {/* Orbiting data chips */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 pointer-events-none"
              >
                <div
                  className="absolute glass-surface rounded-xl px-4 py-2 shadow-lg"
                  style={{ top: "6%", right: "-4%" }}
                >
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
                    {scrollProgress > 0.5 ? "FIQ ACTIVE" : "LLM READY"}
                  </span>
                </div>
              </motion.div>

              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 pointer-events-none"
              >
                <div
                  className="absolute glass-surface rounded-xl px-4 py-2 shadow-lg"
                  style={{ bottom: "6%", left: "-4%" }}
                >
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground">
                    {scrollProgress > 0.5 ? "∞ SYNC" : "LIVE SYNC"}
                  </span>
                </div>
              </motion.div>

              {/* Terminal readout */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.7 }}
                className="absolute -bottom-10 right-0 glass-surface rounded-2xl px-5 py-4 shadow-xl w-56 pointer-events-none"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-[8px] font-mono text-muted-foreground/60 ml-1 uppercase tracking-widest">fiq.terminal</span>
                </div>
                {["› init llm_pipeline", "› loading embeddings...", "› status: READY ✓"].map((line, i) => (
                  <motion.div
                    key={line}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.7 + i * 0.35, duration: 0.4 }}
                    className={`text-[9px] font-mono ${i === 2 ? "text-green-400" : "text-muted-foreground/70"} leading-relaxed`}
                  >
                    {line}
                  </motion.div>
                ))}
                <motion.span
                  className="inline-block w-1.5 h-3 bg-primary/70 ml-0.5 rounded-sm"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              </motion.div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* Scroll hint */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        animate={{ opacity: scrollProgress > 0.05 ? 0 : 1, y: scrollProgress > 0.05 ? 10 : 0 }}
        transition={{ duration: 0.3 }}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Scroll to awaken
        </span>
        <motion.div
          className="w-px h-10 bg-gradient-to-b from-primary/60 to-transparent"
          animate={{ scaleY: [1, 0.5, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      </motion.div>
    </section>
  );
}